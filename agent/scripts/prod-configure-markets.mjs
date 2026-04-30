#!/usr/bin/env node
// Add the 6 remaining EU countries to the prod store's primary market and
// rename it to "Europe". Uses SHOPIFY_PROD_*. Idempotent.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '..', '.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_* in .env.local');

const APPLY = process.argv.includes('--apply');

// Full target country set. DE already exists from the Shopify default setup.
const TARGET = ['DE', 'NL', 'BE', 'LU', 'AT', 'FR', 'ES', 'IT', 'PL', 'DK'];

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

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

const cur = await gql(`{
  markets(first:10){
    edges{node{
      id name handle primary enabled
      regions(first:50){edges{node{id name ... on MarketRegionCountry{code}}}}
    }}
  }
}`);

// Shopify forbids adding regions to the primary market. DE stays on the
// primary "Germany" market alone; all other EU countries go into a separate
// "Europe" market.
const primary = cur.markets.edges.map(e => e.node).find(m => m.primary);
if (!primary) throw new Error('No primary market found');
console.log(`Primary market: "${primary.name}" — DE stays here (Shopify constraint).`);

let europe = cur.markets.edges.map(e => e.node).find(m => m.name === 'Europe');
const NON_DE = TARGET.filter(c => c !== 'DE');

if (!europe) {
  console.log(`Creating "Europe" market with: ${NON_DE.join(', ')}`);
  if (APPLY) {
    const r = await gql(
      `mutation($input:MarketCreateInput!){
        marketCreate(input:$input){
          market{ id name regions(first:50){edges{node{... on MarketRegionCountry{code}}}} }
          userErrors{ field message }
        }
      }`,
      { input: { name: 'Europe', enabled: true, regions: NON_DE.map(c => ({ countryCode: c })) } }
    );
    const errs = r.marketCreate.userErrors;
    if (errs.length) throw new Error(`marketCreate: ${JSON.stringify(errs)}`);
    europe = r.marketCreate.market;
    console.log(`✓ created "Europe" (${europe.id})`);
  }
} else {
  const have = new Set(europe.regions.edges.map(e => e.node.code).filter(Boolean));
  const missing = NON_DE.filter(c => !have.has(c));
  if (!missing.length) {
    console.log(`"Europe" already has all 9 countries — no changes`);
  } else {
    console.log(`Adding to "Europe": ${missing.join(', ')}`);
    if (APPLY) {
      const r = await gql(
        `mutation($id:ID!, $regions:[MarketRegionCreateInput!]!){
          marketRegionsCreate(marketId:$id, regions:$regions){
            market{ id regions(first:50){edges{node{... on MarketRegionCountry{code}}}} }
            userErrors{ field message }
          }
        }`,
        { id: europe.id, regions: missing.map(c => ({ countryCode: c })) }
      );
      const errs = r.marketRegionsCreate.userErrors;
      if (errs.length) throw new Error(`marketRegionsCreate: ${JSON.stringify(errs)}`);
      console.log(`✓ added ${missing.length} regions`);
    }
  }
}

const after = await gql(`{
  markets(first:10){edges{node{name primary regions(first:50){edges{node{... on MarketRegionCountry{code}}}}}}}
}`);
for (const m of after.markets.edges.map(e => e.node)) {
  const codes = m.regions.edges.map(e => e.node.code).filter(Boolean).sort().join(', ');
  console.log(`Final: ${m.name}${m.primary ? '*' : ''}  [${codes}]`);
}
