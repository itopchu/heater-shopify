#!/usr/bin/env node
/**
 * install-product-redirects.mjs
 *
 * Creates Shopify-native URL redirects (301) for retired products that
 * have a clear successor, so link equity moves to the new PDP instead of
 * dead-ending on the 410 the storefront otherwise returns. Reads
 * `data/product-redirects.csv` (columns: old_handle,new_handle) and calls
 * the Admin GraphQL `urlRedirectCreate` mutation for each row, skipping
 * any redirect path that already exists. Idempotent — re-run safely; the
 * catalog-sync pipeline can append rows when it deactivates a product.
 *
 * Flags:
 *   --store dev|prod   Target store. Default: dev.
 *   --dry-run          Print intended redirects, do nothing.
 *   --file PATH        Override CSV path (default data/product-redirects.csv).
 *
 *   node agent/scripts/install-product-redirects.mjs --store dev --dry-run
 *   node agent/scripts/install-product-redirects.mjs --store prod
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  REPO_ROOT,
  loadEnvLocal,
  parseArgs,
  resolveShopify,
  makeGqlClient,
} from './seo-shopify-lib.mjs';

const args = parseArgs();
const STORE = args.get('--store', 'dev');
const DRY_RUN = args.has('--dry-run');
const CSV_PATH = resolve(REPO_ROOT, args.get('--file', 'data/product-redirects.csv'));

loadEnvLocal();

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [a, b] = t.split(',').map((s) => s.trim());
    if (!a) continue;
    if (a.toLowerCase() === 'old_handle') continue; // header
    if (!b) {
      console.warn(`[redirects] skipping "${a}" — no new_handle (keeps its 410).`);
      continue;
    }
    rows.push({oldHandle: a.replace(/^\/+/, ''), newHandle: b.replace(/^\/+/, '')});
  }
  return rows;
}

const Q_EXISTING = /* GraphQL */ `
  query ($q: String!) {
    urlRedirects(first: 1, query: $q) { edges { node { id path target } } }
  }
`;
const M_CREATE = /* GraphQL */ `
  mutation ($redirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $redirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;

async function main() {
  let csv;
  try {
    csv = readFileSync(CSV_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[redirects] no CSV at ${CSV_PATH} — nothing to do.`);
      return;
    }
    throw err;
  }
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    console.log('[redirects] CSV has no data rows — nothing to do.');
    return;
  }

  const {url, token, shop} = resolveShopify(STORE);
  const gql = makeGqlClient({url, token});
  console.log(`[redirects] store=${shop} rows=${rows.length}${DRY_RUN ? ' (dry-run)' : ''}`);

  for (const {oldHandle, newHandle} of rows) {
    const path = `/products/${oldHandle}`;
    const target = `/products/${newHandle}`;
    if (DRY_RUN) {
      console.log(`[redirects] would create 301  ${path}  →  ${target}`);
      continue;
    }
    const existing = await gql(Q_EXISTING, {q: `path:${path}`});
    if (existing?.urlRedirects?.edges?.length) {
      console.log(`[redirects] skip (exists)  ${path}  →  ${existing.urlRedirects.edges[0].node.target}`);
      continue;
    }
    const data = await gql(M_CREATE, {redirect: {path, target}});
    const ue = data?.urlRedirectCreate?.userErrors ?? [];
    if (ue.length) {
      console.error(`[redirects] FAILED  ${path}: ${JSON.stringify(ue)}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`[redirects] created 301  ${path}  →  ${target}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
