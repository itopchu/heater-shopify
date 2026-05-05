#!/usr/bin/env node
/**
 * Read-only inspection of the Electric Heating Element (handle: heizstab)
 * on the prod store. Dumps title, descriptionHtml, options, variants
 * (price/sku/inventory), images, metafields — used as input for the
 * color-split plan (one product per Color value, per requirements).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;

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

const data = await gql(
  `query($handle:String!) {
    productByHandle(handle:$handle) {
      id title handle status vendor productType tags
      descriptionHtml
      seo { title description }
      options { id name position values }
      images(first: 50) { edges { node { id url altText width height } } }
      media(first: 50) {
        edges { node { ... on MediaImage { id image { url altText width height } } } }
      }
      variants(first: 50) {
        edges { node {
          id title sku barcode price compareAtPrice
          availableForSale inventoryQuantity
          selectedOptions { name value }
          image { id url }
        } }
      }
      metafields(first: 50) { edges { node { namespace key value type } } }
    }
  }`,
  {handle: 'heizstab'},
);

const out = JSON.stringify(data.productByHandle, null, 2);
writeFileSync(resolve(ROOT, 'data/heizstab-prod-snapshot.json'), out);
console.log(`✓ Wrote data/heizstab-prod-snapshot.json (${out.length} chars)`);
console.log('\nSummary:');
const p = data.productByHandle;
console.log(`  id:        ${p.id}`);
console.log(`  title:     ${p.title}`);
console.log(`  status:    ${p.status}`);
console.log(`  vendor:    ${p.vendor}`);
console.log(`  type:      ${p.productType}`);
console.log(`  tags:      ${p.tags.join(', ') || '(none)'}`);
console.log(`  options:   ${p.options.map(o => `${o.name} [${o.values.join(', ')}]`).join(' · ')}`);
console.log(`  variants:  ${p.variants.edges.length}`);
for (const v of p.variants.edges.map(e => e.node)) {
  console.log(`    - ${v.title}  sku=${v.sku || '?'}  €${v.price}  qty=${v.inventoryQuantity ?? '?'}  img=${v.image?.url ? 'yes' : 'no'}`);
}
console.log(`  images:    ${p.images.edges.length}`);
for (const e of p.images.edges) {
  console.log(`    - ${e.node.url}  alt="${e.node.altText ?? ''}"  ${e.node.width}x${e.node.height}`);
}
console.log(`  metafields: ${p.metafields.edges.length}`);
for (const e of p.metafields.edges) {
  const v = String(e.node.value ?? '').slice(0, 80);
  console.log(`    - ${e.node.namespace}.${e.node.key} (${e.node.type}) = ${v}${e.node.value?.length > 80 ? '…' : ''}`);
}
