#!/usr/bin/env node
// Publish every product to the Online Store + Shop sales channels.
// Without this, products are ACTIVE but invisible on the storefront.

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

const pubs = await gql(`{ publications(first:10){edges{node{id name}}} }`);
const targets = pubs.publications.edges
  .map(e => e.node)
  .filter(p => p.name === 'Online Store' || p.name === 'Shop' || p.name === 'G-Berg');
console.log(`Publishing to: ${targets.map(t => t.name).join(', ')}`);

async function* allProducts() {
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($c:String){ products(first:50, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id handle } } }`,
      { c: cursor }
    );
    for (const n of d.products.nodes) yield n;
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
}

let total = 0, ok = 0, failed = 0;
for await (const p of allProducts()) {
  total++;
  if (!APPLY) { console.log(`  ${p.handle}`); continue; }
  const r = await gql(
    `mutation($id:ID!, $input:[PublicationInput!]!){
      publishablePublish(id:$id, input:$input){
        userErrors{ field message }
      }
    }`,
    { id: p.id, input: targets.map(t => ({ publicationId: t.id })) }
  );
  const errs = r.publishablePublish.userErrors;
  if (errs.length) { console.log(`  ✗ ${p.handle}: ${JSON.stringify(errs)}`); failed++; }
  else { console.log(`  ✓ ${p.handle}`); ok++; }
}

console.log(`\n=== Summary ===`);
console.log(`Total:     ${total}`);
console.log(`Published: ${ok}`);
console.log(`Failed:    ${failed}`);
