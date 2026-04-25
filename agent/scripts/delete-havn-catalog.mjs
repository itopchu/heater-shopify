#!/usr/bin/env node
/**
 * delete-havn-catalog.mjs
 *
 * Wipes the placeholder Havn catalog from the active store. Idempotent.
 * Safe to re-run — products already absent are skipped.
 *
 * Usage:
 *   node agent/scripts/delete-havn-catalog.mjs                # dev store (default)
 *   node agent/scripts/delete-havn-catalog.mjs --dry-run      # preview, no deletes
 *   node agent/scripts/delete-havn-catalog.mjs --store prod   # pre-tool hook still gates this
 *
 * What it deletes:
 *   - Any product whose handle starts with "havn-"
 *   - Any product whose vendor is "Havn"
 *
 * What it leaves alone:
 *   - Collections (Phase B's seed-collections.mjs will reuse any xxl-compatible handles)
 *   - Metaobjects, pages, menus, translations
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
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

async function findHavnProducts() {
  const found = [];
  let cursor = null;
  do {
    const data = await graphql(
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title vendor }
        }
      }`,
      { cursor },
    );
    for (const p of data.products.nodes) {
      if (p.handle.startsWith('havn-') || p.vendor === 'Havn') {
        found.push(p);
      }
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return found;
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
  const errs = data.productDelete.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
  return data.productDelete.deletedProductId;
}

async function main() {
  console.log(`[wipe] store=${STORE} domain=${storeDomain} dry=${DRY_RUN}`);
  const victims = await findHavnProducts();

  if (victims.length === 0) {
    console.log('[wipe] no Havn products found — already clean.');
    return;
  }

  console.log(`[wipe] ${victims.length} Havn product(s) to delete:`);
  for (const v of victims) console.log(`  - ${v.handle} (${v.title}) vendor="${v.vendor}"`);

  if (DRY_RUN) {
    console.log('[wipe] dry-run, not deleting.');
    return;
  }

  for (const v of victims) {
    try {
      const id = await deleteProduct(v.id);
      console.log(`[wipe] deleted: ${v.handle} (${id})`);
    } catch (err) {
      console.error(`[wipe] FAILED ${v.handle}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(`[wipe] ERROR: ${err.message}`);
  process.exit(1);
});
