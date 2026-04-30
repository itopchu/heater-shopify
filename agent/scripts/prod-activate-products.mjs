#!/usr/bin/env node
// Flip every DRAFT product on the prod store to ACTIVE.

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

async function* allDrafts() {
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($cursor:String){
        products(first:50, after:$cursor, query:"status:draft"){
          pageInfo{ hasNextPage endCursor }
          nodes{ id handle title status }
        }
      }`,
      { cursor }
    );
    for (const n of d.products.nodes) yield n;
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
}

let total = 0, ok = 0, failed = 0;
for await (const p of allDrafts()) {
  total++;
  console.log(`  ${p.handle}`);
  if (!APPLY) continue;
  const r = await gql(
    `mutation($id:ID!){
      productUpdate(product:{id:$id, status:ACTIVE}){
        product{ id status }
        userErrors{ field message }
      }
    }`,
    { id: p.id }
  );
  const errs = r.productUpdate.userErrors;
  if (errs.length) { console.log(`    ✗ ${JSON.stringify(errs)}`); failed++; }
  else { ok++; }
}

console.log(`\n=== Summary ===`);
console.log(`Found:     ${total} DRAFT products`);
console.log(`Activated: ${ok}`);
console.log(`Failed:    ${failed}`);
