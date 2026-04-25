#!/usr/bin/env node
/**
 * wipe-catalog.mjs
 *
 * Phase 2 of the catalog rebuild: nuke products + duplicate empty
 * "-korper" (no umlaut transliteration) collections from the dev store
 * so Phase 3 can re-create from data/catalog/gberg-catalog.json with
 * clean handles.
 *
 * Default: --dry-run. Pass --apply to actually delete.
 *
 * Usage:
 *   node agent/scripts/wipe-catalog.mjs                  # dry-run, dev store
 *   node agent/scripts/wipe-catalog.mjs --apply          # actually delete (dev)
 *   node agent/scripts/wipe-catalog.mjs --apply --store prod   # gated by pre-tool hook
 *
 * What it deletes:
 *   - ALL products in the store (active + draft + archived).
 *   - The 6 historical duplicate empty collections (no-umlaut variants):
 *       badheizkorper, wohnraumheizkorper, austauschheizkorper,
 *       handtuchwaermer, heizkoerper (aggregate, intentionally empty), heizkorper
 *     PLUS only deletes them if they currently contain 0 products.
 *
 * What it leaves alone:
 *   - The Shopify built-in "frontpage" / "all" collections.
 *   - Any populated collection.
 *   - Metaobjects, pages, menus, translations, theme.
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const STORE_FLAG_IDX = process.argv.indexOf('--store');
const STORE = STORE_FLAG_IDX >= 0 ? process.argv[STORE_FLAG_IDX + 1] : 'dev';

const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';
const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

// Collection handles we want to drop IF empty. These are leftover duplicates
// from the umlaut→ae/oe migration. The "-koerper" variants are the canonical
// ones we keep; anything in this list that turns out to still have products
// will be skipped (we never delete a populated collection here).
const DUP_COLLECTION_HANDLES = [
  'badheizkorper',
  'wohnraumheizkorper',
  'austauschheizkorper',
  'handtuchwaermer',
  'heizkoerper',
  'heizkorper',
];

// Shopify built-ins / merchandising — never touch.
const SHOPIFY_RESERVED = new Set(['frontpage', 'all']);

async function graphql(query, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function listAllProducts() {
  const out = [];
  let cursor = null;
  do {
    const data = await graphql(
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title status }
        }
      }`,
      { cursor },
    );
    out.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

async function listAllCollections() {
  const out = [];
  let cursor = null;
  do {
    const data = await graphql(
      `query ($cursor: String) {
        collections(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title productsCount { count } }
        }
      }`,
      { cursor },
    );
    out.push(...data.collections.nodes);
    cursor = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

async function deleteProduct(id) {
  const data = await graphql(
    `mutation ($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors { field message }
      }
    }`,
    { input: { id } },
  );
  const errs = data.productDelete.userErrors || [];
  if (errs.length) throw new Error(JSON.stringify(errs));
  return data.productDelete.deletedProductId;
}

async function deleteCollection(id) {
  const data = await graphql(
    `mutation ($input: CollectionDeleteInput!) {
      collectionDelete(input: $input) {
        deletedCollectionId
        userErrors { field message }
      }
    }`,
    { input: { id } },
  );
  const errs = data.collectionDelete.userErrors || [];
  if (errs.length) throw new Error(JSON.stringify(errs));
  return data.collectionDelete.deletedCollectionId;
}

async function main() {
  console.log(`[wipe] store=${STORE} domain=${storeDomain} mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // --- 1. products -----------------------------------------------------------
  const products = await listAllProducts();
  const byStatus = products.reduce((acc, p) => ((acc[p.status] = (acc[p.status] || 0) + 1), acc), {});
  console.log(`[wipe] products: ${products.length} total — ${JSON.stringify(byStatus)}`);

  // --- 2. duplicate collections ---------------------------------------------
  const collections = await listAllCollections();
  const dupVictims = [];
  for (const c of collections) {
    if (!DUP_COLLECTION_HANDLES.includes(c.handle)) continue;
    if (SHOPIFY_RESERVED.has(c.handle)) continue;
    const count = c.productsCount?.count ?? 0;
    if (count > 0) {
      console.log(`[wipe]   skip dup collection ${c.handle}: ${count} product(s) still attached`);
      continue;
    }
    dupVictims.push(c);
  }
  console.log(`[wipe] duplicate empty collections to delete: ${dupVictims.length}`);
  for (const c of dupVictims) console.log(`  - ${c.handle} (${c.title})`);

  // --- 3. apply / dry-run ----------------------------------------------------
  if (DRY_RUN) {
    console.log(`[wipe] DRY-RUN — pass --apply to actually delete:`);
    console.log(`         · ${products.length} products`);
    console.log(`         · ${dupVictims.length} duplicate empty collections`);
    return;
  }

  console.log(`[wipe] APPLY: deleting ${products.length} products...`);
  let pOk = 0;
  let pFail = 0;
  for (const p of products) {
    try {
      await deleteProduct(p.id);
      pOk++;
      if (pOk % 10 === 0) console.log(`[wipe]   ${pOk}/${products.length} products deleted...`);
    } catch (err) {
      pFail++;
      console.error(`[wipe]   FAILED product ${p.handle}: ${err.message}`);
    }
  }
  console.log(`[wipe] products: ${pOk} deleted, ${pFail} failed.`);

  console.log(`[wipe] APPLY: deleting ${dupVictims.length} empty duplicate collections...`);
  let cOk = 0;
  let cFail = 0;
  for (const c of dupVictims) {
    try {
      await deleteCollection(c.id);
      cOk++;
      console.log(`[wipe]   deleted collection ${c.handle}`);
    } catch (err) {
      cFail++;
      console.error(`[wipe]   FAILED collection ${c.handle}: ${err.message}`);
    }
  }
  console.log(`[wipe] collections: ${cOk} deleted, ${cFail} failed.`);

  console.log(`[wipe] done.`);
}

main().catch((err) => {
  console.error(`[wipe] FATAL: ${err.message}`);
  process.exit(1);
});
