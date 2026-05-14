#!/usr/bin/env node
/**
 * Re-register the DE/NL/FR translations of `custom.series` so the per-locale
 * metafield value matches the new German city name.
 *
 * The rename script (prod-rename-series-to-german-cities.mjs) updated:
 *   - product.title (and its de/nl/fr translations)  ✓
 *   - product.tags                                    ✓
 *   - custom.series metafield value (EN)              ✓
 *
 * What it missed: the de/nl/fr translation entries on the `custom.series`
 * metafield itself. Those still hold the OLD codename ("Konrad", "Twister",
 * etc.) — so on /de/ etc. the storefront's Storefront-API @inContext call
 * returns the old value and the eyebrow on the PLP card / PDP shows the
 * old name.
 *
 * Idempotent: a translation already equal to the new name is skipped.
 *
 *   node agent/scripts/prod-fix-series-metafield-translations.mjs            # dry-run
 *   node agent/scripts/prod-fix-series-metafield-translations.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API = '2026-04';
const NEW_NAMES = new Set(['Berlin', 'Dresden', 'Hamburg', 'Potsdam', 'Mainz', 'Köln', 'Essen', 'Aachen', 'Baden']);
const LOCALES = ['de', 'nl', 'fr'];

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes('--apply');
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const EP = `https://${STORE}/admin/api/${API}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(EP, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// 1. Walk every product, keep only those whose custom.series matches a new city.
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){
      products(first:100,after:$c){
        pageInfo{hasNextPage endCursor}
        nodes{
          id handle
          mf:metafield(namespace:"custom",key:"series"){ id value }
        }
      }
    }`, {c: cursor});
  for (const p of d.products.nodes) {
    if (p.mf && NEW_NAMES.has(p.mf.value)) products.push(p);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`renamed products with custom.series set: ${products.length}\n`);

let planned = 0, applied = 0, skipped = 0;
for (const p of products) {
  // Fetch the metafield's translatable content (digest) + its existing locale translations.
  const tr = await gql(
    `query($id:ID!){
      r:translatableResource(resourceId:$id){
        translatableContent{ key value digest locale }
        de:translations(locale:"de"){ key value }
        nl:translations(locale:"nl"){ key value }
        fr:translations(locale:"fr"){ key value }
      }
    }`, {id: p.mf.id});
  const tc = tr.r.translatableContent.find((c) => c.key === 'value');
  if (!tc) {
    console.log(`  ⚠ ${p.handle} — metafield has no translatable content (skip)`);
    continue;
  }
  const newValue = p.mf.value;       // EN value, e.g. "Aachen"
  const digest = tc.digest;
  const updates = [];
  for (const loc of LOCALES) {
    const t = tr.r[loc].find((x) => x.key === 'value');
    const cur = t?.value;
    if (cur === newValue) continue;  // already correct
    updates.push({locale: loc, key: 'value', value: newValue, translatableContentDigest: digest, was: cur ?? '(unset)'});
  }
  if (updates.length === 0) { skipped++; continue; }
  planned++;
  console.log(`~ ${p.handle}  →  series ${newValue}`);
  for (const u of updates) console.log(`    ${u.locale}: was "${u.was}"  →  "${u.value}"`);
  if (!APPLY) continue;
  // resourceId is ID! (not String!) — see prior observation 19260.
  const r = await gql(
    `mutation($id:ID!, $translations:[TranslationInput!]!){
      translationsRegister(resourceId:$id, translations:$translations){
        userErrors{ field message }
      }
    }`,
    {id: p.mf.id, translations: updates.map(({was, ...u}) => u)});
  const errs = r.translationsRegister.userErrors;
  if (errs.length) { console.log(`    ✗ ${JSON.stringify(errs)}`); continue; }
  applied++;
  console.log(`    ✓ ${updates.length} translation(s) registered`);
}

console.log(`\n${APPLY ? 'Applied' : 'Planned'}: ${applied || planned}  ·  Already correct: ${skipped}`);
if (!APPLY) console.log('Re-run with --apply to write.');
