#!/usr/bin/env node
// Populate shop legal policies (refund/terms/shipping/contact) by reusing the
// HTML body from the matching Pages we seeded earlier. Privacy already set.

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

// Map: shop policy type -> page handle whose body we reuse.
const MAP = [
  { policy: 'REFUND_POLICY', page: 'returns' },
  { policy: 'TERMS_OF_SERVICE', page: 'terms' },
  { policy: 'SHIPPING_POLICY', page: 'shipping' },
  { policy: 'CONTACT_INFORMATION', page: 'contact' },
];

const pageData = await gql(`{ pages(first:30){edges{node{handle title body}}} }`);
const byHandle = new Map(pageData.pages.edges.map(e => [e.node.handle, e.node]));

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

for (const { policy, page } of MAP) {
  const p = byHandle.get(page);
  if (!p) { console.log(`  ✗ page "${page}" not found`); continue; }
  const body = p.body;
  console.log(`  ${policy}  ←  page:${page}  (${body.length} chars)`);
  if (!APPLY) continue;
  const r = await gql(
    `mutation($input:ShopPolicyInput!){
      shopPolicyUpdate(shopPolicy:$input){
        shopPolicy{ type body }
        userErrors{ field message }
      }
    }`,
    { input: { type: policy, body } }
  );
  const errs = r.shopPolicyUpdate.userErrors;
  if (errs.length) console.log(`    ✗ ${JSON.stringify(errs)}`);
  else console.log(`    ✓ updated`);
}
