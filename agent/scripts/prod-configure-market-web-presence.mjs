#!/usr/bin/env node
/**
 * Configure the prod EU market's webPresence so the Storefront API
 * actually honours @inContext(language: …) and returns registered
 * DE/NL/FR translations.
 *
 * Why: the EU market currently has webPresence: null. Without a
 * webPresence the Storefront API resolves every buyer to "no specific
 * locale" and silently ignores the @inContext directive — every product
 * title, productType, option, and translatable metafield comes back in
 * the shop's primary locale (EN) regardless of what the URL suggests.
 *
 * The webPresence is attached to the .myshopify.com domain. The custom
 * domain gberg-heizung.de lives on Oxygen, not on the Online Store sales
 * channel, so it isn't a Shopify domain we can attach to. The Online
 * Store URLs at pyzype-xf.myshopify.com/{de,nl,fr} will start serving
 * locale-aware Liquid pages — but nobody shops there; it's just the
 * mechanism Shopify Markets uses to know which locales the EU buyer is
 * exposed to. The Storefront API behind Hydrogen reads the same Market
 * config and starts serving translations.
 *
 * Idempotent: detects existing webPresence and exits early. To replace
 * an existing webPresence, delete it manually first via
 * webPresenceDelete or in Admin UI.
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// 1. Find the EU market and the orphan webPresences
const state = await gql(`{
  markets(first:20){nodes{id name handle webPresence{id defaultLocale{locale} alternateLocales{locale}}}}
  webPresences(first:20){nodes{id defaultLocale{locale} alternateLocales{locale} domain{id host} market{id}}}
}`);
const eu = state.markets.nodes.find((m) => m.name === 'eu' || m.handle === 'de');
if (!eu) {
  console.error('No "eu" market found.');
  process.exit(1);
}
console.log(`Market: ${eu.name} (${eu.id})`);

if (eu.webPresence) {
  console.log('\nWebPresence already exists on this market:');
  console.log(`  defaultLocale: ${eu.webPresence.defaultLocale.locale}`);
  console.log(`  alternateLocales: ${eu.webPresence.alternateLocales.map((l) => l.locale).join(', ')}`);
  console.log('\nNothing to do.');
  process.exit(0);
}

// Find an orphan webPresence on gberg-heizung.de that already has DE/NL/FR.
const candidate = state.webPresences.nodes.find(
  (wp) =>
    wp.market === null &&
    wp.domain?.host === 'gberg-heizung.de' &&
    ['de', 'nl', 'fr'].every((loc) =>
      wp.alternateLocales.some((al) => al.locale === loc),
    ),
);

if (!candidate) {
  console.error('\nNo unattached webPresence on gberg-heizung.de with DE/NL/FR locales found.');
  console.error('webPresences on the shop:');
  for (const wp of state.webPresences.nodes) {
    console.error(`  ${wp.id} domain=${wp.domain?.host} alts=[${wp.alternateLocales.map((l) => l.locale).join(',')}] market=${wp.market?.id ?? 'null'}`);
  }
  process.exit(1);
}

console.log(`\nFound matching webPresence to attach:`);
console.log(`  ${candidate.id}`);
console.log(`  domain: ${candidate.domain.host}`);
console.log(`  defaultLocale: ${candidate.defaultLocale.locale}`);
console.log(`  alternateLocales: ${candidate.alternateLocales.map((l) => l.locale).join(', ')}`);

if (!APPLY) {
  console.log('\n--- DRY RUN ---');
  console.log(`Would call marketUpdate(${eu.id}, {webPresencesToAdd: ["${candidate.id}"]}).`);
  console.log('Re-run with --apply to execute.');
  process.exit(0);
}

// Apply: attach the existing webPresence to the eu market
console.log('\nApplying marketUpdate(webPresencesToAdd)…');
const result = await gql(
  `mutation($id:ID!,$input:MarketUpdateInput!){
    marketUpdate(id:$id, input:$input){
      market{
        id name handle
        webPresence{id defaultLocale{locale} alternateLocales{locale}}
      }
      userErrors{field message}
    }
  }`,
  {id: eu.id, input: {webPresencesToAdd: [candidate.id]}},
);

if (result.marketUpdate.userErrors.length) {
  console.error('userErrors:', JSON.stringify(result.marketUpdate.userErrors, null, 2));
  process.exit(1);
}

console.log('  ✓ attached to market');
console.log('\n✓ Final state:');
console.log(JSON.stringify(result.marketUpdate.market, null, 2));
console.log('\nVerify with: node agent/scripts/prod-configure-market-web-presence.mjs');
