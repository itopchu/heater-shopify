#!/usr/bin/env node
/**
 * Europe multi-country Markets provisioning for heater-shopify.
 *
 * Brief 01 / 07 §12 — Netherlands is the primary launch market with planned
 * expansion to Belgium, Luxembourg, Germany, France. Austria is a
 * pre-existing tenant of the same market and remains on it (single Europe
 * market with country-level regions; sub-path locale routing rather than
 * per-domain). Spain was removed in 2026-05 — no longer a shipping
 * destination.
 *
 * Decision: one Shopify Market named "Europe" with multiple country regions
 * rather than per-country markets. Rationale:
 *   - All countries share the same currency (EUR) and the same primary domain
 *     (heater-dev.myshopify.com). A single market with regions is the simplest
 *     model that satisfies country-level routing + VAT and avoids fan-out.
 *   - Per-country VAT is set in Settings → Taxes (Admin GraphQL 2026-04 still
 *     does not expose tax-region overrides). The single market is enough to
 *     give Shopify the country context it needs to apply the right rate.
 *   - Per-country shipping carriers are configured via configure-shipping.mjs
 *     using one zone per country on the default delivery profile.
 *
 * NL is documented as the *primary launch market* (first market for which we
 * surface storefront copy, run hreflang against, and route the root redirect
 * to). Shopify itself does not have a "primary market" concept distinct from
 * the shop's primary country; that is a frontend-side designation.
 *
 * Idempotent: re-running adds missing countries, never duplicates the market.
 *
 * Flags:
 *   --dry-run     read-only — print plan, send no mutations (default)
 *   --apply       perform writes
 *   --store dev   informational; creds always come from .env.local
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const MARKET_NAME = 'Europe';

// Countries in the Europe market, in priority order. NL first (primary launch),
// then secondary expansion (BE, LU, DE, FR), then incumbent (AT). The
// script will only ADD missing entries — it never removes or re-orders.
const EUROPE_COUNTRIES = [
  { code: 'NL', name: 'Netherlands',  vat: 0.21, shipping: 'PostNL',     priority: 'primary'   },
  { code: 'BE', name: 'Belgium',      vat: 0.21, shipping: 'bpost',      priority: 'secondary' },
  { code: 'LU', name: 'Luxembourg',   vat: 0.17, shipping: 'Post Luxembourg', priority: 'secondary' },
  { code: 'DE', name: 'Germany',      vat: 0.19, shipping: 'DHL',        priority: 'secondary' },
  { code: 'FR', name: 'France',       vat: 0.20, shipping: 'La Poste',   priority: 'secondary' },
  { code: 'AT', name: 'Austria',      vat: 0.20, shipping: 'Post.at',    priority: 'incumbent' },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '..', '.env.local');

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
// CLI flags
// ---------------------------------------------------------------------------
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const DRY_RUN = !APPLY; // dry-run is the default
const storeFlagIdx = ARGV.indexOf('--store');
const STORE_FLAG = storeFlagIdx >= 0 ? ARGV[storeFlagIdx + 1] : 'dev';

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing SHOPIFY_DEV_STORE or SHOPIFY_DEV_ADMIN_TOKEN in .env.local.');
  process.exit(1);
}

// Dev-store safety check.
if (!STORE.endsWith('-dev.myshopify.com')) {
  console.error(`Refusing to run: SHOPIFY_DEV_STORE="${STORE}" does not end with "-dev.myshopify.com".`);
  console.error('configure-markets.mjs is dev-only by design.');
  process.exit(1);
}

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

console.log(`→ configure-markets  store=${STORE_FLAG} (${STORE})  mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}  api=${API_VERSION}`);
console.log(`  primary launch     : NL (Netherlands)`);
console.log(`  expansion targets  : BE, LU, DE, FR`);
console.log(`  incumbent regions  : AT (kept — single-market model)`);
if (DRY_RUN) {
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

async function findMarket() {
  const data = await gql(`{
    markets(first: 50) {
      edges {
        node {
          id
          name
          enabled
          handle
          currencySettings { baseCurrency { currencyCode } }
          regions(first: 50) {
            edges {
              node {
                id
                name
                ... on MarketRegionCountry { code }
              }
            }
          }
        }
      }
    }
  }`);

  return data.markets.edges
    .map((e) => e.node)
    .find((m) => m.name === MARKET_NAME);
}

async function createEuropeMarket() {
  const res = await gql(
    `mutation($input: MarketCreateInput!) {
      marketCreate(input: $input) {
        market { id name enabled }
        userErrors { field message }
      }
    }`,
    {
      input: {
        name: MARKET_NAME,
        regions: EUROPE_COUNTRIES.map((c) => ({ countryCode: c.code })),
        enabled: true,
      },
    },
  );
  const errs = res.marketCreate.userErrors;
  if (errs.length) {
    throw new Error(`marketCreate failed: ${JSON.stringify(errs)}`);
  }
  console.log(`  ✓ Created market "${MARKET_NAME}" (${res.marketCreate.market.id})`);
  return res.marketCreate.market;
}

async function addMissingRegions(marketId, existingCodes) {
  const toAdd = EUROPE_COUNTRIES.filter((c) => !existingCodes.has(c.code));
  if (toAdd.length === 0) {
    console.log(`  · all ${EUROPE_COUNTRIES.length} target countries already on market`);
    return { added: [] };
  }

  if (DRY_RUN) {
    for (const c of toAdd) console.log(`  + would add ${c.name} (${c.code})  vat=${(c.vat * 100).toFixed(0)}%`);
    return { added: toAdd };
  }

  const res = await gql(
    `mutation($marketId: ID!, $regions: [MarketRegionCreateInput!]!) {
      marketRegionsCreate(marketId: $marketId, regions: $regions) {
        market { id regions(first: 50) { edges { node { ... on MarketRegionCountry { code } } } } }
        userErrors { field message }
      }
    }`,
    {
      marketId,
      regions: toAdd.map((c) => ({ countryCode: c.code })),
    },
  );
  const errs = res.marketRegionsCreate.userErrors;
  if (errs.length) {
    console.warn(`  ⚠ marketRegionsCreate partial failure: ${JSON.stringify(errs)}`);
  }
  for (const c of toAdd) {
    console.log(`  + Added ${c.name} (${c.code})  vat=${(c.vat * 100).toFixed(0)}%`);
  }
  return { added: toAdd };
}

function reportManualSteps() {
  console.log('\n— Manual follow-ups (Admin API 2026-04 does not expose these) —');
  console.log(`  1. Currency: confirm market base currency is EUR`);
  console.log(`     Admin → Settings → Markets → Europe → Manage → Currency`);
  console.log(`  2. Per-country VAT (tax-inclusive prices):`);
  for (const c of EUROPE_COUNTRIES) {
    console.log(`     ${c.code} ${c.name.padEnd(12)} ${(c.vat * 100).toFixed(0)}% — Admin → Settings → Taxes and duties → ${c.name}`);
  }
  console.log(`  3. shop.taxesIncluded = ON — set in:`);
  console.log(`     https://admin.shopify.com/store/${STORE.split('.')[0]}/settings/taxes_and_duties`);
  console.log(`  4. Shipping zones: see configure-shipping.mjs (one zone per country, free over €300).`);
  console.log(`  5. Klarna: country-by-country availability — Admin → Settings → Payments → Shopify Payments`);
  console.log(`  6. Primary-market designation: Shopify has no "primary market" knob — NL-as-primary is`);
  console.log(`     enforced storefront-side via the locale routing default + the root redirect to /nl/.`);
}

async function snapshot() {
  const data = await gql(`{
    markets(first: 10) {
      edges {
        node {
          name
          enabled
          handle
          currencySettings { baseCurrency { currencyCode } }
          regions(first: 30) { edges { node { name ... on MarketRegionCountry { code } } } }
        }
      }
    }
    shop { currencyCode taxesIncluded taxShipping }
  }`);

  console.log('\n— Markets snapshot —');
  console.log(`  shop currency=${data.shop.currencyCode} taxesIncluded=${data.shop.taxesIncluded} taxShipping=${data.shop.taxShipping}`);
  for (const { node: m } of data.markets.edges) {
    const codes = m.regions.edges.map((e) => e.node.code || e.node.name).join(', ');
    const cur = m.currencySettings?.baseCurrency?.currencyCode || '—';
    console.log(`  ${m.enabled ? '●' : '○'} ${m.name} [${cur}] handle=${m.handle} → ${codes || '(no regions)'}`);
  }
}

async function main() {
  console.log(`\n→ Europe multi-country Markets reconciliation`);

  const existing = await findMarket();
  if (!existing) {
    console.log(`→ Market "${MARKET_NAME}" not found.`);
    if (DRY_RUN) {
      console.log(`  · would create market with ${EUROPE_COUNTRIES.length} regions`);
    } else {
      console.log(`  Creating with ${EUROPE_COUNTRIES.length} regions…`);
      await createEuropeMarket();
    }
  } else {
    console.log(`→ Market "${MARKET_NAME}" exists (${existing.id}).`);
    const codes = new Set(existing.regions.edges.map((e) => e.node.code).filter(Boolean));
    await addMissingRegions(existing.id, codes);
  }

  await snapshot();
  reportManualSteps();
  console.log(DRY_RUN ? '\n(dry-run only — re-run with --apply to perform writes.)\nDone.' : '\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
