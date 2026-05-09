#!/usr/bin/env node
/**
 * Audit a single product's translation state across DE/NL/FR.
 * Lists every translatable key, its EN source, and whether each locale
 * has a translation registered (✓), missing (✗), or identical to source (=).
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

const HANDLE = process.argv[2];
if (!HANDLE) {
  console.error('usage: node audit-product-translations.mjs <handle>');
  process.exit(1);
}

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

const prod = await gql(
  `query($handle:String!){productByHandle(handle:$handle){id title}}`,
  {handle: HANDLE},
);
if (!prod.productByHandle) {
  console.error(`product ${HANDLE} not found`);
  process.exit(1);
}
const productId = prod.productByHandle.id;
console.log(`\n→ ${prod.productByHandle.title}`);
console.log(`  ${productId}\n`);

async function fetchTrans(resourceId, locale) {
  const d = await gql(
    `query($id:ID!,$locale:String!){translatableResource(resourceId:$id){
      translatableContent{key value type}
      translations(locale:$locale){key value locale}
    }}`,
    {id: resourceId, locale},
  );
  return d.translatableResource;
}

const LOCALES = ['de', 'nl', 'fr'];

// Pull EN source + each locale's translations
const data = await fetchTrans(productId, 'de');
const enContent = data.translatableContent;

const trans = {};
for (const loc of LOCALES) {
  const r = await fetchTrans(productId, loc);
  trans[loc] = Object.fromEntries(r.translations.map((t) => [t.key, t.value]));
}

const W = 24;
const head = ['key'.padEnd(W), 'EN length', ...LOCALES.map((l) => l.toUpperCase().padEnd(6))].join(' ');
console.log(head);
console.log('-'.repeat(head.length));

let missing = {de: 0, nl: 0, fr: 0};
let identical = {de: 0, nl: 0, fr: 0};
let translated = {de: 0, nl: 0, fr: 0};
let total = 0;

for (const c of enContent) {
  if (!c.value || !c.value.trim()) continue;
  total++;
  const cells = [c.key.padEnd(W), String(c.value.length).padStart(9)];
  for (const loc of LOCALES) {
    const v = trans[loc][c.key];
    if (!v) {
      cells.push('✗     ');
      missing[loc]++;
    } else if (v.trim() === c.value.trim()) {
      cells.push('=     ');
      identical[loc]++;
    } else {
      cells.push('✓     ');
      translated[loc]++;
    }
  }
  console.log(cells.join(' '));
}

console.log('\nLegend: ✓ translated, = identical to EN, ✗ no translation registered');
console.log(`Total translatable strings: ${total}`);
for (const loc of LOCALES) {
  console.log(
    `  ${loc.toUpperCase()}: ${translated[loc]} translated, ${identical[loc]} identical, ${missing[loc]} missing`,
  );
}

// Also walk the metafields attached to this product as separate translatable resources
console.log('\n→ Product METAFIELDs (separate translatable resources)');
const mfQuery = await gql(
  `query($id:ID!){product(id:$id){
    metafields(first:50){nodes{id namespace key type definition{name}}}
  }}`,
  {id: productId},
);
const mfNodes = mfQuery.product.metafields.nodes;
console.log(`  ${mfNodes.length} metafields\n`);

let mfMissing = {de: 0, nl: 0, fr: 0};
let mfIdentical = {de: 0, nl: 0, fr: 0};
let mfTranslated = {de: 0, nl: 0, fr: 0};
let mfNoSource = 0;

for (const mf of mfNodes) {
  // Only string-bearing metafield types are translatable
  if (
    !['single_line_text_field', 'multi_line_text_field', 'rich_text_field', 'json'].includes(
      mf.type,
    )
  )
    continue;

  const r = await fetchTrans(mf.id, 'de');
  const enC = r.translatableContent.find((c) => c.key === mf.key);
  if (!enC || !enC.value) {
    mfNoSource++;
    continue;
  }

  const tr = {};
  for (const loc of LOCALES) {
    const t = await fetchTrans(mf.id, loc);
    const found = t.translations.find((x) => x.key === mf.key);
    tr[loc] = found?.value;
  }

  const status = LOCALES.map((loc) => {
    const v = tr[loc];
    if (!v) {
      mfMissing[loc]++;
      return '✗';
    }
    if (v.trim() === enC.value.trim()) {
      mfIdentical[loc]++;
      return '=';
    }
    mfTranslated[loc]++;
    return '✓';
  }).join(' ');

  const label = `${mf.namespace}.${mf.key}`.padEnd(34);
  const preview = enC.value.replace(/\s+/g, ' ').slice(0, 50);
  console.log(`  ${label} ${status}  EN: "${preview}${enC.value.length > 50 ? '…' : ''}"`);
}

console.log('');
for (const loc of LOCALES) {
  console.log(
    `  ${loc.toUpperCase()}: ${mfTranslated[loc]} translated, ${mfIdentical[loc]} identical, ${mfMissing[loc]} missing`,
  );
}
