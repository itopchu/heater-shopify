#!/usr/bin/env node
// Create the 5 customer-facing collections on prod and populate them from
// the catalog JSON's collectionHandles per product. Idempotent.
//
// The storefront mega-menu and homepage hero buttons all link to these
// handles — without them, every category CTA 404s.

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
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');

const APPLY = process.argv.includes('--apply');

async function gql(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Catalog handle → storefront collection handle (rewrite where they diverge).
const HANDLE_REWRITE = {
  zubehoer: 'accessories',
};

const COLLECTIONS = [
  {
    handle: 'wohnraumheizkoerper',
    title: 'Living-room radiators',
    descriptionHtml: '<p>Vertical and horizontal panel radiators for living rooms — anthracite, black, white. Made for European wet-system central heating.</p>',
  },
  {
    handle: 'badheizkoerper',
    title: 'Bathroom radiators',
    descriptionHtml: '<p>Towel-warmer radiators for bathrooms. Mid- and side-connection, 50–60 cm wide.</p>',
  },
  {
    handle: 'badheizkoerper-elektrisch',
    title: 'Electric bathroom radiators',
    descriptionHtml: '<p>Heating-element-equipped bathroom radiators for plug-in install — no central-heating loop required.</p>',
  },
  {
    handle: 'austauschheizkoerper',
    title: 'Replacement radiators',
    descriptionHtml: '<p>Drop-in replacement radiators sized to common existing wall-mount and pipe-spacing dimensions.</p>',
  },
  {
    handle: 'accessories',
    title: 'Accessories',
    descriptionHtml: '<p>Mounting kits, valves, thermostat heads, thermal fluid, T-pieces and other heating accessories.</p>',
  },
];

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

// 1. Map every product (handle → gid) so we can attach by gid below.
const productsByHandle = new Map();
{
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($c:String){ products(first:50, after:$c){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
      { c: cursor }
    );
    for (const n of d.products.nodes) productsByHandle.set(n.handle, n.id);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
}
console.log(`Indexed ${productsByHandle.size} products from prod`);

// 2. Build catalog → collection membership.
const catalog = JSON.parse(readFileSync(resolve(ROOT, 'data/catalog/gberg-catalog.json'), 'utf8'));
const membership = new Map(); // collection_handle → Set<product_gid>
for (const p of catalog.products) {
  const productId = productsByHandle.get(p.handle);
  if (!productId) continue;
  for (const ch of p.collectionHandles || []) {
    const target = HANDLE_REWRITE[ch] ?? ch;
    if (!membership.has(target)) membership.set(target, new Set());
    membership.get(target).add(productId);
  }
}
console.log('Catalog → collection membership:');
for (const [h, ids] of membership) console.log(`  ${h.padEnd(30)} ${ids.size} products`);

// 3. Get existing collections so we don't recreate.
const existing = await gql(`{ collections(first:50){edges{node{id handle}}} }`);
const existingByHandle = new Map(existing.collections.edges.map(e => [e.node.handle, e.node.id]));

// 4. Create missing collections, then add products.
let createdCount = 0, addedCount = 0;
for (const def of COLLECTIONS) {
  let collectionId = existingByHandle.get(def.handle);
  if (!collectionId) {
    console.log(`+ create  ${def.handle}  (${def.title})`);
    if (APPLY) {
      const r = await gql(
        `mutation($input:CollectionInput!){
          collectionCreate(input:$input){
            collection{ id handle }
            userErrors{ field message }
          }
        }`,
        { input: { handle: def.handle, title: def.title, descriptionHtml: def.descriptionHtml } }
      );
      const errs = r.collectionCreate.userErrors;
      if (errs.length) { console.log(`  ✗ ${JSON.stringify(errs)}`); continue; }
      collectionId = r.collectionCreate.collection.id;
      createdCount++;
    } else {
      continue; // dry-run can't add to a collection that doesn't exist yet
    }
  } else {
    console.log(`= exists  ${def.handle}  ${collectionId}`);
  }

  const ids = [...(membership.get(def.handle) ?? [])];
  if (!ids.length) {
    console.log(`  · no catalog products map to this handle`);
    continue;
  }
  console.log(`  + add ${ids.length} products`);
  if (!APPLY) continue;

  // Batch in chunks of 50 (Shopify limit).
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await gql(
      `mutation($id:ID!, $productIds:[ID!]!){
        collectionAddProducts(id:$id, productIds:$productIds){
          collection{ productsCount{count} }
          userErrors{ field message }
        }
      }`,
      { id: collectionId, productIds: batch }
    );
    const errs = r.collectionAddProducts.userErrors;
    if (errs.length) console.log(`    ✗ batch ${i}: ${JSON.stringify(errs)}`);
    else { addedCount += batch.length; console.log(`    ✓ batch added (${batch.length})`); }
  }

  // Also publish the collection to all sales channels so it shows on storefront.
  const pubs = await gql(`{ publications(first:10){edges{node{id name}}} }`);
  const targets = pubs.publications.edges
    .map(e => e.node)
    .filter(p => ['Online Store', 'Shop', 'G-Berg'].includes(p.name));
  if (APPLY) {
    const r = await gql(
      `mutation($id:ID!, $input:[PublicationInput!]!){
        publishablePublish(id:$id, input:$input){
          userErrors{ field message }
        }
      }`,
      { id: collectionId, input: targets.map(t => ({ publicationId: t.id })) }
    );
    const errs = r.publishablePublish.userErrors;
    if (errs.length) console.log(`    ✗ publish: ${JSON.stringify(errs)}`);
    else console.log(`    ✓ published to ${targets.length} channels`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Created: ${createdCount} collections`);
console.log(`Added:   ${addedCount} product → collection links`);
