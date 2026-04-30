#!/usr/bin/env node
/**
 * For each DRAFT product on the dev store: backfill its default variant's
 * price from product-catalog/.cache/products/<handle>.json, and add it to
 * the `zubehoer` collection if it's an accessory. Status is left as DRAFT
 * — the merchant should add a description and review before promoting to
 * ACTIVE.
 *
 * Usage:
 *   node agent/scripts/finalize-draft-products.mjs            # dry-run
 *   node agent/scripts/finalize-draft-products.mjs --apply
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function loadEnvLocal(path) {
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal(resolve(REPO_ROOT, '.env.local'));

const APPLY = process.argv.includes('--apply');
const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing dev store env vars'); process.exit(1); }

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

function readCache(handle) {
  const p = resolve(REPO_ROOT, 'product-catalog', '.cache', 'products', `${handle}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function pickPrice(cache) {
  const prices = (cache.variants || [])
    .map((v) => parseFloat(v.price))
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  return prices[0]?.toFixed(2) ?? null;
}

async function main() {
  console.log(`-> Finalize draft products on ${STORE}${APPLY ? '' : ' [DRY RUN]'}`);

  // 1. Find all DRAFT products + the zubehoer collection.
  const data = await gql(`{
    products(first: 100, query: "status:DRAFT") {
      edges { node { id handle title status variants(first:1){ edges { node { id price } } } } }
    }
    collectionByHandle(handle: "zubehoer") { id title }
  }`);

  const drafts = data.products.edges.map((e) => e.node);
  const zubehoer = data.collectionByHandle;
  if (!zubehoer) { console.error('zubehoer collection not found'); process.exit(1); }
  console.log(`   Found ${drafts.length} DRAFT product(s); zubehoer = ${zubehoer.id}`);

  const productIdsToAdd = [];
  let priceUpdates = 0, priceMissing = 0;

  for (const p of drafts) {
    const cache = readCache(p.handle);
    if (!cache) { console.warn(`   ! ${p.handle}: no cache file`); priceMissing++; continue; }
    const newPrice = pickPrice(cache);
    if (!newPrice) { console.warn(`   ! ${p.handle}: no price in cache`); priceMissing++; continue; }

    const variantId = p.variants.edges[0]?.node?.id;
    if (!variantId) { console.warn(`   ! ${p.handle}: no default variant`); continue; }

    console.log(`   - ${p.handle}: set price €${newPrice}, add to zubehoer`);
    if (APPLY) {
      const upd = await gql(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }`,
        { productId: p.id, variants: [{ id: variantId, price: newPrice }] },
      );
      const errs = upd.productVariantsBulkUpdate.userErrors;
      if (errs.length) console.warn(`      ! price update: ${JSON.stringify(errs)}`);
      else priceUpdates++;
    } else {
      priceUpdates++;
    }
    productIdsToAdd.push(p.id);
  }

  // 2. Add products to zubehoer collection in bulk.
  if (productIdsToAdd.length) {
    console.log(`\n   Adding ${productIdsToAdd.length} product(s) to zubehoer collection`);
    if (APPLY) {
      const add = await gql(
        `mutation($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            collection { productsCount { count } }
            userErrors { field message }
          }
        }`,
        { id: zubehoer.id, productIds: productIdsToAdd },
      );
      const errs = add.collectionAddProducts.userErrors;
      if (errs.length) console.warn(`   ! collection add: ${JSON.stringify(errs)}`);
      else console.log(`   ✓ zubehoer now has ${add.collectionAddProducts.collection.productsCount.count} products`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Mode:                    ${APPLY ? 'LIVE' : 'DRY RUN'}`);
  console.log(`DRAFT products found:    ${drafts.length}`);
  console.log(`Prices ${APPLY ? 'set' : 'planned'}:           ${priceUpdates}`);
  console.log(`Prices missing in cache: ${priceMissing}`);
  console.log(`${APPLY ? 'Added' : 'Would add'} to zubehoer:    ${productIdsToAdd.length}`);
  console.log(`\nNote: products remain DRAFT. Promote to ACTIVE in Shopify Admin once descriptions are added.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
