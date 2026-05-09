#!/usr/bin/env node
/**
 * Remove stale `merchandising.badges` metafield translations on prod.
 *
 * Why: an earlier translator run registered DE translations like
 * `["elektrisch"]` on the merchandising.badges metafield (a stable
 * English-enum field that the storefront localizes via the i18n
 * dictionary). When the Storefront API serves the translated value
 * back, the frontend `badgeTone()` doesn't recognize the localized
 * tag, falls back to the `neutral` tone, and `badgeLabel()` renders
 * the raw lowercase string verbatim — producing the lowercase
 * `elektrisch` chip on related-product cards.
 *
 * This script walks every product's merchandising.badges metafield
 * and uses `translationsRemove` to drop any de/nl/fr translations
 * registered on it. After this run, the Storefront API returns the
 * canonical English source `["electric"]`, which the frontend's
 * `badgeLabel('electric', t)` correctly localizes via t('badge.electric').
 *
 * Idempotent. Default is dry-run; pass --apply to execute.
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
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// 1. Find every product with a merchandising.badges metafield
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($a:String){products(first:50,after:$a){edges{cursor node{handle metafield(namespace:"merchandising",key:"badges"){id}}}pageInfo{hasNextPage}}}`,
    {a: cursor},
  );
  for (const e of d.products.edges) {
    if (e.node.metafield) products.push({handle: e.node.handle, mfId: e.node.metafield.id});
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.edges.at(-1).cursor;
}
console.log(`${products.length} products carry merchandising.badges`);

// 2. For each, find any locale that has a translation registered for it
const LOCALES = ['de', 'nl', 'fr'];
const removals = []; // {mfId, locale, key, value}
for (const p of products) {
  for (const loc of LOCALES) {
    const d = await gql(
      `query($id:ID!,$l:String!){translatableResource(resourceId:$id){translations(locale:$l){key value}}}`,
      {id: p.mfId, l: loc},
    );
    for (const t of d.translatableResource?.translations ?? []) {
      removals.push({handle: p.handle, mfId: p.mfId, locale: loc, key: t.key, value: t.value});
    }
  }
}
console.log(`Stale translations to remove: ${removals.length}\n`);

if (removals.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

for (const r of removals) {
  console.log(`  ${r.handle.padEnd(60)} ${r.locale} ${r.key}=${r.value}`);
}

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply.');
  process.exit(0);
}

// 3. Group by mfId and remove translations
const byResource = new Map();
for (const r of removals) {
  if (!byResource.has(r.mfId)) byResource.set(r.mfId, []);
  byResource.get(r.mfId).push(r);
}

console.log('\nApplying translationsRemove…\n');
let removed = 0;
for (const [mfId, list] of byResource) {
  const locales = [...new Set(list.map((r) => r.locale))];
  const keys = [...new Set(list.map((r) => r.key))];
  const result = await gql(
    `mutation($id:ID!, $keys:[String!]!, $locales:[String!]!){
      translationsRemove(resourceId:$id, translationKeys:$keys, locales:$locales){
        translations{key locale value}
        userErrors{field message}
      }
    }`,
    {id: mfId, keys, locales},
  );
  if (result.translationsRemove.userErrors.length) {
    console.error(`  ✗ ${mfId}:`, JSON.stringify(result.translationsRemove.userErrors));
    continue;
  }
  const n = result.translationsRemove.translations.length;
  removed += n;
  console.log(`  ✓ ${mfId} — removed ${n}`);
}

console.log(`\n✓ Total removed: ${removed} / ${removals.length}`);
