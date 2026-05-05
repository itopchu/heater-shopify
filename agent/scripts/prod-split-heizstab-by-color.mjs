#!/usr/bin/env node
/**
 * Split the Electric Heating Element (handle: heizstab) into three
 * separate products by colorway, per requirements §7:
 *
 *   1. heizstab          → Electric Heating Element — Black       (existing product, mutated)
 *   2. heizstab-white     → Electric Heating Element — White       (cloned)
 *   3. heizstab-anthracite → Electric Heating Element — Anthracite (cloned)
 *
 * Each product carries its own color-correct imagery (sourced from
 * `catalog/heizstab/uncolored/heizstab/0X.jpg`):
 *
 *   Black       → 03 (close-up), 04 (3/4 detail)
 *   White       → 01 (close-up), 06 (lifestyle on wall)
 *   Anthracite  → 02 (lifestyle on wall), 05 (lifestyle on floor)
 *
 * Shared content (description, sections_en/sections_de, FAQ, datasheet
 * PDF, specs, market visibility) is duplicated to each new product —
 * color is the only differentiator.
 *
 * Variant matrix per product:
 *   - Size [600, 1200]
 *   - Color [<one value>]            (single-value option, kept for storefront filter consistency)
 *   - Material [Stainless steel]
 *
 * SKUs follow the source xxl-heizung mapping:
 *   Black:      GB-XXL-HS-011 (600W) / GB-XXL-HS-012 (1200W)
 *   White:      GB-XXL-HS-005 (600W) / GB-XXL-HS-006 (1200W)
 *   Anthracite: GB-XXL-HS-008 (600W) / GB-XXL-HS-009 (1200W)
 *
 * Pricing matches the existing product: €99 / €119.
 *
 * Idempotent: skips create when a target handle already exists.
 *
 * Usage:
 *   node agent/scripts/prod-split-heizstab-by-color.mjs            # dry-run
 *   node agent/scripts/prod-split-heizstab-by-color.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const APPLY = process.argv.includes('--apply');
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing SHOPIFY_PROD_*'); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

// CDN URLs of the existing 6 heizstab images on prod (taken from snapshot
// produced by inspect-heizstab.mjs). 3-letter suffix per file for log clarity.
const SRC_IMAGES = {
  '01-white-closeup':  'https://cdn.shopify.com/s/files/1/1042/0263/3553/files/01_e4b60a47-6fe0-4aa1-9f98-c445fc022c0d.jpg?v=1777573631',
  '02-anth-lifestyle': 'https://cdn.shopify.com/s/files/1/1042/0263/3553/files/02_bfb4cd9a-58a4-4252-b85f-a0149602bf39.jpg?v=1777573633',
  '03-black-closeup':  'https://cdn.shopify.com/s/files/1/1042/0263/3553/files/03_6b9eeb6a-7b6b-4fd0-8167-128affa50817.jpg?v=1777573635',
  '04-black-detail':   'https://cdn.shopify.com/s/files/1/1042/0263/3553/files/04.jpg?v=1777573635',
  '05-anth-floor':     'https://cdn.shopify.com/s/files/1/1042/0263/3553/files/05_95cf3ef9-888e-48a2-a5a6-6cb8c040a483.jpg?v=1777573636',
  '06-white-wall':     'https://cdn.shopify.com/s/files/1/1042/0263/3553/files/06.jpg?v=1777573639',
};

const PER_COLOR = {
  Black: {
    handle:        'heizstab',                          // existing — mutated in place
    title:         'Electric Heating Element — Black',
    altPrefix:     'Electric heating element, black —',
    images:        ['03-black-closeup', '04-black-detail'],
    skus:          {600: 'GB-XXL-HS-011', 1200: 'GB-XXL-HS-012'},
    isExisting:    true,
  },
  White: {
    handle:        'heizstab-white',
    title:         'Electric Heating Element — White',
    altPrefix:     'Electric heating element, white —',
    images:        ['01-white-closeup', '06-white-wall'],
    skus:          {600: 'GB-XXL-HS-005', 1200: 'GB-XXL-HS-006'},
    isExisting:    false,
  },
  Anthracite: {
    handle:        'heizstab-anthracite',
    title:         'Electric Heating Element — Anthracite',
    altPrefix:     'Electric heating element, anthracite —',
    images:        ['02-anth-lifestyle', '05-anth-floor'],
    skus:          {600: 'GB-XXL-HS-008', 1200: 'GB-XXL-HS-009'},
    isExisting:    false,
  },
};

const PRICE_BY_SIZE = {600: '99.00', 1200: '119.00'};

// 1. Pull current state of the source product.
const src = (await gql(
  `query($handle:String!) {
    productByHandle(handle:$handle) {
      id title handle status vendor productType tags
      descriptionHtml seo { title description }
      options { id name position values }
      variants(first:50) { edges { node { id title sku price selectedOptions { name value } } } }
      metafields(first:50) { edges { node { namespace key value type } } }
    }
  }`,
  {handle: 'heizstab'},
)).productByHandle;

if (!src) { console.error('Source product heizstab not found'); process.exit(1); }
console.log(`→ Source product: ${src.title} (${src.id})`);
console.log(`  Existing options: ${src.options.map(o => `${o.name} [${o.values.join(', ')}]`).join(' · ')}`);
console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// Metafields to copy. Skip color-specific ones (none currently) and skip
// `media.local_images` because we set images directly via productCreateMedia.
const SHARED_MF_KEYS = new Set([
  'media.image_status',
  'custom.copy_status',
  'content.sections_de',
  'custom.subtitle',
  'custom.short_description',
  'merchandising.badges',
  'seo.primary_keyword',
  'localization.market_visibility',
  'specs.heating_medium',
  'filters.product_type',
  'content.sections_en',
  'media.primary_pdf_url',
]);

const sharedMetafields = src.metafields.edges
  .map(e => e.node)
  .filter(m => SHARED_MF_KEYS.has(`${m.namespace}.${m.key}`))
  .map(m => ({namespace: m.namespace, key: m.key, value: m.value, type: m.type}));

console.log(`  Shared metafields to copy: ${sharedMetafields.length}`);

// Helper: lookup product by handle.
async function findByHandle(handle) {
  const d = await gql(
    `query($h:String!) { productByHandle(handle:$h) { id title handle } }`,
    {h: handle},
  );
  return d.productByHandle;
}

// Helper: build options input array.
function optionsInput(colorValue) {
  return [
    {name: 'Size', position: 1, values: [{name: '600'}, {name: '1200'}]},
    {name: 'Color', position: 2, values: [{name: colorValue}]},
    {name: 'Material', position: 3, values: [{name: 'Stainless steel'}]},
  ];
}

function variantsInput(colorValue, skus) {
  return [600, 1200].map(size => ({
    price: PRICE_BY_SIZE[size],
    optionValues: [
      {optionName: 'Size', name: String(size)},
      {optionName: 'Color', name: colorValue},
      {optionName: 'Material', name: 'Stainless steel'},
    ],
    inventoryItem: {tracked: true, sku: skus[size]},
  }));
}

async function setMetafieldsOn(productId, metafields) {
  if (!metafields.length) return;
  const r = await gql(
    `mutation($mf:[MetafieldsSetInput!]!) {
      metafieldsSet(metafields:$mf) {
        userErrors { field message code }
      }
    }`,
    {mf: metafields.map(m => ({...m, ownerId: productId}))},
  );
  const errs = r.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`metafieldsSet: ${JSON.stringify(errs)}`);
}

async function setImagesOn(productId, color) {
  const cfg = PER_COLOR[color];
  const media = cfg.images.map((key, idx) => ({
    originalSource: SRC_IMAGES[key],
    alt: `${cfg.altPrefix} ${idx === 0 ? 'product shot' : 'in-room view'}`,
    mediaContentType: 'IMAGE',
  }));
  const r = await gql(
    `mutation($pid:ID!, $media:[CreateMediaInput!]!) {
      productCreateMedia(productId:$pid, media:$media) {
        media { id ... on MediaImage { image { url } } }
        mediaUserErrors { field message code }
      }
    }`,
    {pid: productId, media},
  );
  const errs = r.productCreateMedia.mediaUserErrors;
  if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
  return r.productCreateMedia.media;
}

async function deleteAllImagesOn(productId) {
  const list = await gql(
    `query($id:ID!) {
      product(id:$id) { media(first:50) { edges { node { id } } } }
    }`,
    {id: productId},
  );
  const ids = list.product.media.edges.map(e => e.node.id);
  if (!ids.length) return;
  const r = await gql(
    `mutation($pid:ID!, $ids:[ID!]!) {
      productDeleteMedia(productId:$pid, mediaIds:$ids) {
        deletedMediaIds
        mediaUserErrors { field message code }
      }
    }`,
    {pid: productId, ids},
  );
  const errs = r.productDeleteMedia.mediaUserErrors;
  if (errs.length) throw new Error(`productDeleteMedia: ${JSON.stringify(errs)}`);
}

// === EXECUTE ===
//
// Step 1: re-title existing product to Black, replace images.
async function mutateExistingToBlack() {
  const cfg = PER_COLOR.Black;
  console.log(`\n[Black] re-titling existing product…`);

  if (!APPLY) {
    console.log(`  would set title="${cfg.title}", remove old images, attach 2 black images, ensure SKUs ${cfg.skus[600]} / ${cfg.skus[1200]}`);
    return;
  }

  // Title + handle stays "heizstab" so existing inbound links keep working.
  await gql(
    `mutation($input:ProductInput!) {
      productUpdate(input:$input) {
        product { id title }
        userErrors { field message }
      }
    }`,
    {input: {id: src.id, title: cfg.title}},
  );
  console.log(`  ✓ retitled to "${cfg.title}"`);

  // Wipe old images, attach color-correct ones.
  await deleteAllImagesOn(src.id);
  console.log(`  ✓ deleted old media`);
  await setImagesOn(src.id, 'Black');
  console.log(`  ✓ attached 2 black images`);

  // Update existing variant SKUs (preserving inventory + variant ids).
  for (const v of src.variants.edges.map(e => e.node)) {
    const size = v.selectedOptions.find(o => o.name === 'Size')?.value;
    const targetSku = cfg.skus[size];
    if (v.sku === targetSku) { console.log(`  skip variant ${v.title} (sku already ${targetSku})`); continue; }
    const r = await gql(
      `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId:$pid, variants:$vars) {
          productVariants { id sku }
          userErrors { field message }
        }
      }`,
      {pid: src.id, vars: [{id: v.id, inventoryItem: {sku: targetSku}}]},
    );
    const errs = r.productVariantsBulkUpdate.userErrors;
    if (errs.length) console.warn(`  ⚠ variant ${v.title} update: ${JSON.stringify(errs)}`);
    else console.log(`  ✓ variant ${v.title} sku → ${targetSku}`);
  }
}

// Step 2: create White / Anthracite as new products.
async function createColorProduct(color) {
  const cfg = PER_COLOR[color];
  console.log(`\n[${color}] creating product…`);

  const existing = await findByHandle(cfg.handle);
  if (existing) {
    console.log(`  skip — handle "${cfg.handle}" already exists (${existing.id})`);
    return existing.id;
  }

  if (!APPLY) {
    console.log(`  would create handle="${cfg.handle}", title="${cfg.title}", 2 variants, 2 images, ${sharedMetafields.length} metafields`);
    return null;
  }

  const create = await gql(
    `mutation($input:ProductInput!) {
      productCreate(input:$input) {
        product { id title handle }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: cfg.title,
        handle: cfg.handle,
        descriptionHtml: src.descriptionHtml,
        vendor: src.vendor,
        productType: src.productType,
        tags: src.tags,
        status: src.status,
        seo: src.seo,
        productOptions: optionsInput(color),
      },
    },
  );
  const errs = create.productCreate.userErrors;
  if (errs.length) throw new Error(`productCreate: ${JSON.stringify(errs)}`);
  const pid = create.productCreate.product.id;
  console.log(`  ✓ created ${pid} (${cfg.handle})`);

  // productCreate with productOptions auto-creates one variant per
  // option-value combination — for Size [600, 1200] × Color [<one>] ×
  // Material [Stainless steel] that's two variants. Update each with
  // the correct SKU + price instead of creating new (which would
  // collide on the option-tuple).
  const autoVariants = await gql(
    `query($id:ID!) {
      product(id:$id) {
        variants(first:10) {
          edges { node { id selectedOptions { name value } } }
        }
      }
    }`,
    {id: pid},
  );
  const updates = autoVariants.product.variants.edges
    .map(e => e.node)
    .map(v => {
      const size = v.selectedOptions.find(o => o.name === 'Size')?.value;
      return {
        id: v.id,
        price: PRICE_BY_SIZE[size],
        inventoryItem: {tracked: true, sku: cfg.skus[size]},
      };
    });
  const vUpd = await gql(
    `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId:$pid, variants:$vars) {
        productVariants { id sku price }
        userErrors { field message }
      }
    }`,
    {pid, vars: updates},
  );
  const vErrs = vUpd.productVariantsBulkUpdate.userErrors;
  if (vErrs.length) throw new Error(`variantsBulkUpdate: ${JSON.stringify(vErrs)}`);
  console.log(`  ✓ updated ${vUpd.productVariantsBulkUpdate.productVariants.length} variants with SKUs + prices`);

  // Images.
  await setImagesOn(pid, color);
  console.log(`  ✓ attached ${cfg.images.length} ${color.toLowerCase()} images`);

  // Metafields.
  await setMetafieldsOn(pid, sharedMetafields);
  console.log(`  ✓ copied ${sharedMetafields.length} shared metafields`);

  return pid;
}

await mutateExistingToBlack();
await createColorProduct('White');
await createColorProduct('Anthracite');

console.log('\n=== Done ===');
console.log('Next:');
console.log('  1. Verify the three products at Admin → Products.');
console.log('  2. Add to relevant collections (electric-bathroom-radiators / accessories) via the merchandising UI or a follow-up script.');
