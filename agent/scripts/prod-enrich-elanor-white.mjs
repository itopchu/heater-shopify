#!/usr/bin/env node
/**
 * Copy the rich content metafields (sections_en, sections_de, all
 * specs.*, custom.short_description, custom.subtitle, media.primary_pdf_url)
 * from a sibling Elanor product onto the recreated white replacement
 * product. The white product was created earlier with only the minimum
 * fields (title, color, dimensions); without sections + specs the PDP
 * shows empty Overview/Technical/About/FAQ blocks.
 *
 * Source: austausch-badheizkorper-handtuchheizkorper-schwarz-elanor-seitlich-offen
 *         (the black replacement Elanor — closest sibling, same product
 *          family with full content)
 * Target: elanor-replacement-towel-warmer-white
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

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const SOURCE_HANDLE = 'austausch-badheizkorper-handtuchheizkorper-schwarz-elanor-seitlich-offen';
const TARGET_HANDLE = 'elanor-replacement-towel-warmer-white';

// All metafield (namespace, key, type) we copy. Title-rewrite metafields
// and color_family stay with whatever the new product has — those were
// set correctly during product creation. We copy *content* only.
const METAFIELDS_TO_COPY = [
  ['content', 'sections_en', 'json'],
  ['content', 'sections_de', 'json'],
  ['custom', 'short_description', 'multi_line_text_field'],
  ['custom', 'subtitle', 'single_line_text_field'],
  ['media', 'primary_pdf_url', 'single_line_text_field'],
  // Specs that the QuickFacts + Detailed spec table render
  ['specs', 'orientation', 'single_line_text_field'],
  ['specs', 'connection_type', 'single_line_text_field'],
  ['specs', 'pipe_spacing_mm', 'number_integer'],
  ['specs', 'heating_medium', 'single_line_text_field'],
  ['specs', 'heat_output_75_65_20', 'number_integer'],
  ['specs', 'heat_output_70_55_20', 'number_integer'],
  ['specs', 'heat_output_55_45_20', 'number_integer'],
  ['specs', 'wattage_w', 'number_integer'],
  ['specs', 'energy_class', 'single_line_text_field'],
  ['specs', 'finish', 'single_line_text_field'],
  ['specs', 'material', 'single_line_text_field'],
  ['specs', 'voltage', 'single_line_text_field'],
  ['specs', 'mounting_kit_included', 'boolean'],
  ['specs', 'valve_included', 'boolean'],
  ['specs', 'thermostat_included', 'boolean'],
  ['specs', 'heat_pump_compatible', 'boolean'],
  ['specs', 'bathroom_suitable', 'boolean'],
  ['specs', 'max_pressure_bar', 'number_decimal'],
  ['specs', 'max_temp_c', 'number_integer'],
  ['specs', 'depth_mm', 'number_integer'],
  ['specs', 'installation_difficulty', 'single_line_text_field'],
  ['specs', 'room_coverage_m2', 'number_integer'],
  // Filters (PLP-side)
  ['filters', 'orientation', 'single_line_text_field'],
  ['filters', 'connection_type', 'single_line_text_field'],
];

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

// 1. Look up source + target product ids
const ids = await gql(`{
  source: productByHandle(handle:"${SOURCE_HANDLE}"){ id title }
  target: productByHandle(handle:"${TARGET_HANDLE}"){ id title }
}`);
if (!ids.source) throw new Error(`Source not found: ${SOURCE_HANDLE}`);
if (!ids.target) throw new Error(`Target not found: ${TARGET_HANDLE}`);
console.log(`Source: ${ids.source.id}  ${ids.source.title}`);
console.log(`Target: ${ids.target.id}  ${ids.target.title}`);

// 2. Fetch source metafields (one query)
const aliases = METAFIELDS_TO_COPY.map(([ns, k], i) =>
  `mf${i}: metafield(namespace:"${ns}", key:"${k}"){ value type }`
).join('\n        ');

const srcRes = await gql(`{
  product(id:"${ids.source.id}"){
    ${aliases}
  }
}`);

const updates = [];
for (let i = 0; i < METAFIELDS_TO_COPY.length; i++) {
  const [ns, key, expectedType] = METAFIELDS_TO_COPY[i];
  const mf = srcRes.product?.[`mf${i}`];
  if (!mf?.value) continue;
  // For the white replacement, sections still describe a black product —
  // patch the most obvious colour leaks before writing.
  let value = mf.value;
  if (ns === 'content' && key === 'sections_en') {
    value = value
      .replace(/\bblack\b/gi, 'white')
      .replace(/Schwarz/g, 'Weiss')
      .replace(/schwarz/g, 'weiss');
  }
  if (ns === 'custom' && (key === 'short_description' || key === 'subtitle')) {
    value = value.replace(/\bblack\b/gi, 'white').replace(/Schwarz/gi, 'White');
  }
  updates.push({
    ownerId: ids.target.id,
    namespace: ns,
    key,
    type: mf.type ?? expectedType,
    value,
  });
}

console.log(`\nMetafields to copy: ${updates.length}`);
for (const u of updates) {
  const preview = String(u.value).replace(/\s+/g, ' ').slice(0, 80);
  console.log(`  ${u.namespace}.${u.key}  (${u.type})  "${preview}…"`);
}

if (!APPLY) {
  console.log('\n[dry-run] re-run with --apply');
  process.exit(0);
}

// 3. Bulk write — Shopify metafieldsSet accepts up to 25 per call
for (let i = 0; i < updates.length; i += 25) {
  const batch = updates.slice(i, i + 25);
  const r = await gql(`mutation($m:[MetafieldsSetInput!]!){
    metafieldsSet(metafields:$m){ userErrors{ field message } }
  }`, { m: batch });
  const errs = r.metafieldsSet.userErrors;
  if (errs.length) console.log(`  batch ${i / 25 + 1} warnings:`, JSON.stringify(errs));
  else console.log(`  ✓ batch ${i / 25 + 1} (${batch.length})`);
}
console.log('\nDone — hard-refresh the PDP to see the populated sections.');
