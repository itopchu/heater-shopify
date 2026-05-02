#!/usr/bin/env node
/**
 * Recreate the deleted "Elanor white replacement towel warmer" product
 * with the correct white-variant images from the original xxl-heizung
 * scrape cache. The previous Shopify product was deleted earlier in
 * this session because it had been duplicated from the black variant
 * and inherited the wrong images. The local scrape cache contains the
 * actual white photos under /product-catalog/.cache/products/.
 *
 * Pipeline:
 *   1. productCreate — title, descriptionHtml, vendor, productType,
 *      Size + Side options, English tags.
 *   2. productCreateMedia — pull the 6 white images from xxl's CDN.
 *   3. productVariantsBulkCreate — recreate the original 8 variants
 *      with the same prices.
 *   4. metafieldsSet — series, color_family, dimensions_w_h_d_mm,
 *      filters.product_type for PLP filtering.
 *   5. publish to the Online Store + Hydrogen sales channels.
 *
 * Usage:
 *   node agent/scripts/prod-recreate-elanor-white.mjs --apply
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const cachePath = resolve(
  ROOT,
  'product-catalog/.cache/products/austausch-badheizkorper-handtuchheizkorper-schwarz-elanor-seitlich-offen-kopie.json',
);
const src = JSON.parse(readFileSync(cachePath, 'utf8'));

const title = 'Elanor — Replacement Towel Warmer, Side Connection, White';
const handle = 'elanor-replacement-towel-warmer-white';
const descriptionHtml = `
<p>Replacement bathroom radiator with side connection and 900 mm hub spacing — energy-efficient renovation radiator that doubles as a towel warmer.</p>
<ul>
  <li>✓ First-class craftsmanship, visual highlight</li>
  <li>✓ Modern, elegant design</li>
  <li>✓ Durable, scratch-resistant surface</li>
  <li>✓ Efficient towel drying and room heating</li>
  <li>✓ Reliable corrosion protection</li>
  <li>✓ 10-year manufacturer warranty</li>
</ul>
`.trim();

const VENDOR = 'G-Berg';
const PRODUCT_TYPE = 'Replacement radiator';
const TAGS = ['elanor', 'white', 'replacement'];

// Variant grid: 4 sizes × 2 sides = 8 variants. Source pricing kept
// the same — €259 / compare-at €359 across the board.
const SIZES = ['50 × 140', '50 × 164', '60 × 140', '60 × 164'];
const SIDES = ['Right', 'Left'];
const PRICE = '259.00';
const COMPARE_AT = '359.00';

function buildVariants() {
  const out = [];
  for (const size of SIZES) {
    for (const side of SIDES) {
      out.push({
        optionValues: [
          { optionName: 'Size', name: size },
          { optionName: 'Side', name: side },
        ],
        price: PRICE,
        compareAtPrice: COMPARE_AT,
        inventoryItem: { tracked: false },
      });
    }
  }
  return out;
}

const IMAGES = (src.images || []).map((i) => i.src || i).filter(Boolean);

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Title:   ${title}`);
console.log(`Handle:  ${handle}`);
console.log(`Images:  ${IMAGES.length}`);
console.log(`Variants: ${SIZES.length * SIDES.length}`);

if (!APPLY) {
  console.log('\nDry-run only — re-run with --apply.');
  process.exit(0);
}

// 1. Create product
const cr = await gql(`
  mutation($p:ProductCreateInput!){
    productCreate(product:$p){
      product{ id handle title }
      userErrors{ field message }
    }
  }
`, {
  p: {
    title,
    handle,
    descriptionHtml,
    vendor: VENDOR,
    productType: PRODUCT_TYPE,
    tags: TAGS,
    status: 'ACTIVE',
    productOptions: [
      { name: 'Size', values: SIZES.map(v => ({ name: v })) },
      { name: 'Side', values: SIDES.map(v => ({ name: v })) },
    ],
  },
});
const errs = cr.productCreate.userErrors;
if (errs.length) throw new Error(JSON.stringify(errs));
const productId = cr.productCreate.product.id;
console.log(`\n✓ Created product ${productId}`);

// 2. Add media
if (IMAGES.length) {
  const md = await gql(`
    mutation($pid:ID!, $media:[CreateMediaInput!]!){
      productCreateMedia(productId:$pid, media:$media){
        mediaUserErrors{ field message }
      }
    }
  `, {
    pid: productId,
    media: IMAGES.map((url) => ({
      mediaContentType: 'IMAGE',
      originalSource: url,
      alt: title,
    })),
  });
  const me = md.productCreateMedia.mediaUserErrors;
  if (me.length) console.log('  media warnings:', JSON.stringify(me));
  else console.log(`✓ Queued ${IMAGES.length} images`);
}

// 3. Create variants. The default variant created with productCreate
// is just an empty placeholder; bulk-create real ones and let Shopify
// drop the placeholder.
const va = await gql(`
  mutation($pid:ID!, $variants:[ProductVariantsBulkInput!]!){
    productVariantsBulkCreate(productId:$pid, variants:$variants, strategy:REMOVE_STANDALONE_VARIANT){
      productVariants{ id title }
      userErrors{ field message }
    }
  }
`, { pid: productId, variants: buildVariants() });
const ve = va.productVariantsBulkCreate.userErrors;
if (ve.length) throw new Error(JSON.stringify(ve));
console.log(`✓ Created ${va.productVariantsBulkCreate.productVariants.length} variants`);

// 4. Metafields
const mf = await gql(`
  mutation($m:[MetafieldsSetInput!]!){
    metafieldsSet(metafields:$m){ userErrors{ field message } }
  }
`, {
  m: [
    { ownerId: productId, namespace: 'custom', key: 'series', type: 'single_line_text_field', value: 'Elanor' },
    { ownerId: productId, namespace: 'custom', key: 'color_family', type: 'single_line_text_field', value: 'white' },
    { ownerId: productId, namespace: 'custom', key: 'width_mm', type: 'number_integer', value: '500' },
    { ownerId: productId, namespace: 'custom', key: 'height_mm', type: 'number_integer', value: '1400' },
    { ownerId: productId, namespace: 'custom', key: 'dimensions_w_h_d_mm', type: 'single_line_text_field', value: '500 × 1400 mm' },
    { ownerId: productId, namespace: 'specs', key: 'color', type: 'single_line_text_field', value: 'White' },
    { ownerId: productId, namespace: 'filters', key: 'product_type', type: 'single_line_text_field', value: 'towel_radiator' },
  ],
});
const mfe = mf.metafieldsSet.userErrors;
if (mfe.length) throw new Error(JSON.stringify(mfe));
console.log(`✓ Wrote 7 metafields`);

// 5. Publish to all sales channels
const pubs = await gql(`{
  publications(first:10){ nodes{ id name } }
}`);
const pubIds = pubs.publications.nodes.map(n => n.id);
if (pubIds.length) {
  const pub = await gql(`
    mutation($id:ID!, $publications:[PublicationInput!]!){
      publishablePublish(id:$id, input:$publications){
        userErrors{ field message }
      }
    }
  `, {
    id: productId,
    publications: pubIds.map(p => ({ publicationId: p })),
  });
  const pe = pub.publishablePublish.userErrors;
  if (pe.length) console.log('  publish warnings:', JSON.stringify(pe));
  else console.log(`✓ Published to ${pubIds.length} sales channels`);
}

// 6. Add to replacement-radiators collection
const col = await gql(`{
  collectionByHandle(handle:"replacement-radiators"){ id }
}`);
const cid = col.collectionByHandle?.id;
if (cid) {
  const add = await gql(`
    mutation($id:ID!, $productIds:[ID!]!){
      collectionAddProducts(id:$id, productIds:$productIds){
        collection{ id }
        userErrors{ field message }
      }
    }
  `, { id: cid, productIds: [productId] });
  const ae = add.collectionAddProducts.userErrors;
  if (ae.length) console.log('  collection warnings:', JSON.stringify(ae));
  else console.log(`✓ Added to replacement-radiators collection`);
}

console.log(`\nLive at: https://www.gberg-heizung.de/en/products/${handle}`);
