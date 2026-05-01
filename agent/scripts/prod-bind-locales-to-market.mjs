#!/usr/bin/env node
// One-shot setup: attach the gberg-heizung.de MarketWebPresence to the
// primary Germany market with EN as default + 7 alternate locales.
//
// Without this, all 8 locales are enabled at the shop level but only EN
// is exposed to the Storefront API. The Hydrogen storefront (and any
// public Storefront API consumer) ignores `@inContext(language: DE)`
// because the market's webPresence has no `alternateLocales`.
//
// This is the discovery that fixed German/Dutch/French/etc. titles
// returning English fallback even after translationsRegister succeeded.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;

async function gql(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const APPLY = process.argv.includes('--apply');

// 1. Find the primary market.
const m = await gql(`{ markets(first:5){edges{node{id name primary webPresence{id alternateLocales{locale}}}}} }`);
const primary = m.markets.edges.map(e => e.node).find(x => x.primary);
console.log(`Primary market: ${primary.name} (${primary.id})`);
console.log(`Current webPresence: ${primary.webPresence?.id ?? 'NULL'}`);
console.log(`Current alt locales: ${primary.webPresence?.alternateLocales.map(l=>l.locale).join(',') || 'NONE'}`);

// 2. Find the gberg-heizung.de domain.
const s = await gql(`{ shop{domains{ id host marketWebPresence{ id market{id} } }} }`);
const customDomain = s.shop.domains.find(d => d.host === 'www.gberg-heizung.de' || d.host === 'gberg-heizung.de');
if (!customDomain) throw new Error('No gberg-heizung.de domain found');
console.log(`Custom domain: ${customDomain.host}  (${customDomain.id})`);
console.log(`Current MarketWebPresence on it: ${customDomain.marketWebPresence?.id ?? 'NONE'}  (linked to market: ${customDomain.marketWebPresence?.market?.id ?? 'none'})`);

if (!APPLY) {
  console.log('\nDry-run. Re-run with --apply to:');
  console.log('  1. Update the existing MarketWebPresence to set defaultLocale=en + 7 alternateLocales');
  console.log('  2. Bind it to the primary Germany market');
  process.exit(0);
}

// 3. Update the webPresence with our 8-locale config.
const webPresenceId = customDomain.marketWebPresence?.id;
if (webPresenceId) {
  console.log(`\nUpdating webPresence ${webPresenceId}...`);
  const r = await gql(
    `mutation($id:ID!, $input:WebPresenceUpdateInput!){
      webPresenceUpdate(id:$id, input:$input){
        webPresence{ id alternateLocales{locale} defaultLocale{locale} }
        userErrors{field message}
      }
    }`,
    {
      id: webPresenceId,
      input: { defaultLocale: 'en', alternateLocales: ['de','nl','fr','es','it','pl','da'] },
    },
  );
  if (r.webPresenceUpdate.userErrors.length) throw new Error(JSON.stringify(r.webPresenceUpdate.userErrors));
  console.log('  ✓ webPresence updated');
}

// 4. Attach it to the Germany market via marketUpdate.
if (!primary.webPresence) {
  console.log(`\nAttaching webPresence to Germany market...`);
  const r = await gql(
    `mutation($id:ID!, $input:MarketUpdateInput!){
      marketUpdate(id:$id, input:$input){
        market{ id name webPresence{ id alternateLocales{locale} defaultLocale{locale} domain{host} } }
        userErrors{field message code}
      }
    }`,
    { id: primary.id, input: { webPresencesToAdd: [webPresenceId] } },
  );
  if (r.marketUpdate.userErrors.length) throw new Error(JSON.stringify(r.marketUpdate.userErrors));
  const wp = r.marketUpdate.market.webPresence;
  console.log(`  ✓ market now has webPresence ${wp.id}`);
  console.log(`    defaultLocale: ${wp.defaultLocale.locale}`);
  console.log(`    alternateLocales: ${wp.alternateLocales.map(l=>l.locale).join(', ')}`);
  console.log(`    domain: ${wp.domain.host}`);
} else {
  console.log('\n  · primary market already has webPresence — nothing to attach');
}

console.log('\nDone. Verify Storefront API now lists 8 languages:');
console.log('  curl -s -X POST https://$PUBLIC_STORE_DOMAIN/api/2026-04/graphql.json \\');
console.log('    -H "X-Shopify-Storefront-Access-Token: $TOKEN" \\');
console.log("    -d '{\"query\":\"{localization{availableLanguages{isoCode}}}\"}' | jq");
