#!/usr/bin/env node
/**
 * Two-fix product cleanup:
 *
 * 1. TAGS — sync tags to the canonical series. The Kira products were
 *    historically tagged "flora", so a /collections/flora-style filter
 *    pulls Kira items in too. Reset every product's tags to:
 *      [<series_lowercase>, <color_lowercase>, ...other_non_series_tags]
 *    Series names from the title-rewrite map are authoritative.
 *
 * 2. OPTION VALUES — translate any remaining German colour words on
 *    variant Color options via productOptionUpdate. Examples:
 *      "Schwarz"          → "Black"
 *      "Schwarz × Durchgang" → "Black, Straight"
 *      "Anthrazit × Eckform" → "Anthracite, Angle"
 *      "Weiß"             → "White"
 *      "Chrom"            → "Chrome"
 *
 * Usage:
 *   node agent/scripts/prod-fix-color-tags.mjs            # dry-run
 *   node agent/scripts/prod-fix-color-tags.mjs --apply
 */
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
const APPLY = process.argv.includes('--apply');

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

const COLOR_DE_TO_EN_PHRASE = [
  [/\bschwarz\b/gi, 'Black'],
  [/\bweiß\b/gi, 'White'],
  [/\bweiss\b/gi, 'White'],
  [/\banthrazit\b/gi, 'Anthracite'],
  [/\bchrom\b/gi, 'Chrome'],
  // Form modifiers that ride along with × in option values
  [/\bdurchgang(?:sform)?\b/gi, 'Straight'],
  [/\beckform\b/gi, 'Angle'],
];
const SUFFIX_TOKENS = ['durchgang','durchgangsform','eckform'];

function translateOptionValue(value) {
  let v = value;
  for (const [re, en] of COLOR_DE_TO_EN_PHRASE) v = v.replace(re, en);
  // Normalise " × " → ", " (English UI separator)
  v = v.replace(/\s*[×x]\s*/g, ', ');
  // Collapse double spaces / commas
  v = v.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
  return v;
}

const SERIES_KEYWORDS = ['konrad','flora','astoria','pullman','twister','elanor','platis','lavinno','atlas','alpha','mira','milan','kira','elmar','platon','kaska'];
const SERIES_PROPER = {
  konrad: 'Konrad', flora: 'Flora', milan: 'Flora', kaska: 'Flora',
  atlas: 'Atlas', platis: 'Atlas', astoria: 'Astoria', alpha: 'Astoria',
  pullman: 'Pullman', platon: 'Pullman', twister: 'Twister', mira: 'Twister',
  elanor: 'Elanor', elmar: 'Elanor', kira: 'Kira', lavinno: 'Lavinno',
};

function detectSeries(p) {
  const handle = p.handle.toLowerCase();
  for (const s of SERIES_KEYWORDS) if (handle.includes(s)) return SERIES_PROPER[s];
  const title = (p.title || '').toLowerCase();
  for (const s of SERIES_KEYWORDS) if (title.includes(s)) return SERIES_PROPER[s];
  return null;
}

function detectColor(p) {
  const blob = `${p.handle.toLowerCase()} ${(p.tags||[]).join(' ').toLowerCase()}`;
  if (/glanzend|glossy/i.test(blob)) return 'Glossy White';
  // Edge case: -kopie of austausch-elanor is white
  if (/-kopie$/.test(p.handle) && /elanor/.test(p.handle.toLowerCase())) return 'White';
  if (/\bchrom\b|\bchrome\b/.test(blob)) return 'Chrome';
  if (/\bschwarz\b|\bblack\b/.test(blob)) return 'Black';
  if (/\bweiss\b|\bweiß\b|\bwhite\b/.test(blob)) return 'White';
  if (/\banthrazit\b|\banthracite\b/.test(blob)) return 'Anthracite';
  return null;
}

const STRIP_TAGS = new Set([
  // German colour words
  'weiss','weiß','schwarz','anthrazit','chrom',
  // Other series we wouldn't want as a tag on a non-series product
  ...SERIES_KEYWORDS,
]);

function recomputeTags(p, series, color) {
  const oldTags = (p.tags || []).map(t => t.toLowerCase().trim());
  // Keep tags that aren't a series keyword or a colour
  const kept = oldTags.filter(t => !STRIP_TAGS.has(t) && !['white','black','anthracite','chrome','glossy white','glossy-white'].includes(t));
  const out = [...kept];
  if (series) out.push(series.toLowerCase());
  if (color) out.push(color.toLowerCase().replace(/\s+/g, '-'));
  return Array.from(new Set(out));
}

async function listProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const d = await gql(`query($c:String){
      products(first:50, after:$c){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id handle title tags
          options{
            id name
            optionValues{ id name }
          }
        }
      }
    }`, { c: cursor });
    out.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

async function updateTags(p, newTags) {
  const d = await gql(`mutation($p:ProductUpdateInput!){
    productUpdate(product:$p){ product{ id } userErrors{ field message } }
  }`, { p: { id: p.id, tags: newTags } });
  if (d.productUpdate.userErrors.length) throw new Error(JSON.stringify(d.productUpdate.userErrors));
}

async function updateOptionValues(productId, optionId, valueUpdates) {
  if (!valueUpdates.length) return;
  const d = await gql(`
    mutation($pid:ID!, $oid:ID!, $upd:[OptionValueUpdateInput!]!){
      productOptionUpdate(
        productId:$pid,
        option:{ id:$oid },
        optionValuesToUpdate:$upd,
        variantStrategy:LEAVE_AS_IS
      ){
        userErrors{ field message code }
      }
    }
  `, { pid: productId, oid: optionId, upd: valueUpdates });
  const errs = d.productOptionUpdate.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
const products = await listProducts();
let tagsChanged = 0;
let optionValuesChanged = 0;

for (const p of products) {
  const series = detectSeries(p);
  const color = detectColor(p);
  const newTags = recomputeTags(p, series, color);
  const oldSorted = JSON.stringify((p.tags || []).map(t => t.toLowerCase()).sort());
  const newSorted = JSON.stringify(newTags.slice().sort());
  const tagsDiffer = oldSorted !== newSorted;

  // Find option values that need translation
  const optionFixes = [];
  for (const o of p.options || []) {
    const vu = [];
    for (const ov of o.optionValues || []) {
      if (ov.name === 'Default Title') continue;
      const tx = translateOptionValue(ov.name);
      if (tx !== ov.name) vu.push({ id: ov.id, name: tx, _from: ov.name });
    }
    if (vu.length) optionFixes.push({ optionId: o.id, optionName: o.name, vu });
  }

  if (!tagsDiffer && !optionFixes.length) continue;

  console.log(`\n${p.handle}`);
  if (tagsDiffer) {
    console.log(`  tags: ${(p.tags || []).join(', ')}  →  ${newTags.join(', ')}`);
    tagsChanged++;
  }
  for (const o of optionFixes) {
    console.log(`  option "${o.optionName}":`);
    for (const v of o.vu) console.log(`    "${v._from}"  →  "${v.name}"`);
    optionValuesChanged += o.vu.length;
  }

  if (!APPLY) continue;
  if (tagsDiffer) {
    try { await updateTags(p, newTags); }
    catch (e) { console.log(`  ✗ updateTags: ${e.message.slice(0, 100)}`); }
  }
  for (const o of optionFixes) {
    try {
      await updateOptionValues(p.id, o.optionId, o.vu.map(v => ({ id: v.id, name: v.name })));
    } catch (e) {
      console.log(`  ✗ updateOptionValues(${o.optionName}): ${e.message.slice(0, 200)}`);
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`tag rows changed:    ${tagsChanged}`);
console.log(`option values fixed: ${optionValuesChanged}`);
