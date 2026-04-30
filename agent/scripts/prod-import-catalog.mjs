#!/usr/bin/env node
// Import data/catalog/gberg-catalog.json -> prod store products via productSet.
// Creates products in DRAFT status (so we review before publishing).
// Idempotent: re-running updates existing products keyed by handle.

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
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();
const ONLY = (() => {
  const i = process.argv.indexOf('--handle');
  return i >= 0 ? process.argv[i + 1] : null;
})();

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

async function findExisting(handle) {
  const d = await gql(`query($h:String!){ productByIdentifier(identifier:{handle:$h}){ id handle } }`, { h: handle });
  return d.productByIdentifier?.id || null;
}

const catalog = JSON.parse(readFileSync(resolve(ROOT, 'data/catalog/gberg-catalog.json'), 'utf8'));
let products = catalog.products.filter(p => p.titleDe);
if (ONLY) products = products.filter(p => p.handle === ONLY);
products = products.slice(0, LIMIT);

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}  count=${products.length}/${catalog.products.length}`);

let created = 0, updated = 0, failed = 0;

for (const p of products) {
  const optionName = p.options?.[0]?.name || 'Size';
  const optionValues = p.options?.[0]?.values || [];
  // Dedupe variants by option1 — Shopify rejects duplicates within a single
  // option dimension. Keep the first occurrence (lowest list-order, usually
  // cheapest configuration). The source catalog has multiple variant rows per
  // size when xxl carried sub-SKUs we collapse here.
  const seen = new Set();
  const variants = (p.variants || []).filter(v => {
    if (seen.has(v.option1)) return false;
    seen.add(v.option1);
    return true;
  }).map(v => ({
    optionValues: [{ optionName, name: v.option1 }],
    price: v.price,
    sku: v.sku,
    inventoryItem: { measurement: v.grams ? { weight: { value: v.grams / 1000, unit: 'KILOGRAMS' } } : undefined, tracked: false },
  }));

  const input = {
    handle: p.handle,
    title: p.titleDe,
    descriptionHtml: p.bodyHtmlDe || '',
    vendor: p.vendor || 'G-Berg',
    productType: p.productType || '',
    tags: p.tags || [],
    status: 'DRAFT',
    productOptions: optionValues.length > 0
      ? [{ name: optionName, values: optionValues.map(v => ({ name: v })) }]
      : undefined,
    variants: variants.length > 0 ? variants : undefined,
    metafields: (p.customMetafields || [])
      // Shopify rejects metafield values > 128KB. Drop oversize ones (usually
      // raw_source debug dumps); we don't ship them to the storefront anyway.
      .filter(m => Buffer.byteLength(m.value || '', 'utf8') <= 131072)
      .map(m => ({
        namespace: m.namespace, key: m.key, type: m.type, value: m.value,
      })),
  };

  console.log(`  ${p.handle}  v=${variants.length}  m=${input.metafields.length}`);
  if (!APPLY) continue;

  try {
    const existing = await findExisting(p.handle);
    if (existing) input.id = existing;

    const r = await gql(
      `mutation($product: ProductSetInput!){
        productSet(input: $product, synchronous: true){
          product{ id handle status variantsCount{count} }
          userErrors{ field message code }
        }
      }`,
      { product: input }
    );
    const errs = r.productSet.userErrors;
    if (errs.length) {
      console.log(`    ✗ ${JSON.stringify(errs)}`);
      failed++;
    } else {
      const prod = r.productSet.product;
      console.log(`    ✓ ${existing ? 'updated' : 'created'} (${prod.variantsCount.count} variants)`);
      existing ? updated++ : created++;
    }
  } catch (e) {
    console.log(`    ✗ ${e.message}`);
    failed++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Created: ${created}`);
console.log(`Updated: ${updated}`);
console.log(`Failed:  ${failed}`);
