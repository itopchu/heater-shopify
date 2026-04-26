#!/usr/bin/env node
/**
 * enable-extra-locales.mjs
 *
 * Provisions and publishes additional storefront locales on the G-Berg dev
 * store so the storefront language picker (rendered by the theme from the
 * shop's published locale list) shows EN/DE/NL/ES/FR/IT.
 *
 * Target locales: es, fr, it. The script is idempotent:
 *
 *   - if a locale is absent          → shopLocaleCreate (creates published)
 *   - if present but unpublished     → shopLocaleUpdate(published: true)
 *   - if already published           → skip
 *
 * The shop's primary locale is left untouched. Translation content is NOT
 * authored here — that is a separate Translate & Adapt step (and the only
 * step that costs money). Locale enablement itself is free.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 * Scopes required: write_locales, read_locales.
 *
 * Flags:
 *   --apply        actually mutate the store (default is dry-run)
 *   --store <key>  informational; we always read the dev creds from env
 *
 * Safety: refuses to run if SHOPIFY_DEV_STORE does not end with
 * `-dev.myshopify.com`. This script is dev-only by design.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

// Locales to ensure are published, in display order.
const TARGET_LOCALES = ['es', 'fr', 'it'];

function loadEnvLocal(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
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
loadEnvLocal(ENV_PATH);

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const storeFlagIdx = ARGV.indexOf('--store');
const STORE_FLAG = storeFlagIdx >= 0 ? ARGV[storeFlagIdx + 1] : 'dev';

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing env vars: SHOPIFY_DEV_STORE and/or SHOPIFY_DEV_ADMIN_TOKEN');
  console.error('Add them to .env.local at the repo root.');
  process.exit(1);
}

// Dev-store safety check — refuse to mutate a non-dev store.
if (!STORE.endsWith('-dev.myshopify.com')) {
  console.error(`Refusing to run: SHOPIFY_DEV_STORE="${STORE}" does not end with "-dev.myshopify.com".`);
  console.error('This script is dev-only. To target prod, write a separate script with explicit confirmation.');
  process.exit(1);
}

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

console.log(`→ enable-extra-locales  store=${STORE_FLAG} (${STORE})  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  target locales: ${TARGET_LOCALES.join(', ')}`);
if (!APPLY) {
  console.log('  (dry-run: no mutations will be sent. Re-run with --apply to write.)');
}

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------
const SHOP_LOCALES_QUERY = `
  query {
    shopLocales {
      locale
      name
      primary
      published
    }
  }
`;

const SHOP_LOCALE_CREATE = `
  mutation($locale: String!) {
    shopLocaleEnable(locale: $locale) {
      shopLocale { locale name primary published }
      userErrors { field message }
    }
  }
`;

const SHOP_LOCALE_UPDATE = `
  mutation($locale: String!, $shopLocale: ShopLocaleInput!) {
    shopLocaleUpdate(locale: $locale, shopLocale: $shopLocale) {
      shopLocale { locale name primary published }
      userErrors { field message }
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchShopLocales() {
  const data = await gql(SHOP_LOCALES_QUERY);
  return data.shopLocales;
}

function printLocalesTable(label, locales) {
  console.log(`\n— ${label} —`);
  console.log('  locale  primary  published  name');
  console.log('  ------  -------  ---------  ----------------');
  const sorted = [...locales].sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return a.locale.localeCompare(b.locale);
  });
  for (const l of sorted) {
    const loc = l.locale.padEnd(6);
    const pri = (l.primary ? 'yes' : 'no ').padEnd(7);
    const pub = (l.published ? 'yes' : 'no ').padEnd(9);
    console.log(`  ${loc}  ${pri}  ${pub}  ${l.name || ''}`);
  }
  console.log(`  → total: ${locales.length}, published: ${locales.filter((l) => l.published).length}`);
}

/**
 * Ensure a locale exists and is published.
 *   - absent    → shopLocaleEnable(locale)            (creates AND publishes)
 *   - present + unpublished → shopLocaleUpdate({ published: true })
 *   - present + published   → skip
 *
 * Note: the GraphQL mutation `shopLocaleEnable` is the canonical "create"
 * call in API 2026-04 — it provisions a locale and publishes it in one shot.
 * There is no separate `shopLocaleCreate` field in the Admin schema. The
 * companion "publish toggle" for an existing locale is `shopLocaleUpdate`.
 */
async function ensureLocale(localeCode, current) {
  const existing = current.find((l) => l.locale === localeCode);

  if (existing && existing.published) {
    console.log(`  · ${localeCode}: skip — already published`);
    return { action: 'skip', locale: localeCode };
  }

  if (existing && !existing.published) {
    if (!APPLY) {
      console.log(`  · ${localeCode}: would publish (currently provisioned but unpublished)`);
      return { action: 'would-publish', locale: localeCode };
    }
    const res = await gql(SHOP_LOCALE_UPDATE, {
      locale: localeCode,
      shopLocale: { published: true },
    });
    const errs = res.shopLocaleUpdate.userErrors;
    if (errs.length) throw new Error(`shopLocaleUpdate ${localeCode}: ${JSON.stringify(errs)}`);
    console.log(`  ✓ ${localeCode}: published`);
    return { action: 'published', locale: localeCode };
  }

  // Absent → create + publish.
  if (!APPLY) {
    console.log(`  · ${localeCode}: would create + publish (locale not provisioned)`);
    return { action: 'would-create', locale: localeCode };
  }
  const res = await gql(SHOP_LOCALE_CREATE, { locale: localeCode });
  const errs = res.shopLocaleEnable.userErrors;
  if (errs.length) throw new Error(`shopLocaleEnable ${localeCode}: ${JSON.stringify(errs)}`);
  console.log(`  ✓ ${localeCode}: created + published`);
  return { action: 'created', locale: localeCode };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n→ Step 1: Fetch current shopLocales');
  const before = await fetchShopLocales();
  printLocalesTable('BEFORE', before);

  console.log('\n→ Step 2: Reconcile target locales');
  const results = [];
  for (const code of TARGET_LOCALES) {
    results.push(await ensureLocale(code, before));
  }

  console.log('\n→ Step 3: Re-fetch shopLocales');
  const after = await fetchShopLocales();
  printLocalesTable('AFTER', after);

  console.log('\n— Action summary —');
  for (const r of results) {
    console.log(`  ${r.locale}: ${r.action}`);
  }

  console.log('\nDone.');
  if (!APPLY) {
    console.log('\n(dry-run only — re-run with --apply to perform the writes.)');
  } else {
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('NEXT STEP — translation content:');
    console.log('  Locale enablement is free. Storefront strings stay in the');
    console.log('  source locale until translations are registered (manually');
    console.log('  via Admin → Apps → Translate & Adapt, or programmatically');
    console.log('  via translationsRegister). The picker will show all 6');
    console.log('  locales immediately regardless.');
    console.log('────────────────────────────────────────────────────────────');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
