#!/usr/bin/env node
/**
 * enable-extra-locales.mjs
 *
 * Provisions and publishes the canonical 4 storefront locales for the
 * NL-led launch:
 *
 *   nl  primary launch language (Dutch)
 *   de  secondary           (German — DE/AT)
 *   fr  secondary           (French — BE-FR / FR / LU)
 *   en  fallback             (English)
 *
 * Idempotent:
 *   - locale absent          → shopLocaleEnable     (creates published)
 *   - locale unpublished     → shopLocaleUpdate(published: true)
 *   - locale already on      → skip
 *
 * Primary locale: this script will request a primary-locale change to `nl`
 * via shopLocaleUpdate({ primary: true }). Shopify's behavior for changing
 * primary locale is asymmetric — the new primary inherits all source values,
 * and the previous primary becomes a regular published locale. If the API
 * call is rejected (some plans/regions block this), we log it and document
 * the manual click. We never silently leave it on the wrong primary.
 *
 * Translation content is NOT authored here — that is a separate Translate &
 * Adapt step (see translate-theme-content.mjs). Locale enablement is free.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 * Scopes required: write_locales, read_locales.
 *
 * Flags:
 *   --apply         actually mutate the store (default is dry-run)
 *   --store <key>   informational
 *   --no-set-primary  skip the primary-locale flip (useful for prod)
 *
 * Safety: refuses to run if SHOPIFY_DEV_STORE does not end with
 * `-dev.myshopify.com`.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

// Canonical launch locales in display order. NL must come first because it
// is the desired primary; the rest are publish-only.
const TARGET_LOCALES = ['nl', 'de', 'fr', 'en'];
const PRIMARY_LOCALE = 'nl';

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
const NO_SET_PRIMARY = ARGV.includes('--no-set-primary');
const storeFlagIdx = ARGV.indexOf('--store');
const STORE_FLAG = storeFlagIdx >= 0 ? ARGV[storeFlagIdx + 1] : 'dev';

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing env vars: SHOPIFY_DEV_STORE and/or SHOPIFY_DEV_ADMIN_TOKEN');
  console.error('Add them to .env.local at the repo root.');
  process.exit(1);
}

if (!STORE.endsWith('-dev.myshopify.com')) {
  console.error(`Refusing to run: SHOPIFY_DEV_STORE="${STORE}" does not end with "-dev.myshopify.com".`);
  console.error('This script is dev-only. To target prod, write a separate script with explicit confirmation.');
  process.exit(1);
}

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

console.log(`→ enable-extra-locales  store=${STORE_FLAG} (${STORE})  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  target locales : ${TARGET_LOCALES.join(', ')}`);
console.log(`  primary locale : ${PRIMARY_LOCALE}${NO_SET_PRIMARY ? '  (skip-set)' : ''}`);
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
 *   - absent              → shopLocaleEnable
 *   - present unpublished → shopLocaleUpdate({ published: true })
 *   - present published   → skip
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

/**
 * Set PRIMARY_LOCALE as the shop's primary locale.
 *
 * Note: Shopify's primary-locale change is sensitive — it rewires which locale
 * holds the "source" values. Theme + product content currently authored in EN
 * will be re-read as if EN is the new "translation" of NL. This is fine for
 * the EN-fallback model: we keep the EN strings as source-of-truth in code
 * (theme/locales/en.default.json, lib/i18n/messages/en.json) and let the
 * Translate & Adapt content layer present them under any locale label.
 *
 * If shopify rejects this change (some plans block it via API), we log the
 * userError and document the manual Admin click.
 */
async function setPrimaryLocale(current) {
  if (NO_SET_PRIMARY) {
    console.log(`\n→ Skipping primary-locale change (--no-set-primary).`);
    return { action: 'skipped' };
  }
  const cur = current.find((l) => l.primary);
  if (cur && cur.locale === PRIMARY_LOCALE) {
    console.log(`\n→ Primary locale already ${PRIMARY_LOCALE} — skipping flip.`);
    return { action: 'skip' };
  }
  console.log(`\n→ Primary-locale change: ${cur?.locale || '(none)'} → ${PRIMARY_LOCALE}`);
  if (!APPLY) {
    console.log(`  · would update shopLocale(${PRIMARY_LOCALE}) primary=true`);
    return { action: 'would-flip' };
  }
  try {
    const res = await gql(SHOP_LOCALE_UPDATE, {
      locale: PRIMARY_LOCALE,
      shopLocale: { primary: true, published: true },
    });
    const errs = res.shopLocaleUpdate.userErrors;
    if (errs.length) {
      console.warn(`  ⚠ shopLocaleUpdate primary=true rejected: ${JSON.stringify(errs)}`);
      console.warn(`    → Manual fix: Admin → Settings → Languages → Change default to Dutch.`);
      return { action: 'manual-required', errors: errs };
    }
    console.log(`  ✓ primary locale flipped to ${PRIMARY_LOCALE}`);
    return { action: 'flipped' };
  } catch (err) {
    console.warn(`  ⚠ primary-locale change threw: ${err.message}`);
    console.warn(`    → Manual fix: Admin → Settings → Languages → Change default to Dutch.`);
    return { action: 'manual-required', errors: [err.message] };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n→ Step 1: Fetch current shopLocales');
  const before = await fetchShopLocales();
  printLocalesTable('BEFORE', before);

  console.log('\n→ Step 2: Reconcile target locales (nl, de, fr, en)');
  const results = [];
  for (const code of TARGET_LOCALES) {
    results.push(await ensureLocale(code, before));
  }

  console.log('\n→ Step 3: Set primary locale');
  // Re-fetch in case we just published nl.
  const afterPub = await fetchShopLocales();
  const primaryResult = await setPrimaryLocale(afterPub);

  console.log('\n→ Step 4: Final shopLocales snapshot');
  const after = await fetchShopLocales();
  printLocalesTable('AFTER', after);

  console.log('\n— Action summary —');
  for (const r of results) console.log(`  ${r.locale}: ${r.action}`);
  console.log(`  primary: ${primaryResult.action}`);

  console.log('\nDone.');
  if (!APPLY) {
    console.log('\n(dry-run only — re-run with --apply to perform the writes.)');
  } else {
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('NEXT STEP — translation content:');
    console.log('  Locale enablement is free. Storefront strings stay in the');
    console.log('  source locale until translations are registered. Run:');
    console.log('    node agent/scripts/translate-theme-content.mjs --locale de --apply');
    console.log('    node agent/scripts/translate-theme-content.mjs --locale fr --apply');
    console.log('  (NL becomes the new primary; its values come from the source');
    console.log('   theme JSON, so no register call is needed once primary flips.');
    console.log('   Until the primary flips, NL also needs a register pass.)');
    console.log('────────────────────────────────────────────────────────────');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
