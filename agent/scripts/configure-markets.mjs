#!/usr/bin/env node
/**
 * Europe multi-country market provisioning for heater-shopify.
 *
 * Creates (or extends) a single Shopify Market named "Europe" covering the
 * countries in EUROPE_COUNTRIES. EUR currency, Klarna-friendly, per-country
 * VAT (reported but not written — Shopify 2026-04 does not expose per-region
 * tax overrides via Admin GraphQL; those remain admin-UI only).
 *
 * Idempotent: re-running adds missing countries, never duplicates the market.
 *
 * Supersedes the configureMarkets() step in configure-phase-6.mjs.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const MARKET_NAME = 'Europe';

// Countries in the Europe market. Add entries here to extend coverage; the
// script will add any missing regions on the next run.
const EUROPE_COUNTRIES = [
  { code: 'DE', name: 'Germany', vat: 0.19, shipping: 'DHL' },
  { code: 'BE', name: 'Belgium', vat: 0.21, shipping: 'bpost' },
  { code: 'ES', name: 'Spain', vat: 0.21, shipping: 'Correos' },
  { code: 'AT', name: 'Austria', vat: 0.20, shipping: 'Post.at' },
  { code: 'NL', name: 'Netherlands', vat: 0.21, shipping: 'PostNL' },
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

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing SHOPIFY_DEV_STORE or SHOPIFY_DEV_ADMIN_TOKEN in .env.local.');
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

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
  if (toAdd.length === 0) return;

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
    console.log(`  + Added ${c.name} (${c.code})`);
  }
}

function reportManualSteps() {
  console.log('\n— Manual follow-ups (Admin API 2026-04 does not expose these) —');
  console.log(`  1. Currency: set market base currency to EUR if not already.`);
  console.log(`     Admin → Settings → Markets → Europe → Manage → Currency.`);
  console.log(`  2. Per-country VAT (tax-inclusive pricing):`);
  for (const c of EUROPE_COUNTRIES) {
    console.log(`     ${c.code}: ${(c.vat * 100).toFixed(0)}% VAT — verify in Settings → Taxes and duties → ${c.name}`);
  }
  console.log(`  3. shop.taxesIncluded = ON — no GraphQL mutation exists; set via`);
  console.log(`     https://admin.shopify.com/store/${STORE.split('.')[0]}/settings/taxes_and_duties`);
  console.log(`  4. Shipping zones: create per-country rates in Settings → Shipping and delivery:`);
  for (const c of EUROPE_COUNTRIES) {
    console.log(`     ${c.code}: ${c.shipping} (or equivalent carrier)`);
  }
  console.log(`  5. Klarna: payment method availability varies per country.`);
  console.log(`     Verify in Settings → Payments → Shopify Payments → Manage → Country availability.`);
}

async function snapshot() {
  const data = await gql(`{
    markets(first: 10) {
      edges {
        node {
          name
          enabled
          currencySettings { baseCurrency { currencyCode } }
          regions(first: 20) { edges { node { name ... on MarketRegionCountry { code } } } }
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
    console.log(`  ${m.enabled ? '●' : '○'} ${m.name} [${cur}] → ${codes || '(no regions)'}`);
  }
}

async function main() {
  console.log(`→ Europe multi-country market provisioning on ${STORE} (Admin API ${API_VERSION})\n`);

  const existing = await findMarket();
  if (!existing) {
    console.log(`→ Market "${MARKET_NAME}" not found. Creating.`);
    await createEuropeMarket();
  } else {
    console.log(`→ Market "${MARKET_NAME}" exists (${existing.id}).`);
    const codes = new Set(existing.regions.edges.map((e) => e.node.code).filter(Boolean));
    await addMissingRegions(existing.id, codes);
  }

  await snapshot();
  reportManualSteps();
  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
