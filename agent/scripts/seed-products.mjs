#!/usr/bin/env node
/*
 * seed-products.mjs
 *
 * Date:    2026-04-22
 * Purpose: Seed the Havn product catalogue on the dev store — 5 heater
 *          products (each with 3 "Größe" variants), their custom metafields
 *          (incl. spec_sections reference), and 5 German collections.
 *
 * IDEMPOTENT & SAFE TO RE-RUN.
 *   - Products are keyed by `handle` via `productByHandle` — skipped if present.
 *   - Collections are keyed by `handle` via `collectionByHandle` — skipped if present.
 *   - Never deletes or modifies anything that already exists. If the merchant
 *     has edited a seeded product/collection in Admin, re-running will leave
 *     it alone. To force a reseed, delete the object in Admin first.
 *
 * Prereqs (created by create-metaobjects.mjs):
 *   - Metaobject type `spec_section` with entries handle=`spec-warum`,
 *     `spec-lieferumfang`, `spec-technik` (looked up at runtime).
 *   - Product metafield definitions under namespace `custom`:
 *       spec_sections, warranty_years, ral_color, connection_type,
 *       width_cm, height_cm, wattage (+ others defined but unused here).
 *
 * Env (loaded from .env.local at repo root):
 *   SHOPIFY_DEV_STORE         e.g. heater-dev.myshopify.com
 *   SHOPIFY_DEV_ADMIN_TOKEN   Admin API access token with
 *                             write_products, write_publications (for publish),
 *                             write_metaobjects (read), write_collections scopes.
 *
 * Run:
 *   node agent/scripts/seed-products.mjs
 *
 * Exits 0 with a summary, 1 on any userErrors / fatal error.
 *
 * Docs referenced:
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/productCreate
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/productVariantsBulkCreate
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metafieldsSet
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/collectionCreate
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/queries/productByHandle
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/queries/collectionByHandle
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/queries/metaobjectByHandle
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_VERSION = '2026-04';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

// ---------------------------------------------------------------------------
// Minimal .env.local parser (matches create-metaobjects.mjs)
// ---------------------------------------------------------------------------

function loadEnvLocal(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvLocal(ENV_PATH);

const SHOP = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;

if (!SHOP || !TOKEN) {
  console.error(
    'FATAL: SHOPIFY_DEV_STORE and SHOPIFY_DEV_ADMIN_TOKEN must be set ' +
      '(via .env.local at repo root or shell env).',
  );
  process.exit(1);
}

const GRAPHQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

// ---------------------------------------------------------------------------
// GraphQL queries + mutations
// ---------------------------------------------------------------------------

// https://shopify.dev/docs/api/admin-graphql/2026-04/queries/productByHandle
const Q_PRODUCT_BY_HANDLE = /* GraphQL */ `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/queries/collectionByHandle
const Q_COLLECTION_BY_HANDLE = /* GraphQL */ `
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
      handle
      title
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/queries/metaobjectByHandle
const Q_METAOBJECT_BY_HANDLE = /* GraphQL */ `
  query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
      type
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/productCreate
// 2026-04 accepts a `ProductCreateInput` plus optional `ProductVariantsBulkInput[]`
// for the first batch of variants created alongside the product.
const M_PRODUCT_CREATE = /* GraphQL */ `
  mutation ProductCreate(
    $product: ProductCreateInput!
    $media: [CreateMediaInput!]
  ) {
    productCreate(product: $product, media: $media) {
      product {
        id
        handle
        title
        options {
          id
          name
          position
          values
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              price
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/productVariantsBulkCreate
const M_PRODUCT_VARIANTS_BULK_CREATE = /* GraphQL */ `
  mutation ProductVariantsBulkCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
    $strategy: ProductVariantsBulkCreateStrategy
  ) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: $strategy
    ) {
      productVariants {
        id
        title
        price
        selectedOptions {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metafieldsSet
const M_METAFIELDS_SET = /* GraphQL */ `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        type
        ownerType
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/collectionCreate
const M_COLLECTION_CREATE = /* GraphQL */ `
  mutation CollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        handle
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(
      `GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`,
    );
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Product catalogue definition
// ---------------------------------------------------------------------------

/*
 * Each product:
 *   - handle       : stable key for idempotency + theme routing
 *   - title        : German customer-facing title
 *   - productType  : drives smart-collection rules below
 *   - tags         : array of tags (also used by smart collections)
 *   - bodyHtml     : 2–3 paragraphs of German marketing copy
 *   - variants     : 3 sizes (label "40×120" etc.) + price in EUR
 *   - repDimensions: representative width/height/wattage for product-level
 *                    metafields (an MVP simplification — per-variant sizing
 *                    would require variant metafields, which we skip here)
 */
const PRODUCTS = [
  {
    handle: 'havn-nord',
    title: 'Havn Nord — Vertikaler Badheizkörper',
    productType: 'Badheizkörper',
    tags: ['badheizkoerper', 'vertikal', 'badezimmer'],
    bodyHtml: `
<p>Der <strong>Havn Nord</strong> ist unser vertikaler Badheizkörper mit klarer, skandinavischer Linienführung. Gefertigt aus hochwertigem Stahl mit hitzebeständiger Pulverbeschichtung in seidenmattem Weiß (RAL 9016) fügt er sich harmonisch in jedes moderne Bad ein und liefert zuverlässig Wärme, wo du sie brauchst.</p>
<p>Durch die vertikale Bauform nutzt der Nord auch schmale Wandflächen optimal — ideal für kleine Bäder, Gäste-WCs oder Nischen neben der Dusche. Der werkseitige Mittelanschluss erlaubt flexible Installation von links oder rechts und vereinfacht den Austausch bestehender Heizkörper erheblich.</p>
<p>Alle Havn Heizkörper kommen mit <strong>10 Jahren Garantie</strong> auf Material und Verarbeitung sowie kostenlosem Versand innerhalb Deutschlands. Lieferung erfolgt inkl. Befestigungsmaterial und Entlüftungsventil — bereit für die Montage durch deinen Fachbetrieb.</p>
    `.trim(),
    variants: [
      { size: '40×120', price: '89.00' },
      { size: '50×140', price: '129.00' },
      { size: '60×180', price: '169.00' },
    ],
    repDimensions: { width_cm: 50, height_cm: 140, wattage: 780 },
  },
  {
    handle: 'havn-fjord',
    title: 'Havn Fjord — Horizontaler Wohnraumheizkörper',
    productType: 'Wohnraumheizkörper',
    tags: ['wohnraumheizkoerper', 'horizontal', 'wohnzimmer'],
    bodyHtml: `
<p>Der <strong>Havn Fjord</strong> ist der Klassiker für Wohnzimmer, Schlafzimmer und Flure. Die horizontale Bauweise passt unter jede Fensterbank und liefert dank doppelter Konvektorbleche und hochwertigem Stahl eine hohe Heizleistung bei kompakten Abmessungen.</p>
<p>Die pulverbeschichtete Oberfläche in RAL 9016 ist kratzfest, pflegeleicht und farbstabil — auch nach Jahren im Dauereinsatz. Der Mittelanschluss sorgt für optisch saubere Installation und ist zu den meisten Standard-Heizungssystemen kompatibel, inklusive Wärmepumpen im Niedertemperaturbetrieb.</p>
<p>Lieferung mit <strong>10 Jahren Herstellergarantie</strong>, kompletten Wandkonsolen und Entlüfter. Zusammen mit dem passenden Thermostatkopf (separat erhältlich) ein vollwertiger Austauschheizkörper für dein nächstes Renovierungsprojekt.</p>
    `.trim(),
    variants: [
      { size: '60×60', price: '99.00' },
      { size: '80×60', price: '139.00' },
      { size: '120×60', price: '199.00' },
    ],
    repDimensions: { width_cm: 80, height_cm: 60, wattage: 920 },
  },
  {
    handle: 'havn-skagen',
    title: 'Havn Skagen — Handtuchwärmer',
    productType: 'Badheizkörper',
    // `handtuchwaermer` tag drives the smart collection of the same handle.
    tags: ['badheizkoerper', 'handtuchwaermer', 'badezimmer'],
    bodyHtml: `
<p>Der <strong>Havn Skagen</strong> ist ein klassischer Handtuchwärmer im Sprossendesign — entwickelt für alle, die aus dem Bad in ein vorgewärmtes Handtuch steigen möchten. Die horizontalen Rundrohre sorgen für gleichmäßige Wärmeverteilung und bieten gleichzeitig ausreichend Ablagefläche für Hand- und Badetücher.</p>
<p>Konstruktion aus nahtlos verschweißtem Stahl, pulverbeschichtet in seidenmattem Weiß (RAL 9016). Dank Mittelanschluss lässt sich der Skagen problemlos gegen einen bestehenden Heizkörper tauschen — ein Fachbetrieb erledigt den Wechsel in der Regel in unter einer Stunde.</p>
<p>Inklusive <strong>10 Jahren Garantie</strong>, Wandhalterungen, Entlüftungsventil und Blindstopfen. Ein elektrischer Heizstab ist als Zubehör erhältlich, falls du den Handtuchwärmer auch außerhalb der Heizperiode nutzen möchtest.</p>
    `.trim(),
    variants: [
      { size: '50×80', price: '79.00' },
      { size: '50×120', price: '109.00' },
      { size: '60×160', price: '149.00' },
    ],
    repDimensions: { width_cm: 50, height_cm: 120, wattage: 540 },
  },
  {
    handle: 'havn-bris',
    title: 'Havn Bris — Kompakter Wohnraumheizkörper',
    productType: 'Wohnraumheizkörper',
    tags: ['wohnraumheizkoerper', 'kompakt'],
    bodyHtml: `
<p>Der <strong>Havn Bris</strong> ist unser Einstiegsmodell — kompakt, effizient und preiswert. Entwickelt für kleinere Räume wie Arbeitszimmer, Abstellkammern oder Hobbyräume, in denen ein dezenter Heizkörper mehr Sinn ergibt als eine großzügige Wärmefläche.</p>
<p>Trotz des günstigen Einstiegspreises verzichten wir nicht auf Qualität: massiver Stahl, Pulverbeschichtung in RAL 9016 und Mittelanschluss für flexible Montage. Die schlanke Bauweise passt auch unter niedrige Fensterbänke oder zwischen Möbel und Wand.</p>
<p>Mit <strong>10 Jahren Herstellergarantie</strong> und der gleichen Materialqualität wie unsere größeren Modelle. Ein solider Alltagsheizkörper, der genau das tut, was er soll — ohne Schnickschnack.</p>
    `.trim(),
    variants: [
      { size: '40×60', price: '69.00' },
      { size: '50×80', price: '89.00' },
      { size: '60×100', price: '119.00' },
    ],
    repDimensions: { width_cm: 50, height_cm: 80, wattage: 610 },
  },
  {
    handle: 'havn-storm',
    title: 'Havn Storm — Großflächen-Heizkörper',
    productType: 'Wohnraumheizkörper',
    tags: ['wohnraumheizkoerper', 'grossflaeche', 'hohe-leistung'],
    bodyHtml: `
<p>Der <strong>Havn Storm</strong> ist unser Schwergewicht für große Räume, Altbauwohnungen und offene Wohnbereiche. Mit bis zu 120 × 160 cm Heizfläche und verdoppelten Konvektorblechen liefert er die Wärmeleistung, die ein Loft oder ein schlecht gedämmter Raum tatsächlich braucht.</p>
<p>Pulverbeschichtet in RAL 9016, aus massivem Stahl gefertigt und mit Mittelanschluss versehen. Dank sauberer Verarbeitung und moderner Linienführung wird der Storm selbst zur Designfläche — und nicht zu einem notwendigen Übel an der Wand.</p>
<p>Lieferung inkl. <strong>10 Jahren Garantie</strong>, verstärkten Wandkonsolen (passend zum höheren Gewicht) und Entlüftungsventil. Empfehlung: Installation durch einen Fachbetrieb, da der Storm je nach Größe über 30 kg wiegen kann.</p>
    `.trim(),
    variants: [
      { size: '80×120', price: '229.00' },
      { size: '100×140', price: '289.00' },
      { size: '120×160', price: '349.00' },
    ],
    repDimensions: { width_cm: 100, height_cm: 140, wattage: 1840 },
  },
];

// ---------------------------------------------------------------------------
// Collection catalogue definition
// ---------------------------------------------------------------------------

/*
 * Smart collections use ruleSet; manual collections omit it. For Shopify
 * 2026-04 the CollectionInput accepts:
 *   - ruleSet.appliedDisjunctively: false = AND, true = OR
 *   - ruleSet.rules[].column       : 'TYPE' | 'TAG' | 'VENDOR' | ...
 *   - ruleSet.rules[].relation     : 'EQUALS' | 'CONTAINS' | ...
 *   - ruleSet.rules[].condition    : string the rule matches against
 * https://shopify.dev/docs/api/admin-graphql/2026-04/input-objects/CollectionInput
 */
const COLLECTIONS = [
  {
    handle: 'badheizkorper',
    title: 'Badheizkörper',
    bodyHtml:
      '<p>Vertikale und horizontale Badheizkörper für jedes Badezimmer — vom Gäste-WC bis zum Familienbad. Alle Modelle mit Mittelanschluss, Pulverbeschichtung und 10 Jahren Garantie.</p>',
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: 'TYPE', relation: 'EQUALS', condition: 'Badheizkörper' },
      ],
    },
  },
  {
    handle: 'wohnraumheizkorper',
    title: 'Wohnraumheizkörper',
    bodyHtml:
      '<p>Heizkörper für Wohn-, Schlaf- und Arbeitszimmer. Horizontale Bauformen in verschiedenen Größen — kompatibel mit modernen Niedertemperatur-Heizsystemen.</p>',
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        {
          column: 'TYPE',
          relation: 'EQUALS',
          condition: 'Wohnraumheizkörper',
        },
      ],
    },
  },
  {
    handle: 'handtuchwaermer',
    title: 'Handtuchwärmer',
    bodyHtml:
      '<p>Klassische Handtuchwärmer im Sprossendesign — für vorgewärmte Handtücher nach dem Duschen und zusätzliche Ablagefläche im Bad.</p>',
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: 'TAG', relation: 'EQUALS', condition: 'handtuchwaermer' },
      ],
    },
  },
  {
    handle: 'austauschheizkorper',
    title: 'Austauschheizkörper',
    bodyHtml:
      '<p>Passgenaue Ersatzheizkörper mit Mittelanschluss für Standard-Bestandsmaße. Ideal für schnelle Renovierungen ohne aufwendige Rohrarbeiten.</p>',
    // Manual collection — no ruleSet, no products for MVP.
  },
  {
    handle: 'zubehoer',
    title: 'Zubehör',
    bodyHtml:
      '<p>Thermostate, Heizstäbe, Anschlussgarnituren und Montagematerial — alles, was du zur Installation und zum Betrieb deines Havn Heizkörpers brauchst.</p>',
    // Manual collection — no ruleSet, no products for MVP.
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a spec_section metaobject by handle. Returns GID or null.
 */
async function findSpecSectionGid(handle) {
  const data = await gql(Q_METAOBJECT_BY_HANDLE, {
    handle: { type: 'spec_section', handle },
  });
  return data.metaobjectByHandle?.id ?? null;
}

/**
 * Fetch GIDs for the three spec_section entries. Missing entries throw —
 * they are a prereq set up by seed-sample-data.mjs.
 */
async function loadSpecSectionGids() {
  const handles = ['spec-warum', 'spec-lieferumfang', 'spec-technik'];
  const gids = [];
  for (const h of handles) {
    const gid = await findSpecSectionGid(h);
    if (!gid) {
      throw new Error(
        `Missing prereq: spec_section metaobject with handle "${h}" not found. ` +
          'Run seed-sample-data.mjs before seeding products.',
      );
    }
    gids.push(gid);
  }
  return gids;
}

async function findProductIdByHandle(handle) {
  const data = await gql(Q_PRODUCT_BY_HANDLE, { handle });
  return data.productByHandle?.id ?? null;
}

async function findCollectionIdByHandle(handle) {
  const data = await gql(Q_COLLECTION_BY_HANDLE, { handle });
  return data.collectionByHandle?.id ?? null;
}

/**
 * Create a product + its 3 size variants in two mutations.
 *
 * 1. productCreate with productOptions=[{name: "Größe", values: [{name: firstSize}]}]
 *    — Shopify auto-creates one placeholder variant for that option value.
 * 2. productVariantsBulkCreate with strategy REMOVE_STANDALONE_VARIANT
 *    adds all 3 real variants (with prices) and removes the placeholder.
 *
 * This keeps us on the two mutations the brief specified and produces a
 * clean product with exactly 3 variants at correct prices.
 *
 * Returns the product GID.
 */
async function createProductWithVariants(product) {
  // Step 1: productCreate with one seed option value (Shopify requires at
  // least one so the option schema is valid).
  // https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/productCreate
  const seedSize = product.variants[0].size;
  const productInput = {
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.bodyHtml,
    vendor: 'Havn',
    productType: product.productType,
    tags: product.tags,
    status: 'ACTIVE',
    productOptions: [
      {
        name: 'Größe',
        values: [{ name: seedSize }],
      },
    ],
  };

  const createData = await gql(M_PRODUCT_CREATE, { product: productInput });
  const { product: created, userErrors: createErrs } = createData.productCreate;
  if (createErrs.length) {
    throw new Error(
      `productCreate(${product.handle}) userErrors: ${JSON.stringify(createErrs)}`,
    );
  }
  console.log(`[create] product:${product.handle} → ${created.id}`);

  // Step 2: productVariantsBulkCreate — supply ALL 3 variants with prices,
  // shipping + inventory flags. Strategy REMOVE_STANDALONE_VARIANT deletes
  // the placeholder variant auto-created by productCreate.
  // https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/productVariantsBulkCreate
  // https://shopify.dev/docs/api/admin-graphql/2026-04/input-objects/ProductVariantsBulkInput
  const variantInputs = product.variants.map((v) => ({
    price: v.price,
    optionValues: [{ optionName: 'Größe', name: v.size }],
    inventoryItem: {
      // requiresShipping=true: physical goods.
      requiresShipping: true,
      tracked: false, // tracksInventoryOnVariants=false per brief
    },
  }));

  const variantsData = await gql(M_PRODUCT_VARIANTS_BULK_CREATE, {
    productId: created.id,
    variants: variantInputs,
    strategy: 'REMOVE_STANDALONE_VARIANT',
  });
  const { productVariants, userErrors: varErrs } =
    variantsData.productVariantsBulkCreate;
  if (varErrs.length) {
    throw new Error(
      `productVariantsBulkCreate(${product.handle}) userErrors: ${JSON.stringify(varErrs)}`,
    );
  }
  console.log(
    `  variants: ${productVariants.map((v) => `${v.title}@€${v.price}`).join(', ')}`,
  );

  return created.id;
}

/**
 * Set the custom.* metafields for a product. Uses metafieldsSet which
 * upserts by (ownerId, namespace, key) — safe to re-run.
 * https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metafieldsSet
 */
async function setProductMetafields(productGid, product, specSectionGids) {
  const metafields = [
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'warranty_years',
      type: 'number_integer',
      value: '10',
    },
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'ral_color',
      type: 'single_line_text_field',
      value: 'RAL 9016',
    },
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'connection_type',
      type: 'single_line_text_field',
      value: 'Mittelanschluss',
    },
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'width_cm',
      type: 'number_decimal',
      value: String(product.repDimensions.width_cm),
    },
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'height_cm',
      type: 'number_decimal',
      value: String(product.repDimensions.height_cm),
    },
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'wattage',
      type: 'number_integer',
      value: String(product.repDimensions.wattage),
    },
    {
      ownerId: productGid,
      namespace: 'custom',
      key: 'spec_sections',
      type: 'list.metaobject_reference',
      // list.metaobject_reference expects a JSON-string array of GIDs.
      value: JSON.stringify(specSectionGids),
    },
  ];

  const data = await gql(M_METAFIELDS_SET, { metafields });
  const { metafields: set, userErrors } = data.metafieldsSet;
  if (userErrors.length) {
    throw new Error(
      `metafieldsSet(${productGid}) userErrors: ${JSON.stringify(userErrors)}`,
    );
  }
  console.log(`  metafields set: ${set.length}`);
}

/**
 * Create a collection. Smart (ruleSet) or manual (no ruleSet) — depends on
 * the definition above.
 * https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/collectionCreate
 */
async function createCollection(collection) {
  const input = {
    title: collection.title,
    handle: collection.handle,
    descriptionHtml: collection.bodyHtml,
    ...(collection.ruleSet ? { ruleSet: collection.ruleSet } : {}),
  };

  const data = await gql(M_COLLECTION_CREATE, { input });
  const { collection: created, userErrors } = data.collectionCreate;
  if (userErrors.length) {
    throw new Error(
      `collectionCreate(${collection.handle}) userErrors: ${JSON.stringify(userErrors)}`,
    );
  }
  console.log(`[create] collection:${collection.handle} → ${created.id}`);
  return created.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `→ Seeding products + collections on ${SHOP} (Admin API ${API_VERSION})`,
  );

  // Prereq: resolve the 3 spec_section GIDs once up front so metafields can
  // reference them.
  const specSectionGids = await loadSpecSectionGids();
  console.log(`Resolved ${specSectionGids.length} spec_section GIDs.`);

  let productsCreated = 0;
  let productsSkipped = 0;
  let collectionsCreated = 0;
  let collectionsSkipped = 0;

  // Pass 1: products
  for (const product of PRODUCTS) {
    const existing = await findProductIdByHandle(product.handle);
    if (existing) {
      console.log(
        `[skip] product:${product.handle} already exists → ${existing}`,
      );
      productsSkipped++;
      continue;
    }
    const gid = await createProductWithVariants(product);
    await setProductMetafields(gid, product, specSectionGids);
    productsCreated++;
  }

  // Pass 2: collections
  for (const collection of COLLECTIONS) {
    const existing = await findCollectionIdByHandle(collection.handle);
    if (existing) {
      console.log(
        `[skip] collection:${collection.handle} already exists → ${existing}`,
      );
      collectionsSkipped++;
      continue;
    }
    await createCollection(collection);
    collectionsCreated++;
  }

  console.log(
    `\nDone. products created: ${productsCreated}, skipped: ${productsSkipped}; ` +
      `collections created: ${collectionsCreated}, skipped: ${collectionsSkipped}`,
  );
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
