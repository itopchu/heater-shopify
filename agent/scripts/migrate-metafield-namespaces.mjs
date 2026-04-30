#!/usr/bin/env node
/*
 * migrate-metafield-namespaces.mjs
 *
 * Migrates existing PRODUCT metafields from the legacy `gberg.*` namespace
 * to the brief-compliant namespace structure
 * (see for-claude/shop/08_shopify_metafields_metaobjects_definitions.md).
 *
 * Mapping:
 *   gberg.local_images       (json)                     -> media.local_images
 *   gberg.local_pdf_path     (single_line_text_field)   -> media.primary_pdf_url
 *   gberg.image_status       (single_line_text_field)   -> media.image_status
 *   gberg.copy_status        (single_line_text_field)   -> custom.copy_status
 *   gberg.specs_raw          (json)                     -> specs.raw_source
 *   gberg.sections_de        (json)                     -> content.sections_de
 *
 * Flow per product:
 *   1. Query all metafields under namespace "gberg".
 *   2. For each known key, write the new (namespace, key) via metafieldsSet.
 *   3. Unless --keep-old, delete the gberg.* metafield via metafieldsDelete.
 *
 * Idempotent: re-running after a successful pass writes identical values
 * (Shopify treats metafieldsSet as upsert by ownerId+namespace+key) and the
 * delete pass quietly skips already-deleted handles.
 *
 * Flags:
 *   --dry-run       Print plan, no mutations.
 *   --store dev|prod   Default: dev.
 *   --keep-old      Keep the gberg.* metafields after writing the new ones.
 *                   First pass should always be run with --keep-old, then
 *                   verify, then re-run without it to delete.
 *   --limit N       Process at most N products (smoke test).
 *
 * Run:
 *   node agent/scripts/migrate-metafield-namespaces.mjs --dry-run
 *   node agent/scripts/migrate-metafield-namespaces.mjs --store dev --keep-old
 *   node agent/scripts/migrate-metafield-namespaces.mjs --store dev          # deletes old
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const ARGV = process.argv.slice(2);
const DRY_RUN = ARGV.includes('--dry-run');
const KEEP_OLD = ARGV.includes('--keep-old');
const STORE = (() => {
  const i = ARGV.indexOf('--store');
  return i === -1 ? 'dev' : ARGV[i + 1];
})();
const LIMIT = (() => {
  const i = ARGV.indexOf('--limit');
  if (i === -1) return null;
  const n = Number(ARGV[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

if (STORE !== 'dev' && STORE !== 'prod') {
  console.error(`FATAL: --store must be "dev" or "prod" (got ${JSON.stringify(STORE)})`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

function loadEnvLocal(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal(ENV_PATH);

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const SUFFIX = STORE === 'prod' ? 'PROD' : 'DEV';
const SHOP = process.env[`SHOPIFY_${SUFFIX}_STORE`];
const TOKEN = process.env[`SHOPIFY_${SUFFIX}_ADMIN_TOKEN`];

if (!SHOP || !TOKEN) {
  console.error(`FATAL: SHOPIFY_${SUFFIX}_STORE and SHOPIFY_${SUFFIX}_ADMIN_TOKEN must be set.`);
  process.exit(1);
}

const GRAPHQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

// ---------------------------------------------------------------------------
// Migration map
// ---------------------------------------------------------------------------
//
// Each entry maps a legacy gberg.* (key, type) to the new (namespace, key,
// type). Type may differ — e.g. specs_raw is `json` in both, but listed
// explicitly so we never silently change a type.

const MIGRATION = {
  local_images:    { newNamespace: 'media',   newKey: 'local_images',     newType: 'json' },
  local_pdf_path:  { newNamespace: 'media',   newKey: 'primary_pdf_url',  newType: 'single_line_text_field' },
  image_status:    { newNamespace: 'media',   newKey: 'image_status',     newType: 'single_line_text_field' },
  copy_status:     { newNamespace: 'custom',  newKey: 'copy_status',      newType: 'single_line_text_field' },
  specs_raw:       { newNamespace: 'specs',   newKey: 'raw_source',       newType: 'json' },
  sections_de:     { newNamespace: 'content', newKey: 'sections_de',      newType: 'json' },
};

// ---------------------------------------------------------------------------
// GraphQL helpers
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
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

const Q_PRODUCTS_PAGE = /* GraphQL */ `
  query ($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        metafields(namespace: "gberg", first: 25) {
          nodes { id namespace key type value }
        }
      }
    }
  }
`;

const M_METAFIELDS_SET = /* GraphQL */ `
  mutation ($input: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $input) {
      metafields { id namespace key }
      userErrors { field message code }
    }
  }
`;

const M_METAFIELDS_DELETE = /* GraphQL */ `
  mutation ($input: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $input) {
      deletedMetafields { ownerId namespace key }
      userErrors { field message }
    }
  }
`;

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function listProducts() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(Q_PRODUCTS_PAGE, { cursor });
    for (const n of data.products.nodes) out.push(n);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    if (LIMIT && out.length >= LIMIT) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function migrateOne(product, counters) {
  const handle = product.handle;
  const gbergMfs = product.metafields.nodes;
  if (gbergMfs.length === 0) {
    counters.productsNoLegacy++;
    return;
  }

  const writes = [];
  const deletes = [];
  const skipped = [];

  for (const mf of gbergMfs) {
    const map = MIGRATION[mf.key];
    if (!map) {
      skipped.push(`unknown_legacy_key:${mf.key}`);
      continue;
    }
    // Don't write empty single_line_text_field values (Shopify rejects).
    if (
      map.newType === 'single_line_text_field' &&
      (typeof mf.value !== 'string' || mf.value.trim() === '')
    ) {
      skipped.push(`empty_text_value:${mf.key}`);
    } else {
      writes.push({
        ownerId: product.id,
        namespace: map.newNamespace,
        key: map.newKey,
        type: map.newType,
        value: mf.value,
      });
    }
    if (!KEEP_OLD) {
      deletes.push({ ownerId: product.id, namespace: 'gberg', key: mf.key });
    }
  }

  console.log(`\n[${handle}]`);
  console.log(`  legacy keys: ${gbergMfs.map((m) => m.key).join(',') || '(none)'}`);
  for (const w of writes) {
    const preview = (w.value || '').toString().slice(0, 60).replace(/\s+/g, ' ');
    console.log(`  → write ${w.namespace}.${w.key} (${w.type}) = ${preview}${(w.value || '').length > 60 ? '…' : ''}`);
  }
  for (const d of deletes) {
    console.log(`  → delete ${d.namespace}.${d.key}`);
  }
  for (const s of skipped) {
    console.log(`  → skip ${s}`);
  }

  if (DRY_RUN) {
    counters.dryRunWrites += writes.length;
    counters.dryRunDeletes += deletes.length;
    return;
  }

  if (writes.length > 0) {
    const data = await gql(M_METAFIELDS_SET, { input: writes });
    const errs = data.metafieldsSet.userErrors;
    if (errs.length) {
      throw new Error(`metafieldsSet(${handle}): ${JSON.stringify(errs)}`);
    }
    counters.wrote += writes.length;
  }
  if (deletes.length > 0) {
    const data = await gql(M_METAFIELDS_DELETE, { input: deletes });
    const errs = data.metafieldsDelete.userErrors;
    if (errs.length) {
      // metafieldsDelete reports a userError when the metafield is already
      // gone (re-run safety). Treat "not found" as soft-success.
      const fatal = errs.filter((e) => !/not found/i.test(e.message || ''));
      if (fatal.length) throw new Error(`metafieldsDelete(${handle}): ${JSON.stringify(fatal)}`);
    }
    counters.deleted += data.metafieldsDelete.deletedMetafields.length;
  }
  counters.productsTouched++;
}

async function main() {
  console.log(`→ migrate-metafield-namespaces on ${SHOP} (Admin API ${API_VERSION})`);
  console.log(`  store=${STORE} dry_run=${DRY_RUN} keep_old=${KEEP_OLD}${LIMIT ? ` limit=${LIMIT}` : ''}`);

  const products = await listProducts();
  console.log(`  found ${products.length} products to inspect`);

  const counters = {
    productsTouched: 0,
    productsNoLegacy: 0,
    wrote: 0,
    deleted: 0,
    dryRunWrites: 0,
    dryRunDeletes: 0,
  };

  for (const p of products) {
    await migrateOne(p, counters);
  }

  console.log('\n=== summary ===');
  console.log(JSON.stringify(counters, null, 2));
  if (DRY_RUN) {
    console.log('(DRY RUN — no mutations performed)');
  } else if (KEEP_OLD) {
    console.log('(--keep-old: legacy gberg.* metafields retained — re-run without --keep-old to delete)');
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
