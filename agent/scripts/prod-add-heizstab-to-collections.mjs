/**
 * Adds heizstab-white and heizstab-anthracite to the same collections
 * the Black product (heizstab) belongs to. Without this they're
 * published to the storefront but invisible from category browsing.
 *
 * Idempotent: collectionAddProducts is a no-op for products already in
 * the collection.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

const SOURCE_HANDLE = 'heizstab';
const TARGET_HANDLES = ['heizstab-white', 'heizstab-anthracite'];

const src = await gql(
  `query($h:String!) {
    productByHandle(handle:$h) {
      id title
      collections(first:20) { edges { node { id handle title ruleSet { rules { column } } } } }
    }
  }`,
  {h: SOURCE_HANDLE},
);

const sourceCollections = src.productByHandle.collections.edges
  .map((e) => e.node)
  .filter((c) => !c.ruleSet || c.ruleSet.rules.length === 0); // skip auto-collections (tag-driven)

console.log(`Source product collections (manual only):`);
for (const c of sourceCollections) console.log(`  - ${c.handle} (${c.title})`);

if (!sourceCollections.length) {
  console.log('No manual collections to mirror — done.');
  process.exit(0);
}

for (const handle of TARGET_HANDLES) {
  const p = (await gql(
    `query($h:String!) { productByHandle(handle:$h) { id title } }`,
    {h: handle},
  )).productByHandle;
  if (!p) { console.error(`✗ ${handle} not found`); continue; }

  console.log(`\n→ Adding ${p.title} to collections…`);
  for (const c of sourceCollections) {
    const r = await gql(
      `mutation($id:ID!, $pids:[ID!]!) {
        collectionAddProducts(id:$id, productIds:$pids) {
          collection { id productsCount { count } }
          userErrors { field message }
        }
      }`,
      {id: c.id, pids: [p.id]},
    );
    const errs = r.collectionAddProducts.userErrors;
    if (errs.length) console.error(`  ✗ ${c.handle}:`, errs);
    else console.log(`  ✓ added to ${c.handle} (now ${r.collectionAddProducts.collection.productsCount.count} products)`);
  }
}

console.log('\nDone.');
