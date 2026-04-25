#!/usr/bin/env node
/*
 * create-metaobjects.mjs
 *
 * Date:    2026-04-22
 * Purpose: Create / sync every metaobject + metafield definition documented
 *          in docs/metafields.md against the Shopify dev store using the
 *          Admin GraphQL API (2026-04).
 *
 * IDEMPOTENT & SAFE TO RE-RUN. For every definition it:
 *   1. Queries the Admin API to see if a matching definition already exists
 *      (metaobject by `type`, metafield by `ownerType` + `namespace` + `key`).
 *   2. If it exists, logs a skip line and moves on.
 *   3. If it does not exist, creates it and logs the new GID.
 *
 * A CSM or merchant can re-run this whenever docs/metafields.md changes;
 * only the diff is applied. No destructive operations are performed — this
 * script never updates or deletes existing definitions. If a schema change
 * requires edits or deletions, do them in Admin or add an explicit migration.
 *
 * Env (loaded from .env.local at repo root):
 *   SHOPIFY_DEV_STORE         e.g. heater-dev.myshopify.com
 *   SHOPIFY_DEV_ADMIN_TOKEN   Admin API access token with write_metaobject_definitions
 *                             + write_metafield_definitions scopes.
 *
 * Run:
 *   node agent/scripts/create-metaobjects.mjs
 *
 * Exits 0 on success with a `created / skipped` summary, 1 on fatal error.
 *
 * Docs referenced:
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metaobjectDefinitionCreate
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metafieldDefinitionCreate
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/queries/metaobjectDefinitionByType
 *   - https://shopify.dev/docs/api/admin-graphql/2026-04/queries/metafieldDefinitions
 *   - https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types
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
// Minimal .env.local parser — no dotenv dep required
// ---------------------------------------------------------------------------

/**
 * Parse a dotenv-style file into process.env. Silently ignores missing file
 * (env may already be provided by the shell).
 */
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
    // Strip surrounding single or double quotes.
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
// GraphQL queries + mutations (constants for easy auditing)
// ---------------------------------------------------------------------------

// https://shopify.dev/docs/api/admin-graphql/2026-04/queries/metaobjectDefinitionByType
const Q_METAOBJECT_DEFINITION_BY_TYPE = /* GraphQL */ `
  query MetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      name
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/queries/metafieldDefinitions
const Q_METAFIELD_DEFINITIONS = /* GraphQL */ `
  query MetafieldDefinitions(
    $ownerType: MetafieldOwnerType!
    $namespace: String!
    $key: String!
  ) {
    metafieldDefinitions(
      first: 1
      ownerType: $ownerType
      namespace: $namespace
      key: $key
    ) {
      edges {
        node {
          id
          namespace
          key
          name
          type {
            name
          }
          access {
            storefront
            admin
          }
        }
      }
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metaobjectDefinitionCreate
const M_METAOBJECT_DEFINITION_CREATE = /* GraphQL */ `
  mutation MetaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
        name
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metafieldDefinitionCreate
const M_METAFIELD_DEFINITION_CREATE = /* GraphQL */ `
  mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        namespace
        key
        name
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metafieldDefinitionUpdate
// Only used to drift-correct `access` on already-created definitions.
const M_METAFIELD_DEFINITION_UPDATE = /* GraphQL */ `
  mutation MetafieldDefinitionUpdate($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition {
        id
        namespace
        key
        access {
          storefront
          admin
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * POST a GraphQL operation. Throws on network / HTTP / top-level GraphQL errors.
 * Does NOT throw on `userErrors` — callers inspect those per-mutation.
 */
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
// Schema definitions (mirrors docs/metafields.md)
// ---------------------------------------------------------------------------

/*
 * Metaobject definitions. `type` is the canonical machine handle.
 * Field `type` values map to Shopify metafield type identifiers:
 *   single_line_text   -> "single_line_text_field"
 *   multi_line_text    -> "multi_line_text_field"
 *   rich_text          -> "rich_text_field"
 *   number_integer     -> "number_integer"
 *   number_decimal     -> "number_decimal"
 *   file_reference     -> "file_reference"
 *   url                -> "url"
 *   list.single_line_text -> "list.single_line_text_field"
 * See https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types
 */
const METAOBJECT_DEFS = [
  {
    type: 'testimonial',
    name: 'Testimonial',
    description: 'Reusable customer quote.',
    displayNameKey: 'name',
    fieldDefinitions: [
      { key: 'name', name: 'Name', type: 'single_line_text_field', required: true },
      { key: 'role', name: 'Role', type: 'single_line_text_field' },
      { key: 'quote', name: 'Quote', type: 'multi_line_text_field', required: true },
      {
        key: 'rating',
        name: 'Rating',
        type: 'number_integer',
        required: true,
        validations: [
          { name: 'min', value: '1' },
          { name: 'max', value: '5' },
        ],
      },
      { key: 'avatar', name: 'Avatar', type: 'file_reference' },
      { key: 'source', name: 'Source', type: 'single_line_text_field' },
      { key: 'locale_hint', name: 'Locale hint', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'trust_badge',
    name: 'Trust badge',
    description: 'Homepage / PDP trust strip item.',
    displayNameKey: 'label',
    fieldDefinitions: [
      { key: 'label', name: 'Label', type: 'single_line_text_field', required: true },
      { key: 'body', name: 'Body', type: 'multi_line_text_field' },
      { key: 'icon', name: 'Icon', type: 'file_reference', required: true },
      { key: 'link', name: 'Link', type: 'url' },
    ],
  },
  {
    type: 'spec_section',
    name: 'Spec section',
    description: 'PDP accordion block. Referenced by product.custom.spec_sections.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'body', name: 'Body', type: 'rich_text_field' },
      { key: 'bullets', name: 'Bullets', type: 'list.single_line_text_field' },
      { key: 'icon', name: 'Icon', type: 'file_reference' },
      { key: 'order', name: 'Order', type: 'number_integer' },
    ],
  },
  {
    type: 'faq_item',
    name: 'FAQ item',
    description: 'Reusable FAQ row.',
    displayNameKey: 'question',
    fieldDefinitions: [
      { key: 'question', name: 'Question', type: 'single_line_text_field', required: true },
      { key: 'answer', name: 'Answer', type: 'rich_text_field', required: true },
      { key: 'category', name: 'Category', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'usp_item',
    name: 'USP item',
    description: 'Global USP strip item.',
    displayNameKey: 'label',
    fieldDefinitions: [
      { key: 'label', name: 'Label', type: 'single_line_text_field', required: true },
      { key: 'body', name: 'Body', type: 'multi_line_text_field' },
      { key: 'icon', name: 'Icon', type: 'file_reference' },
      { key: 'link', name: 'Link', type: 'url' },
    ],
  },
];

/*
 * Product metafield definitions. `spec_sections` is filled in after the
 * metaobject definitions are created so we can reference the real GID in
 * its validation (two-pass approach).
 */
function buildProductMetafieldDefs(gidByType) {
  const NAMESPACE = 'custom';
  return [
    {
      namespace: NAMESPACE,
      key: 'spec_sections',
      name: 'Spec sections',
      description: 'PDP accordions — ordered list of spec_section metaobjects.',
      type: 'list.metaobject_reference',
      ownerType: 'PRODUCT',
      pin: true,
      // https://shopify.dev/docs/api/admin-graphql/2026-04/input-objects/MetafieldDefinitionInput
      // A list.metaobject_reference requires a `metaobject_definition_id` validation
      // pointing at the referenced metaobject definition's GID.
      validations: [
        {
          name: 'metaobject_definition_id',
          value: requireGid(gidByType, 'spec_section'),
        },
      ],
    },
    {
      namespace: NAMESPACE,
      key: 'datasheet_pdf',
      name: 'Datasheet PDF',
      description: 'Downloadable product datasheet.',
      type: 'file_reference',
      ownerType: 'PRODUCT',
      pin: true,
      // Constrain the file picker to GenericFile (covers PDFs, datasheets, docs).
      validations: [{ name: 'file_type_options', value: '["GenericFile"]' }],
    },
    {
      namespace: NAMESPACE,
      key: 'bundle_partner',
      name: 'Bundle partner',
      description: '"Spare im Set" upsell — reference to paired product.',
      type: 'product_reference',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'warranty_years',
      name: 'Warranty years',
      description: 'Override default 10-year warranty.',
      type: 'number_integer',
      ownerType: 'PRODUCT',
      pin: true,
      validations: [{ name: 'min', value: '0' }],
    },
    {
      namespace: NAMESPACE,
      key: 'grundpreis_value',
      name: 'Grundpreis value',
      description: 'Price per unit (EU "Grundpreis").',
      type: 'number_decimal',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'grundpreis_unit',
      name: 'Grundpreis unit',
      description: 'Unit for Grundpreis, e.g. "m²" or "W".',
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'ral_color',
      name: 'RAL color',
      description: 'RAL color code, e.g. "RAL 9016".',
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'connection_type',
      name: 'Connection type',
      description: 'Mittelanschluss / Seitenanschluss.',
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'width_cm',
      name: 'Width (cm)',
      description: 'Filterable width in cm.',
      type: 'number_decimal',
      ownerType: 'PRODUCT',
      pin: true,
      validations: [{ name: 'min', value: '0' }],
    },
    {
      namespace: NAMESPACE,
      key: 'height_cm',
      name: 'Height (cm)',
      description: 'Filterable height in cm.',
      type: 'number_decimal',
      ownerType: 'PRODUCT',
      pin: true,
      validations: [{ name: 'min', value: '0' }],
    },
    {
      namespace: NAMESPACE,
      key: 'wattage',
      name: 'Wattage',
      description: 'Filterable wattage in W.',
      type: 'number_integer',
      ownerType: 'PRODUCT',
      pin: true,
      validations: [{ name: 'min', value: '0' }],
    },
    {
      namespace: NAMESPACE,
      key: 'delivery_contents',
      name: 'Delivery contents',
      description: 'Itemized list of what ships in the box (radiator, brackets, bleed valve, etc.).',
      type: 'list.single_line_text_field',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'bundle_products',
      name: 'Bundle products',
      description: '"Spare im Set" upsell — list of paired products shown on the PDP.',
      type: 'list.product_reference',
      ownerType: 'PRODUCT',
      pin: true,
    },
    {
      namespace: NAMESPACE,
      key: 'faqs',
      name: 'Product FAQs',
      description: 'PDP FAQ accordion — ordered list of faq_item metaobjects.',
      type: 'list.metaobject_reference',
      ownerType: 'PRODUCT',
      pin: true,
      validations: [
        {
          name: 'metaobject_definition_id',
          value: requireGid(gidByType, 'faq_item'),
        },
      ],
    },
    {
      namespace: NAMESPACE,
      key: 'delivery_eta',
      name: 'Delivery ETA',
      description: 'Human-readable shipping speed (e.g. "2-4 business days"). Translatable via Translate & Adapt.',
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      pin: true,
    },
    // Sync keys (namespace: sync) — populated by agent/sync/ pipeline.
    // Left unpinned; diagnostic only, not for merchant editing.
    //
    // SECURITY: storefront access is forced to NONE on every sync.* definition.
    // These fields name our upstream supplier (xxl-heizung). If they were
    // PUBLIC_READ, a competitor scraping `/products/<handle>.json` could
    // trivially prove the reseller relationship. Admin-only.
    {
      namespace: 'sync',
      key: 'xxl_source_id',
      name: 'xxl-heizung source product ID',
      description: 'Upstream Shopify product ID from xxl-heizung.de. Used as sync key.',
      type: 'number_integer',
      ownerType: 'PRODUCT',
      pin: false,
      access: { storefront: 'NONE' },
    },
    {
      namespace: 'sync',
      key: 'xxl_source_handle',
      name: 'xxl-heizung source handle',
      description: 'Upstream product handle from xxl-heizung.de. Used for traceability.',
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      pin: false,
      access: { storefront: 'NONE' },
    },
    {
      namespace: 'sync',
      key: 'xxl_last_synced_at',
      name: 'Last synced at',
      description: 'ISO datetime of the last successful sync from xxl-heizung.',
      type: 'date_time',
      ownerType: 'PRODUCT',
      pin: false,
      access: { storefront: 'NONE' },
    },
  ];
}

const COLLECTION_METAFIELD_DEFS = [
  {
    namespace: 'custom',
    key: 'card_image',
    name: 'Card image',
    description: 'Override image for homepage category grid.',
    type: 'file_reference',
    ownerType: 'COLLECTION',
    pin: true,
  },
  {
    namespace: 'custom',
    key: 'badge_text',
    name: 'Badge text',
    description: 'Optional badge on category card.',
    type: 'single_line_text_field',
    ownerType: 'COLLECTION',
    pin: true,
  },
];

function requireGid(gidByType, type) {
  const gid = gidByType.get(type);
  if (!gid) {
    throw new Error(
      `Expected metaobject definition "${type}" to have a GID by now — ` +
        'ensure metaobject pass ran before metafield pass.',
    );
  }
  return gid;
}

// ---------------------------------------------------------------------------
// Idempotent create helpers
// ---------------------------------------------------------------------------

/**
 * Look up a metaobject definition by its `type`. Returns GID or null.
 */
async function findMetaobjectDefinitionId(type) {
  const data = await gql(Q_METAOBJECT_DEFINITION_BY_TYPE, { type });
  return data.metaobjectDefinitionByType?.id ?? null;
}

/**
 * Look up a metafield definition by ownerType + namespace + key. Returns
 * `{ id, access }` for existing definitions or null when missing.
 */
async function findMetafieldDefinition({ ownerType, namespace, key }) {
  const data = await gql(Q_METAFIELD_DEFINITIONS, { ownerType, namespace, key });
  const node = data.metafieldDefinitions.edges[0]?.node;
  if (!node) return null;
  return { id: node.id, access: node.access ?? null };
}

/**
 * Create a metaobject definition if it doesn't already exist.
 * Returns { id, status: 'created' | 'skipped' }.
 */
async function ensureMetaobjectDefinition(def) {
  const existing = await findMetaobjectDefinitionId(def.type);
  if (existing) {
    console.log(`[skip] metaobject:${def.type} already exists → ${existing}`);
    return { id: existing, status: 'skipped' };
  }

  const input = {
    name: def.name,
    type: def.type,
    description: def.description,
    displayNameKey: def.displayNameKey,
    fieldDefinitions: def.fieldDefinitions.map((f) => ({
      key: f.key,
      name: f.name,
      type: f.type,
      required: f.required ?? false,
      ...(f.description ? { description: f.description } : {}),
      ...(f.validations ? { validations: f.validations } : {}),
    })),
    // Default access: storefront can read; admin can edit. The theme needs
    // STOREFRONT-readable definitions for Liquid rendering.
    // https://shopify.dev/docs/api/admin-graphql/2026-04/input-objects/MetaobjectAccessInput
    access: { storefront: 'PUBLIC_READ' },
    // Enable Translate & Adapt / translationsRegister on all fields. Without
    // this, DE translations registered via the API are silently stored but
    // never surface on the DE-locale storefront.
    capabilities: { translatable: { enabled: true } },
  };

  const data = await gql(M_METAOBJECT_DEFINITION_CREATE, { definition: input });
  const { metaobjectDefinition, userErrors } = data.metaobjectDefinitionCreate;
  if (userErrors.length) {
    throw new Error(
      `metaobjectDefinitionCreate(${def.type}) userErrors: ` +
        JSON.stringify(userErrors),
    );
  }
  console.log(
    `[create] metaobject:${def.type} → ${metaobjectDefinition.id}`,
  );
  return { id: metaobjectDefinition.id, status: 'created' };
}

/**
 * Default access for product/collection metafields surfaced in Liquid.
 * Per-def `access` overrides this (e.g. sync.* fields that must NOT leak
 * the upstream supplier on the storefront API).
 */
const DEFAULT_METAFIELD_ACCESS = { storefront: 'PUBLIC_READ' };

/** True if two access objects describe the same effective grants. */
function accessMatches(have, want) {
  if (!have || !want) return false;
  const wantStore = want.storefront ?? 'PUBLIC_READ';
  const wantAdmin = want.admin ?? null;
  if (have.storefront !== wantStore) return false;
  if (wantAdmin !== null && have.admin !== wantAdmin) return false;
  return true;
}

/**
 * Create a metafield definition if missing; if it exists but its `access`
 * has drifted from the desired value, update it via metafieldDefinitionUpdate.
 * Returns { id, status: 'created' | 'updated' | 'skipped' }.
 */
async function ensureMetafieldDefinition(def) {
  const desiredAccess = def.access ?? DEFAULT_METAFIELD_ACCESS;
  const label = `${def.ownerType.toLowerCase()}.${def.namespace}.${def.key}`;
  const existing = await findMetafieldDefinition({
    ownerType: def.ownerType,
    namespace: def.namespace,
    key: def.key,
  });

  if (existing) {
    if (accessMatches(existing.access, desiredAccess)) {
      console.log(`[skip] metafield:${label} already exists → ${existing.id}`);
      return { id: existing.id, status: 'skipped' };
    }

    // Drift-correct access. The Update input takes ownerType + namespace + key
    // (no `id`), and only mutable fields can be passed.
    const updateInput = {
      namespace: def.namespace,
      key: def.key,
      ownerType: def.ownerType,
      access: desiredAccess,
    };
    const data = await gql(M_METAFIELD_DEFINITION_UPDATE, { definition: updateInput });
    const { updatedDefinition, userErrors } = data.metafieldDefinitionUpdate;
    if (userErrors.length) {
      throw new Error(
        `metafieldDefinitionUpdate(${label}) userErrors: ` + JSON.stringify(userErrors),
      );
    }
    console.log(
      `[update] metafield:${label} access ${JSON.stringify(existing.access)} → ${JSON.stringify(updatedDefinition.access)}`,
    );
    return { id: updatedDefinition.id, status: 'updated' };
  }

  const input = {
    name: def.name,
    namespace: def.namespace,
    key: def.key,
    description: def.description,
    type: def.type,
    ownerType: def.ownerType,
    pin: def.pin ?? true,
    ...(def.validations ? { validations: def.validations } : {}),
    // https://shopify.dev/docs/api/admin-graphql/2026-04/input-objects/MetafieldAccessInput
    access: desiredAccess,
  };

  const data = await gql(M_METAFIELD_DEFINITION_CREATE, { definition: input });
  const { createdDefinition, userErrors } = data.metafieldDefinitionCreate;
  if (userErrors.length) {
    throw new Error(
      `metafieldDefinitionCreate(${label}) userErrors: ` + JSON.stringify(userErrors),
    );
  }
  console.log(`[create] metafield:${label} → ${createdDefinition.id}`);
  return { id: createdDefinition.id, status: 'created' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `→ Syncing custom-data definitions on ${SHOP} (Admin API ${API_VERSION})`,
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const tally = (status) => {
    if (status === 'created') created++;
    else if (status === 'updated') updated++;
    else skipped++;
  };

  // Pass 1: metaobject definitions. Capture GIDs so metafields can reference them.
  const gidByType = new Map();
  for (const def of METAOBJECT_DEFS) {
    const { id, status } = await ensureMetaobjectDefinition(def);
    gidByType.set(def.type, id);
    tally(status);
  }

  // Pass 2: product metafield definitions (some reference metaobject GIDs).
  for (const def of buildProductMetafieldDefs(gidByType)) {
    const { status } = await ensureMetafieldDefinition(def);
    tally(status);
  }

  // Pass 3: collection metafield definitions.
  for (const def of COLLECTION_METAFIELD_DEFS) {
    const { status } = await ensureMetafieldDefinition(def);
    tally(status);
  }

  console.log(`\nDone. created: ${created}, updated: ${updated}, skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
