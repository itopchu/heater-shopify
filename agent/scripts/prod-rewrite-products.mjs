#!/usr/bin/env node
/**
 * Comprehensive product clean-up pass for the prod Shopify store.
 *
 * Four batches in one run:
 *   1. TITLES — rewrite all 55 product titles to a clean editorial format:
 *        "{Series} — {Type Description}, {Color}"
 *      Series detection prioritises handle keywords (most reliable),
 *      then title, then tags. Colour normalises German (weiss/schwarz/
 *      anthrazit) → English (White/Black/Anthracite).
 *
 *   2. SERIES METAFIELD — backfill custom.series with the canonical
 *      brand series ("Konrad", "Flora", "Astoria", …). Was 0/55.
 *      Powers the PDP eyebrow + sibling-color cross-link logic.
 *
 *   3. COLOR_FAMILY METAFIELD + TAG REWRITES — backfill
 *      custom.color_family with the English colour name. Replace German
 *      colour tags with their English equivalents.
 *
 *   4. SPEC METAFIELDS — parse the variant titles like "400 x 500 mm"
 *      into width_mm + height_mm + dimensions_w_h_d_mm metafields so the
 *      PDP QuickFacts spec block has data to render.
 *
 * Usage:
 *   node agent/scripts/prod-rewrite-products.mjs            # dry-run
 *   node agent/scripts/prod-rewrite-products.mjs --apply
 */
import { readFileSync, writeFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------
const COLOR_DE_TO_EN = {
  weiss: 'White', weiß: 'White', white: 'White',
  schwarz: 'Black', black: 'Black',
  anthrazit: 'Anthracite', anthracite: 'Anthracite',
  chrom: 'Chrome', chrome: 'Chrome',
};
const SERIES_KEYWORDS = ['konrad','flora','astoria','pullman','twister','elanor','platis','lavinno','atlas','alpha','mira','milan','kira','elmar','platon','kaska'];
const SERIES_PROPER = {
  konrad: 'Konrad',
  flora: 'Flora', milan: 'Flora', kaska: 'Flora',
  atlas: 'Atlas', platis: 'Atlas',
  astoria: 'Astoria', alpha: 'Astoria',
  pullman: 'Pullman', platon: 'Pullman',
  twister: 'Twister', mira: 'Twister',
  elanor: 'Elanor', elmar: 'Elanor',
  kira: 'Kira',
  lavinno: 'Lavinno',
};

function detectSeries(p) {
  const handle = p.handle.toLowerCase();
  for (const s of SERIES_KEYWORDS) if (handle.includes(s)) return s;
  const title = (p.title || '').toLowerCase();
  for (const s of SERIES_KEYWORDS) if (title.includes(s)) return s;
  const tagBlob = (p.tags || []).join(' ').toLowerCase();
  for (const s of SERIES_KEYWORDS) if (tagBlob.includes(s)) return s;
  return null;
}

function deriveType(p, series) {
  const h = p.handle.toLowerCase();
  const isElectric = /elektr|electric/i.test(h);
  const isReplacement = /austausch|renov|replacement/i.test(h);
  const isVertikal = /vertikal|vertical/i.test(h);
  const isHorizontal = /horizontal/i.test(h) || /typ-?22/i.test(h);
  const hasMittel = /mittelanschluss|mittel-und-seitenanschluss|mittel/i.test(h);
  const hasSeite = /seitenanschluss|seitlich/i.test(h);

  if (/lavinno|hange-wc|tornado/i.test(h)) return 'Wall-Hung Toilet, Rimless';
  if (/fussbodenheizungsrohr|fussbodenheizung-rohr/i.test(h)) return 'Underfloor Heating Pipe (PE-RT 5-Layer)';
  if (/heizstab/i.test(h)) return 'Electric Heating Element';
  if (/handtuchhaken|bademantelhalter/i.test(h)) return 'Towel Hook & Bathrobe Holder';
  if (/bidet/i.test(h)) return 'Wall-Hung Bidet, Concealed Valve';
  if (/befestigungsset/i.test(h)) return 'Mounting Kit for Bathroom Radiators';
  if (/multiblock-thermostat/i.test(h)) return 'Multiblock Thermostatic Head Controller';
  if (/multiblock-set|multiblock-/i.test(h)) return 'Multiblock Set, Angle & Straight';
  if (/mischbetrieb/i.test(h)) return 'Mixed-Operation T-Piece';
  if (/thermoflussigkeit/i.test(h)) return 'Thermal Fluid for Electric Bathroom Radiators';
  if (/thermostatventil/i.test(h)) return 'Thermostatic Radiator Valve Set, Corner';
  if (/zweirohr-hahnblock|two-pipe/i.test(h)) return 'Two-Pipe Manifold for Valve Radiators, Angled';

  if (series === 'konrad') {
    if (/typ-22/.test(h)) return 'Type 22 Valve Radiator';
    if (/typ-33/.test(h)) return 'Type 33 Valve Radiator';
    return 'Valve Radiator';
  }
  if (series === 'atlas' || series === 'platis') {
    if (isVertikal) return 'Vertical Flat Panel Radiator';
    return 'Type 22 Horizontal Flat Panel Radiator';
  }
  if (['flora','milan','kaska'].includes(series)) {
    if (isVertikal || /milan/i.test(h)) return 'Vertical Double-Panel Radiator';
    if (isHorizontal || /kaska/i.test(h)) return 'Horizontal Double-Panel Radiator';
    return 'Double-Panel Radiator';
  }
  if (['astoria','alpha','pullman','platon','twister','mira','elanor','elmar','kira'].includes(series)) {
    const variants = [];
    if (isReplacement) variants.push('Replacement');
    if (isElectric) variants.push('Electric');
    let typ = `${variants.length ? variants.join(' ') + ' ' : ''}Towel Warmer`;
    if (hasMittel && hasSeite) typ += ', Center & Side Connection';
    else if (hasMittel) typ += ', Center Connection';
    else if (hasSeite) typ += ', Side Connection';
    return typ;
  }
  return null;
}

function detectColor(p) {
  const h = p.handle.toLowerCase();
  if (/glanzend|glossy/i.test(h)) return 'Glossy White';
  // Override edge case: -kopie of austausch-elanor is actually white per source
  if (/-kopie$/.test(h) && /elanor/.test(h) && /schwarz/.test(h)) return 'White';
  for (const t of h.split('-')) if (COLOR_DE_TO_EN[t]) return COLOR_DE_TO_EN[t];
  for (const tag of p.tags || []) if (COLOR_DE_TO_EN[tag.toLowerCase()]) return COLOR_DE_TO_EN[tag.toLowerCase()];
  for (const w of (p.title || '').toLowerCase().split(/\s+/)) if (COLOR_DE_TO_EN[w]) return COLOR_DE_TO_EN[w];
  return null;
}

function rewriteTitle(p) {
  const series = detectSeries(p);
  const proper = series ? SERIES_PROPER[series] : null;
  const type = deriveType(p, series);
  const color = detectColor(p);
  if (!type) return p.title;
  let out = proper ? `${proper} — ${type}` : type;
  if (color) out += `, ${color}`;
  return out;
}

function parseDimensions(variantTitle) {
  // Match patterns like "400 x 500 mm", "38 x 180", "60 × 81", "44 x 121"
  // Both ASCII x and unicode × are accepted. Optional mm suffix.
  const m = (variantTitle || '').match(/(\d+)\s*(?:mm)?\s*[x×]\s*(\d+)\s*(mm)?/i);
  if (!m) return null;
  let w = parseInt(m[1], 10);
  let h = parseInt(m[2], 10);
  if (!w || !h) return null;
  const hasMm = !!m[3] || /mm/i.test(variantTitle);
  // If neither value carries a unit and both are small (< 300), the source
  // catalog uses cm — convert to mm so every product stores a uniform unit.
  if (!hasMm && w < 300 && h < 300) {
    w *= 10;
    h *= 10;
  }
  return { width: w, height: h, formatted: `${w} × ${h} mm` };
}

function rewriteTags(tags) {
  return Array.from(new Set(tags.map(t => {
    const low = t.toLowerCase();
    if (COLOR_DE_TO_EN[low]) return COLOR_DE_TO_EN[low].toLowerCase();
    return t.toLowerCase();
  })));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function listProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const d = await gql(`query($c:String){
      products(first:50, after:$c){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id handle title productType tags
          variants(first:30){ nodes{ id title selectedOptions{ name value } } }
        }
      }
    }`, { c: cursor });
    out.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

async function applyProductUpdate(p, payload) {
  const d = await gql(`mutation($p:ProductUpdateInput!){
    productUpdate(product:$p){ product{ id } userErrors{ field message } }
  }`, { p: { id: p.id, ...payload } });
  const errs = d.productUpdate.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

async function setMetafields(productId, fields) {
  if (!fields.length) return;
  const d = await gql(`mutation($m:[MetafieldsSetInput!]!){
    metafieldsSet(metafields:$m){ userErrors{ field message } }
  }`, {
    m: fields.map(f => ({ ownerId: productId, ...f })),
  });
  const errs = d.metafieldsSet.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
const products = await listProducts();
console.log(`Total products: ${products.length}\n`);

const summary = { titlesChanged: 0, seriesSet: 0, colorSet: 0, dimensionsSet: 0, tagsRewritten: 0 };

for (const p of products) {
  const newTitle = rewriteTitle(p);
  const series = detectSeries(p);
  const proper = series ? SERIES_PROPER[series] : null;
  const color = detectColor(p);
  const newTags = rewriteTags(p.tags || []);
  const tagsChanged = JSON.stringify((p.tags || []).slice().sort()) !== JSON.stringify(newTags.slice().sort());

  // Pick the first variant with parseable dimensions
  let dim = null;
  for (const v of p.variants?.nodes || []) {
    dim = parseDimensions(v.title);
    if (dim) break;
  }

  console.log(`• ${p.handle}`);
  if (newTitle !== p.title) {
    console.log(`    title: ${p.title}`);
    console.log(`        →  ${newTitle}`);
    summary.titlesChanged++;
  }
  if (proper) {
    console.log(`    series: ${proper}`);
    summary.seriesSet++;
  }
  if (color) {
    console.log(`    color_family: ${color.toLowerCase()}`);
    summary.colorSet++;
  }
  if (dim) {
    console.log(`    dimensions: ${dim.formatted}`);
    summary.dimensionsSet++;
  }
  if (tagsChanged) {
    console.log(`    tags: ${(p.tags||[]).join(',')}  →  ${newTags.join(',')}`);
    summary.tagsRewritten++;
  }

  if (!APPLY) continue;

  // 1. Title + tags via productUpdate
  const productPayload = {};
  if (newTitle !== p.title) productPayload.title = newTitle;
  if (tagsChanged) productPayload.tags = newTags;
  if (Object.keys(productPayload).length) {
    try { await applyProductUpdate(p, productPayload); }
    catch (e) { console.log(`    ✗ productUpdate: ${e.message.slice(0, 100)}`); }
  }

  // 2-4. Metafields
  const mf = [];
  if (proper) mf.push({ namespace: 'custom', key: 'series', type: 'single_line_text_field', value: proper });
  if (color) mf.push({ namespace: 'custom', key: 'color_family', type: 'single_line_text_field', value: color.toLowerCase() });
  if (dim) {
    mf.push({ namespace: 'custom', key: 'width_mm', type: 'number_integer', value: String(dim.width) });
    mf.push({ namespace: 'custom', key: 'height_mm', type: 'number_integer', value: String(dim.height) });
    mf.push({ namespace: 'custom', key: 'dimensions_w_h_d_mm', type: 'single_line_text_field', value: dim.formatted });
  }
  if (mf.length) {
    try { await setMetafields(p.id, mf); }
    catch (e) { console.log(`    ✗ metafieldsSet: ${e.message.slice(0, 100)}`); }
  }
}

console.log(`\n=== Summary ===`);
console.log(`titles changed:    ${summary.titlesChanged}`);
console.log(`series set:        ${summary.seriesSet}`);
console.log(`color_family set:  ${summary.colorSet}`);
console.log(`dimensions set:    ${summary.dimensionsSet}`);
console.log(`tags rewritten:    ${summary.tagsRewritten}`);
