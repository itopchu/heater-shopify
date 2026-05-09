#!/usr/bin/env node
/**
 * Catalog-wide translation audit.
 *
 * Walks every product on the store and inspects, per locale (DE/NL/FR):
 *   - title + body_html (PRODUCT translatable content)
 *   - product_type (PRODUCT translatable content; many products only have
 *     EN registered)
 *   - every prose metafield (single_line, multi_line, rich_text)
 *   - every PRODUCT_OPTION (option name) and PRODUCT_OPTION_VALUE (Anthracite,
 *     Stainless steel, …)
 *   - presence of content.sections_de / sections_nl / sections_fr (the
 *     dual-metafield pattern that NL/FR currently lack)
 *
 * Emits:
 *   data/translations/catalog-audit-<stamp>/per-product.csv  (one row per gap)
 *   data/translations/catalog-audit-<stamp>/summary.json
 *
 * Read-only.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
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

const LOCALES = ['de', 'nl', 'fr'];

// 1. List every product
async function listProducts() {
  const all = [];
  let cursor = null;
  for (;;) {
    const d = await gql(
      `query($after:String){products(first:50, after:$after){
        edges{cursor node{id handle productType options{id name optionValues{id name}} metafields(first:50){nodes{id namespace key type value}}}}
        pageInfo{hasNextPage}
      }}`,
      {after: cursor},
    );
    for (const e of d.products.edges) all.push(e.node);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.edges.at(-1).cursor;
  }
  return all;
}

// 2. Bulk-fetch translations: translatableResourcesByIds(resourceIds, locale)
async function bulkTrans(ids, locale) {
  if (ids.length === 0) return {};
  const out = {};
  // Shopify caps batches; use 50 at a time.
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const d = await gql(
      `query($ids:[ID!]!,$loc:String!){translatableResourcesByIds(resourceIds:$ids, first:50){
        nodes{
          resourceId
          translatableContent{key value type}
          translations(locale:$loc){key value}
        }
      }}`,
      {ids: batch, loc: locale},
    );
    for (const n of d.translatableResourcesByIds.nodes) {
      out[n.resourceId] = n;
    }
  }
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────
console.log(`→ ${STORE}\n  fetching products …`);
const products = await listProducts();
console.log(`  ${products.length} products\n`);

// Gather every translatable resource ID (product, options, option values, prose metafields)
const allIds = [];
const productMfIds = new Map(); // productId → list of prose metafield IDs
const STRING_TYPES = new Set([
  'single_line_text_field',
  'multi_line_text_field',
  'rich_text_field',
]);
const SKIP_KEYS = new Set([
  'image_status',
  'copy_status',
  'primary_pdf_url',
  'badge',
  'widget',
  'review_widget_data',
  'sections_de',
  'sections_nl',
  'sections_fr',
  'sections_en',
  'market_visibility',
]);

for (const p of products) {
  allIds.push(p.id);
  for (const o of p.options) {
    allIds.push(o.id);
    for (const ov of o.optionValues ?? []) allIds.push(ov.id);
  }
  const mfIds = [];
  for (const mf of p.metafields.nodes) {
    if (!STRING_TYPES.has(mf.type)) continue;
    if (SKIP_KEYS.has(mf.key)) continue;
    if (!mf.value || !mf.value.trim()) continue;
    if (mf.value.startsWith('<')) continue; // HTML widgets
    if (mf.value.startsWith('http')) continue;
    if (mf.value.startsWith('[')) continue;
    if (mf.value.startsWith('{')) continue;
    allIds.push(mf.id);
    mfIds.push(mf.id);
  }
  productMfIds.set(p.id, mfIds);
}
console.log(`  ${allIds.length} translatable resource IDs to probe`);

// 3. Pull all locales in parallel
console.log(`  fetching translations for ${LOCALES.join(', ')} …`);
const transByLocale = {};
for (const loc of LOCALES) {
  process.stdout.write(`    ${loc} … `);
  transByLocale[loc] = await bulkTrans(allIds, loc);
  console.log(`${Object.keys(transByLocale[loc]).length} resources`);
}

// 4. Build the gaps table
function statusFor(resourceId, key, locale) {
  const r = transByLocale[locale][resourceId];
  if (!r) return 'no-resource';
  const en = r.translatableContent.find((c) => c.key === key)?.value;
  if (!en || !en.trim()) return 'no-source';
  const tr = r.translations.find((t) => t.key === key)?.value;
  if (!tr) return 'missing';
  if (tr.trim() === en.trim()) return 'identical';
  return 'translated';
}

const csvRows = [
  ['handle', 'resource_type', 'key', 'en_value', 'de', 'nl', 'fr'],
];
const tally = {
  PRODUCT: {missing: 0, identical: 0, translated: 0, total: 0},
  PRODUCT_OPTION: {missing: 0, identical: 0, translated: 0, total: 0},
  PRODUCT_OPTION_VALUE: {missing: 0, identical: 0, translated: 0, total: 0},
  METAFIELD: {missing: 0, identical: 0, translated: 0, total: 0},
};

const sectionsAudit = []; // products lacking sections_nl or sections_fr
const PRODUCT_KEYS = ['title', 'body_html', 'product_type', 'meta_title', 'meta_description'];

for (const p of products) {
  // PRODUCT-level
  const prRes = transByLocale.de[p.id];
  if (prRes) {
    for (const c of prRes.translatableContent) {
      if (!PRODUCT_KEYS.includes(c.key)) continue;
      if (!c.value || !c.value.trim()) continue;
      const status = LOCALES.map((l) => statusFor(p.id, c.key, l));
      tally.PRODUCT.total++;
      let allOk = true;
      status.forEach((s, i) => {
        if (s === 'translated') tally.PRODUCT.translated++;
        else if (s === 'identical') {
          tally.PRODUCT.identical++;
          allOk = false;
        } else if (s === 'missing') {
          tally.PRODUCT.missing++;
          allOk = false;
        }
      });
      if (!allOk) {
        csvRows.push([
          p.handle,
          'PRODUCT',
          c.key,
          c.value.replace(/\s+/g, ' ').slice(0, 200),
          ...status,
        ]);
      }
    }
  }

  // PRODUCT_OPTION
  for (const o of p.options) {
    const status = LOCALES.map((l) => statusFor(o.id, 'name', l));
    tally.PRODUCT_OPTION.total++;
    let allOk = true;
    status.forEach((s) => {
      if (s === 'translated') tally.PRODUCT_OPTION.translated++;
      else if (s === 'identical') {
        tally.PRODUCT_OPTION.identical++;
        allOk = false;
      } else if (s === 'missing') {
        tally.PRODUCT_OPTION.missing++;
        allOk = false;
      }
    });
    if (!allOk) {
      csvRows.push([p.handle, 'PRODUCT_OPTION', `name (${o.name})`, o.name, ...status]);
    }
    // PRODUCT_OPTION_VALUE
    for (const ov of o.optionValues ?? []) {
      // Skip pure-numeric values (sizes, wattages) — language-neutral
      if (/^\d+(\.\d+)?$/.test(ov.name.trim())) continue;
      const ovStatus = LOCALES.map((l) => statusFor(ov.id, 'name', l));
      tally.PRODUCT_OPTION_VALUE.total++;
      let okv = true;
      ovStatus.forEach((s) => {
        if (s === 'translated') tally.PRODUCT_OPTION_VALUE.translated++;
        else if (s === 'identical') {
          tally.PRODUCT_OPTION_VALUE.identical++;
          okv = false;
        } else if (s === 'missing') {
          tally.PRODUCT_OPTION_VALUE.missing++;
          okv = false;
        }
      });
      if (!okv) {
        csvRows.push([
          p.handle,
          'PRODUCT_OPTION_VALUE',
          `${o.name}=${ov.name}`,
          ov.name,
          ...ovStatus,
        ]);
      }
    }
  }

  // METAFIELDs (prose only)
  for (const mfId of productMfIds.get(p.id) ?? []) {
    const r = transByLocale.de[mfId];
    if (!r) continue;
    for (const c of r.translatableContent) {
      if (!c.value || !c.value.trim()) continue;
      const status = LOCALES.map((l) => statusFor(mfId, c.key, l));
      tally.METAFIELD.total++;
      let allOk = true;
      status.forEach((s) => {
        if (s === 'translated') tally.METAFIELD.translated++;
        else if (s === 'identical') {
          tally.METAFIELD.identical++;
          allOk = false;
        } else if (s === 'missing') {
          tally.METAFIELD.missing++;
          allOk = false;
        }
      });
      if (!allOk) {
        // Find the metafield's namespace.key for readability
        const mf = p.metafields.nodes.find((x) => x.id === mfId);
        const label = mf ? `${mf.namespace}.${mf.key}` : c.key;
        csvRows.push([
          p.handle,
          'METAFIELD',
          label,
          c.value.replace(/\s+/g, ' ').slice(0, 200),
          ...status,
        ]);
      }
    }
  }

  // Sections metafield audit
  const mfKeys = new Set(p.metafields.nodes.map((m) => `${m.namespace}.${m.key}`));
  const hasDe = mfKeys.has('content.sections_de');
  const hasEn = mfKeys.has('content.sections_en');
  const hasNl = mfKeys.has('content.sections_nl');
  const hasFr = mfKeys.has('content.sections_fr');
  if (hasDe || hasEn) {
    sectionsAudit.push({
      handle: p.handle,
      sections_de: hasDe,
      sections_en: hasEn,
      sections_nl: hasNl,
      sections_fr: hasFr,
    });
  }
}

// 5. Write outputs
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = resolve(ROOT, 'data', 'translations', `catalog-audit-${STAMP}`);
mkdirSync(OUT_DIR, {recursive: true});

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
writeFileSync(
  resolve(OUT_DIR, 'per-product.csv'),
  csvRows.map((r) => r.map(csvCell).join(',')).join('\n'),
  'utf8',
);
writeFileSync(
  resolve(OUT_DIR, 'sections-audit.csv'),
  [
    'handle,sections_de,sections_en,sections_nl,sections_fr',
    ...sectionsAudit.map(
      (r) =>
        `${r.handle},${r.sections_de ? 'Y' : ''},${r.sections_en ? 'Y' : ''},${r.sections_nl ? 'Y' : ''},${r.sections_fr ? 'Y' : ''}`,
    ),
  ].join('\n'),
  'utf8',
);

const sectionsMissing = {
  total: sectionsAudit.length,
  missing_nl: sectionsAudit.filter((r) => !r.sections_nl).length,
  missing_fr: sectionsAudit.filter((r) => !r.sections_fr).length,
};

const summary = {
  store: STORE,
  products: products.length,
  generatedAt: new Date().toISOString(),
  resourceTallies: tally,
  sectionsMissing,
};
writeFileSync(
  resolve(OUT_DIR, 'summary.json'),
  JSON.stringify(summary, null, 2),
  'utf8',
);

// 6. Console report
console.log('\n═══ Resource-level tallies (per (resource, key, locale) cell) ═══');
for (const [type, t] of Object.entries(tally)) {
  const cells = t.total * 3;
  const pct = (n) => ((n / cells) * 100).toFixed(1).padStart(5);
  console.log(
    `  ${type.padEnd(22)} ${t.total} resources — translated ${t.translated} (${pct(t.translated)}%), identical-to-EN ${t.identical} (${pct(t.identical)}%), missing ${t.missing} (${pct(t.missing)}%)`,
  );
}

console.log('\n═══ Sections metafield (dual-language pattern) ═══');
console.log(`  ${sectionsMissing.total} products have sections_de/en`);
console.log(`  ${sectionsMissing.missing_nl} lack sections_nl`);
console.log(`  ${sectionsMissing.missing_fr} lack sections_fr`);

console.log(`\n✓ ${csvRows.length - 1} rows of gaps → ${OUT_DIR}/per-product.csv`);
console.log(`✓ summary → ${OUT_DIR}/summary.json`);
