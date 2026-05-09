#!/usr/bin/env node
/**
 * Export every English source string Shopify is willing to translate, so
 * we have a single human-reviewable corpus to feed translators (or the
 * Gemini pipeline) for DE/NL/FR.
 *
 * Walks Admin GraphQL `translatableResources` for each resource type that
 * carries customer-visible text and writes per-type JSON + CSV files to
 * data/translations/en-export-<timestamp>/.
 *
 * Read-only — no writes, no mutations, no rate-limited Gemini calls.
 *
 * Flags:
 *   --store=prod|dev         (default: prod)
 *   --types=PRODUCT,COLLECTION,...   restrict resource types
 *   --include-existing       also emit current DE/NL/FR translations alongside EN
 *
 * Usage:
 *   node agent/scripts/export-shopify-en-content.mjs
 *   node agent/scripts/export-shopify-en-content.mjs --types=PRODUCT --include-existing
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

const STORE_FLAG = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--store'));
  if (i < 0) return 'prod';
  const a = process.argv[i];
  return (a.includes('=') ? a.split('=')[1] : process.argv[i + 1]) ?? 'prod';
})();
const STORE = STORE_FLAG === 'dev' ? process.env.SHOPIFY_DEV_STORE : process.env.SHOPIFY_PROD_STORE;
const TOKEN = STORE_FLAG === 'dev' ? process.env.SHOPIFY_DEV_ADMIN_TOKEN : process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error(`Missing Shopify ${STORE_FLAG.toUpperCase()} env vars`);

const TYPES_ARG = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--types'));
  if (i < 0) return null;
  const a = process.argv[i];
  return (a.includes('=') ? a.split('=')[1] : process.argv[i + 1])
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
})();
const INCLUDE_EXISTING = process.argv.includes('--include-existing');

// All translatable resource types that carry customer-visible English text.
// Verified against TranslatableResourceType enum on Admin API 2026-04.
// METAFIELD covers product/collection metafields (custom.subtitle, etc.);
// METAOBJECT covers FAQ entries and merchant-defined content blocks;
// LINK covers menu item titles; FILTER covers Search & Discovery filter labels.
const ALL_TYPES = [
  'PRODUCT',
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'COLLECTION',
  'COLLECTION_IMAGE',
  'PAGE',
  'BLOG',
  'ARTICLE',
  'ARTICLE_IMAGE',
  'MEDIA_IMAGE',
  'SHOP_POLICY',
  'LINK',
  'MENU',
  'METAOBJECT',
  'METAFIELD',
  'FILTER',
  'DELIVERY_METHOD_DEFINITION',
  'PACKING_SLIP_TEMPLATE',
  'SHOP',
  'EMAIL_TEMPLATE',
];
const TYPES = TYPES_ARG ?? ALL_TYPES;

const TARGET_LOCALES = ['de', 'nl', 'fr'];

console.log(`→ ${STORE} (${STORE_FLAG})`);
console.log(`  types        : ${TYPES.join(', ')}`);
console.log(`  existing     : ${INCLUDE_EXISTING ? 'on' : 'off (EN only)'}`);
console.log('');

// ─────────────────────── shopify gql ───────────────────────
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

async function listResources(resourceType, withTranslations) {
  const all = [];
  let cursor = null;
  const translationsBlock = withTranslations
    ? `translations(locale: $locale) { key value locale }`
    : '';
  const query = `query($type: TranslatableResourceType!, $after: String${withTranslations ? ', $locale: String!' : ''}) {
    translatableResources(first: 50, after: $after, resourceType: $type) {
      edges {
        cursor
        node {
          resourceId
          translatableContent { key value digest locale type }
          ${translationsBlock}
        }
      }
      pageInfo { hasNextPage }
    }
  }`;
  for (;;) {
    const variables = {type: resourceType, after: cursor};
    if (withTranslations) variables.locale = withTranslations;
    const data = await gql(query, variables);
    for (const e of data.translatableResources.edges) all.push(e.node);
    if (!data.translatableResources.pageInfo.hasNextPage) break;
    cursor = data.translatableResources.edges.at(-1).cursor;
  }
  return all;
}

// ─────────────────────── csv emit ───────────────────────
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvLine(cells) {
  return cells.map(csvCell).join(',');
}

// ─────────────────────── main ───────────────────────
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = resolve(ROOT, 'data', 'translations', `en-export-${STAMP}`);
mkdirSync(OUT_DIR, {recursive: true});
console.log(`  out          : ${OUT_DIR}\n`);

const summary = {};

for (const type of TYPES) {
  process.stdout.write(`  ${type.padEnd(22)} `);
  let resources;
  try {
    resources = await listResources(type, null);
  } catch (err) {
    console.log(`✗ ${err.message.slice(0, 80)}`);
    continue;
  }

  // Optionally fetch existing translations per locale (one extra call per locale per page;
  // expensive — only when --include-existing).
  const existing = {};
  if (INCLUDE_EXISTING) {
    for (const loc of TARGET_LOCALES) {
      try {
        const list = await listResources(type, loc);
        for (const r of list) {
          existing[`${r.resourceId}__${loc}`] = Object.fromEntries(
            (r.translations ?? []).map((t) => [t.key, t.value]),
          );
        }
      } catch {
        // skip locale on error; not all stores have all locales registered
      }
    }
  }

  // Emit JSON with full structure
  const json = resources.map((r) => {
    const out = {
      resourceId: r.resourceId,
      content: r.translatableContent
        .filter((c) => c.value && c.value.trim())
        .map((c) => ({
          key: c.key,
          locale: c.locale,
          type: c.type,
          digest: c.digest,
          value: c.value,
        })),
    };
    if (INCLUDE_EXISTING) {
      out.translations = Object.fromEntries(
        TARGET_LOCALES.map((loc) => [
          loc,
          existing[`${r.resourceId}__${loc}`] ?? {},
        ]),
      );
    }
    return out;
  });

  const jsonPath = resolve(OUT_DIR, `${type.toLowerCase()}.json`);
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');

  // Emit CSV — one row per (resourceId, key)
  const header = ['resourceId', 'key', 'type', 'digest', 'value_en'];
  if (INCLUDE_EXISTING) header.push(...TARGET_LOCALES.map((l) => `value_${l}`));
  const rows = [header];
  for (const r of resources) {
    for (const c of r.translatableContent) {
      if (!c.value || !c.value.trim()) continue;
      const row = [r.resourceId, c.key, c.type, c.digest, c.value];
      if (INCLUDE_EXISTING) {
        for (const loc of TARGET_LOCALES) {
          row.push(existing[`${r.resourceId}__${loc}`]?.[c.key] ?? '');
        }
      }
      rows.push(row);
    }
  }
  const csvPath = resolve(OUT_DIR, `${type.toLowerCase()}.csv`);
  writeFileSync(csvPath, rows.map(csvLine).join('\n'), 'utf8');

  const stringCount = json.reduce((n, r) => n + r.content.length, 0);
  summary[type] = {resources: resources.length, strings: stringCount};
  console.log(`✓ ${resources.length.toString().padStart(4)} resources, ${stringCount} strings`);
}

writeFileSync(
  resolve(OUT_DIR, 'summary.json'),
  JSON.stringify({store: STORE, exportedAt: new Date().toISOString(), summary}, null, 2),
  'utf8',
);
console.log(`\n✓ written to ${OUT_DIR}`);
