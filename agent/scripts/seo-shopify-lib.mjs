/**
 * Shared helpers for the SEO ops scripts (install-ga4-web-pixel,
 * submit-sitemaps, install-product-redirects). Mirrors the env-loading +
 * Admin-GraphQL transport convention used by install-metafield-definitions.mjs
 * so all agent scripts behave the same.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');

export function loadEnvLocal(path = resolve(REPO_ROOT, '.env.local')) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    has: (name) => argv.includes(name),
    get: (name, fallback) => {
      const i = argv.indexOf(name);
      return i === -1 ? fallback : argv[i + 1];
    },
  };
}

/** Resolve Shopify Admin credentials for a dev|prod store. */
export function resolveShopify(store = 'dev') {
  if (store !== 'dev' && store !== 'prod') {
    throw new Error(`--store must be "dev" or "prod" (got ${JSON.stringify(store)})`);
  }
  const suffix = store === 'prod' ? 'PROD' : 'DEV';
  const shop = process.env[`SHOPIFY_${suffix}_STORE`];
  const token = process.env[`SHOPIFY_${suffix}_ADMIN_TOKEN`];
  if (!shop || !token) {
    throw new Error(
      `SHOPIFY_${suffix}_STORE and SHOPIFY_${suffix}_ADMIN_TOKEN must be set (.env.local at repo root or shell env).`,
    );
  }
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  return {shop, token, apiVersion, url};
}

/** Minimal Admin GraphQL client. Throws on HTTP error or top-level errors. */
export function makeGqlClient({url, token}) {
  return async function gql(query, variables = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        Accept: 'application/json',
      },
      body: JSON.stringify({query, variables}),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Admin GraphQL HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Admin GraphQL: non-JSON response: ${text.slice(0, 500)}`);
    }
    if (json.errors) {
      throw new Error(`Admin GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  };
}
