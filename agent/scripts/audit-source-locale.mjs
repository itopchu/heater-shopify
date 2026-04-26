#!/usr/bin/env node
/**
 * audit-source-locale.mjs
 *
 * READ-ONLY audit of every customer-visible Shopify Admin resource whose
 * stored "source" content is German rather than English. The shop's primary
 * locale is `en`, so any source-language German text is a bug — it bypasses
 * Translate & Adapt and shows up untranslated for EN customers.
 *
 * Resources audited (source value, no `locale` arg):
 *   - All metaobjects of every defined type (text fields)
 *   - All products (title, descriptionHtml, text metafields under
 *     namespaces sync.*, custom.*, gberg.*)
 *   - All collections (title, descriptionHtml)
 *   - All pages EXCEPT impressum, datenschutz, agb, widerrufsbelehrung
 *     (legitimately German)
 *   - Header (`main-menu`) + footer link-list menu items
 *
 * No mutations. Outputs JSON to tmp/source-locale-mismatch-audit.json and
 * prints a markdown summary to stdout.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 *
 * Usage:
 *   node agent/scripts/audit-source-locale.mjs
 *   node agent/scripts/audit-source-locale.mjs --limit-products 25
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');
const OUT_PATH = resolve(REPO_ROOT, 'tmp', 'source-locale-mismatch-audit.json');

// ---------------------------------------------------------------------------
// Env loader
// ---------------------------------------------------------------------------
function loadEnvLocal(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal(ENV_PATH);

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing env vars: SHOPIFY_DEV_STORE and/or SHOPIFY_DEV_ADMIN_TOKEN');
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const ARGV = process.argv.slice(2);
function flagNum(name, dflt) {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? Number(ARGV[i + 1]) : dflt;
}
const PRODUCT_LIMIT = flagNum('--limit-products', 0); // 0 = no cap

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 1000)}`);
  }
  return json.data;
}

// Throttle so we don't hammer the leaky-bucket. Admin REST/GraphQL is ~50 req/s.
async function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// German detection
// Flag if ANY of:
//   - Contains umlaut/ß
//   - First word matches German starter regex
//   - Contains German function word AND no English function words
// ---------------------------------------------------------------------------
const UMLAUT_RE = /[äöüßÄÖÜ]/;
const STARTER_RE = /^(Ist|Wie|Wir|Wo|Was|Können|Welche|Passen|Lässt|Sind|Müssen|Werden|Wird|Würden|Hat|Haben|Der|Die|Das|Den|Dem|Ein|Eine|Für|Mit|Von|Auf|Bei|Durch|Über|Unter)\b/;
const GERMAN_WORD_RE = /\b(und|oder|aber|nicht|sehr|auch|noch|nur|sich|wird|werden|wurde|wurden)\b/i;
const ENGLISH_WORD_RE = /\b(the|and|is|are|with|for|of|to|from|this|that|these|those|you|your|our|we|will|have|has)\b/i;

// Strip HTML for plaintext analysis, but keep umlauts/text intact.
function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
// Get the first non-whitespace word of plaintext.
function firstWord(s) {
  const t = stripHtml(s);
  const m = t.match(/[A-Za-zÄÖÜäöüß]+/);
  return m ? m[0] : '';
}
function germanIndicators(value) {
  const indicators = [];
  if (value == null || value === '') return indicators;
  const text = String(value);
  const plain = stripHtml(text);

  if (UMLAUT_RE.test(text)) indicators.push('umlaut');

  const fw = firstWord(text);
  if (fw) {
    const m = fw.match(STARTER_RE);
    if (m) indicators.push(`starter:${m[1]}`);
  }

  const germanFn = plain.match(GERMAN_WORD_RE);
  if (germanFn) {
    const englishFn = plain.match(ENGLISH_WORD_RE);
    if (!englishFn) indicators.push(`function-word:${germanFn[0].toLowerCase()}`);
  }
  return indicators;
}
function isGerman(value) {
  return germanIndicators(value).length > 0;
}

// Confidence rating to help distinguish real leaks from umlaut-in-English text.
//   high   → starter regex matched, OR multiple distinct indicators, OR
//            umlaut present AND text has no English function words
//   medium → function-word match alone
//   low    → umlaut alone in text that contains English function words
//            (very likely a brand name like "Schäfer" or proper noun "TÜV")
function classify(value, indicators) {
  if (indicators.length === 0) return 'none';
  const text = String(value || '');
  const plain = stripHtml(text);
  const hasEnglish = ENGLISH_WORD_RE.test(plain);

  const hasStarter = indicators.some(i => i.startsWith('starter:'));
  const hasFn = indicators.some(i => i.startsWith('function-word:'));
  const hasUmlaut = indicators.includes('umlaut');

  if (hasStarter) return 'high';
  if (hasUmlaut && hasFn) return 'high';
  if (hasUmlaut && !hasEnglish) return 'high';
  if (hasFn && !hasEnglish) return 'high';
  if (hasFn) return 'medium';
  if (hasUmlaut && hasEnglish) return 'low';
  return 'medium';
}

// ---------------------------------------------------------------------------
// Translatable-resource digest fetcher (per-resource)
// We need translatableContent[].digest to produce the bug record.
// ---------------------------------------------------------------------------
const TRANSLATABLE_RESOURCE_Q = `
  query($id: ID!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent { key value digest locale type }
    }
  }
`;
async function fetchDigests(resourceId) {
  try {
    const data = await gql(TRANSLATABLE_RESOURCE_Q, { id: resourceId });
    const out = {};
    for (const c of data.translatableResource?.translatableContent || []) {
      out[c.key] = c.digest;
    }
    return out;
  } catch (err) {
    console.warn(`  digest lookup failed for ${resourceId}: ${err.message.slice(0, 120)}`);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 1. Metaobject definitions + nodes
// ---------------------------------------------------------------------------
const METAOBJECT_DEFS_Q = `
  query {
    metaobjectDefinitions(first: 100) {
      nodes {
        id type name
        fieldDefinitions { key name type { name } }
      }
    }
  }
`;
const METAOBJECTS_LIST_Q = `
  query($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle type
        fields { key value type }
      }
    }
  }
`;
async function fetchAllMetaobjectDefinitions() {
  const d = await gql(METAOBJECT_DEFS_Q);
  return d.metaobjectDefinitions.nodes;
}
async function fetchAllMetaobjectsOfType(type) {
  const all = [];
  let after = null;
  for (;;) {
    const d = await gql(METAOBJECTS_LIST_Q, { type, first: 100, after });
    all.push(...d.metaobjects.nodes);
    if (!d.metaobjects.pageInfo.hasNextPage) break;
    after = d.metaobjects.pageInfo.endCursor;
    await pause(150);
  }
  return all;
}

// Field types whose source value is human-readable text (not refs/files).
const TEXT_FIELD_TYPES = new Set([
  'single_line_text_field',
  'multi_line_text_field',
  'rich_text_field',
  'json',          // sometimes contains user-visible strings; we'll scan
  'json_string',
]);

// ---------------------------------------------------------------------------
// 2. Products + product metafields
// ---------------------------------------------------------------------------
const PRODUCTS_LIST_Q = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title descriptionHtml
        metafields(first: 50) {
          nodes { id namespace key value type }
        }
      }
    }
  }
`;
async function fetchAllProducts(limit) {
  const all = [];
  let after = null;
  for (;;) {
    const d = await gql(PRODUCTS_LIST_Q, { first: 100, after });
    all.push(...d.products.nodes);
    if (limit && all.length >= limit) return all.slice(0, limit);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
    await pause(200);
  }
  return all;
}

const TEXT_METAFIELD_TYPES = new Set([
  'single_line_text_field',
  'multi_line_text_field',
  'rich_text_field',
]);
const AUDIT_NAMESPACES = new Set(['sync', 'custom', 'gberg']);

// Metafields that store machine-readable references (URLs, handles, IDs,
// digests, timestamps, image hashes, etc.) — not customer-visible copy.
// We exclude these from the language audit; their German content is fine.
const NON_CUSTOMER_FACING_KEYS = new Set([
  'xxl_source_handle',
  'xxl_source_url',
  'xxl_image_url',
  'xxl_canonical_url',
  'xxl_source_id',
  'xxl_source_etag',
  'xxl_image_hash',
  'xxl_synced_at',
  'xxl_image_prompt',     // AI prompt (internal)
  'image_regen_prompt',
  'image_regen_provider',
  'image_regen_model',
  'last_synced_at',
  'sync_version',
]);
function isCustomerFacingMetafieldKey(key) {
  // Heuristic: anything ending in _handle/_url/_id/_at/_hash/_etag/_prompt
  // is internal sync plumbing, not user copy.
  if (NON_CUSTOMER_FACING_KEYS.has(key)) return false;
  if (/(_handle|_url|_id|_at|_hash|_etag|_prompt|_slug|_provider|_model|_version)$/i.test(key)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 3. Collections
// ---------------------------------------------------------------------------
const COLLECTIONS_LIST_Q = `
  query($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title descriptionHtml }
    }
  }
`;
async function fetchAllCollections() {
  const all = [];
  let after = null;
  for (;;) {
    const d = await gql(COLLECTIONS_LIST_Q, { first: 100, after });
    all.push(...d.collections.nodes);
    if (!d.collections.pageInfo.hasNextPage) break;
    after = d.collections.pageInfo.endCursor;
    await pause(150);
  }
  return all;
}

// ---------------------------------------------------------------------------
// 4. Pages
// ---------------------------------------------------------------------------
const PAGES_LIST_Q = `
  query($first: Int!, $after: String) {
    pages(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title body }
    }
  }
`;
const EXCLUDED_PAGE_HANDLES = new Set([
  'impressum',
  'datenschutz',
  'agb',
  'widerrufsbelehrung',
  // also commonly-aliased handles for legitimately-German legal pages:
  'widerruf',
  'datenschutzerklarung',
  'datenschutzerklaerung',
]);
async function fetchAllPages() {
  const all = [];
  let after = null;
  for (;;) {
    const d = await gql(PAGES_LIST_Q, { first: 100, after });
    all.push(...d.pages.nodes);
    if (!d.pages.pageInfo.hasNextPage) break;
    after = d.pages.pageInfo.endCursor;
    await pause(150);
  }
  return all;
}

// ---------------------------------------------------------------------------
// 5. Menus (header / footer)
// ---------------------------------------------------------------------------
const MENUS_LIST_Q = `
  query {
    menus(first: 50) {
      nodes {
        id handle title
        items { id title type url
          items { id title type url
            items { id title type url }
          }
        }
      }
    }
  }
`;
function flattenMenuItems(items, parentTitle = '') {
  const out = [];
  for (const item of items || []) {
    out.push({ id: item.id, title: item.title, parentTitle });
    if (item.items?.length) out.push(...flattenMenuItems(item.items, item.title));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leak builder
// ---------------------------------------------------------------------------
function makeLeak({ resource_type, resource_id, handle_or_id_human, field_key, value, digest }) {
  const indicators = germanIndicators(value);
  if (indicators.length === 0) return null;
  const text = String(value ?? '');
  return {
    resource_type,
    resource_id,
    handle_or_id_human,
    field_key,
    translatable_content_digest: digest || null,
    current_source_value: text,
    value_excerpt: stripHtml(text).slice(0, 200),
    german_indicators: indicators,
    confidence: classify(value, indicators),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`→ audit-source-locale  store=${STORE}  api=${API_VERSION}`);
  const leaks = [];
  const totals = {
    metaobjects_scanned: 0,
    products_scanned: 0,
    collections_scanned: 0,
    pages_scanned: 0,
    menu_items_scanned: 0,
    leaks_found: 0,
  };

  // -----  Metaobjects  -----
  console.log('\n[1/5] Metaobject definitions');
  const defs = await fetchAllMetaobjectDefinitions();
  console.log(`  found ${defs.length} definitions: ${defs.map(d => d.type).join(', ')}`);

  for (const def of defs) {
    const textKeys = new Set(
      def.fieldDefinitions
        .filter(fd => TEXT_FIELD_TYPES.has(fd.type?.name))
        .map(fd => fd.key)
    );
    if (textKeys.size === 0) {
      console.log(`  - ${def.type}: no text fields, skipping`);
      continue;
    }
    const nodes = await fetchAllMetaobjectsOfType(def.type);
    totals.metaobjects_scanned += nodes.length;
    console.log(`  - ${def.type}: ${nodes.length} nodes  (text fields: ${[...textKeys].join(',')})`);

    for (const node of nodes) {
      const fieldsByKey = Object.fromEntries(node.fields.map(f => [f.key, f]));
      // Build a quick "any german?" check across this node's text fields
      // before we pay for the digest lookup.
      let anyGerman = false;
      for (const k of textKeys) {
        const f = fieldsByKey[k];
        if (f && isGerman(f.value)) { anyGerman = true; break; }
      }
      if (!anyGerman) continue;
      const digests = await fetchDigests(node.id);
      await pause(80);
      for (const k of textKeys) {
        const f = fieldsByKey[k];
        if (!f) continue;
        const leak = makeLeak({
          resource_type: 'metaobject',
          resource_id: node.id,
          handle_or_id_human: `${node.type}/${node.handle}`,
          field_key: k,
          value: f.value,
          digest: digests[k],
        });
        if (leak) leaks.push(leak);
      }
    }
  }

  // -----  Products + product metafields  -----
  console.log('\n[2/5] Products');
  const products = await fetchAllProducts(PRODUCT_LIMIT);
  totals.products_scanned = products.length;
  console.log(`  scanning ${products.length} products`);
  let pIdx = 0;
  for (const p of products) {
    pIdx++;
    if (pIdx % 25 === 0) console.log(`    [${pIdx}/${products.length}]`);
    // Pre-check: any german anywhere?
    const titleG = isGerman(p.title);
    const descG = isGerman(p.descriptionHtml);
    const interestingMfs = (p.metafields?.nodes || []).filter(mf =>
      AUDIT_NAMESPACES.has(mf.namespace) &&
      TEXT_METAFIELD_TYPES.has(mf.type) &&
      isCustomerFacingMetafieldKey(mf.key) &&
      isGerman(mf.value)
    );
    if (!titleG && !descG && interestingMfs.length === 0) continue;

    const digests = await fetchDigests(p.id);
    await pause(80);

    if (titleG) {
      const l = makeLeak({
        resource_type: 'product',
        resource_id: p.id,
        handle_or_id_human: p.handle,
        field_key: 'title',
        value: p.title,
        digest: digests.title,
      });
      if (l) leaks.push(l);
    }
    if (descG) {
      const l = makeLeak({
        resource_type: 'product',
        resource_id: p.id,
        handle_or_id_human: p.handle,
        field_key: 'descriptionHtml',
        value: p.descriptionHtml,
        digest: digests.body_html || digests.descriptionHtml,
      });
      if (l) leaks.push(l);
    }
    for (const mf of interestingMfs) {
      // Metafield digests are keyed differently in translatableContent — they
      // appear as `metafield.<id>` or by full ns.key on some API versions.
      // We try a couple of variants.
      const digestKey =
        digests[`${mf.namespace}.${mf.key}`] ||
        digests[`metafield.${mf.id?.split('/')?.pop()}`] ||
        digests[mf.key] ||
        null;
      const l = makeLeak({
        resource_type: 'metafield',
        resource_id: mf.id,
        handle_or_id_human: `product/${p.handle} :: ${mf.namespace}.${mf.key}`,
        field_key: `metafield:${mf.namespace}.${mf.key}`,
        value: mf.value,
        digest: digestKey,
      });
      if (l) leaks.push(l);
    }
  }

  // -----  Collections  -----
  console.log('\n[3/5] Collections');
  const collections = await fetchAllCollections();
  totals.collections_scanned = collections.length;
  console.log(`  scanning ${collections.length} collections`);
  for (const c of collections) {
    const titleG = isGerman(c.title);
    const descG = isGerman(c.descriptionHtml);
    if (!titleG && !descG) continue;
    const digests = await fetchDigests(c.id);
    await pause(80);
    if (titleG) {
      const l = makeLeak({
        resource_type: 'collection',
        resource_id: c.id,
        handle_or_id_human: c.handle,
        field_key: 'title',
        value: c.title,
        digest: digests.title,
      });
      if (l) leaks.push(l);
    }
    if (descG) {
      const l = makeLeak({
        resource_type: 'collection',
        resource_id: c.id,
        handle_or_id_human: c.handle,
        field_key: 'descriptionHtml',
        value: c.descriptionHtml,
        digest: digests.body_html || digests.descriptionHtml,
      });
      if (l) leaks.push(l);
    }
  }

  // -----  Pages  -----
  console.log('\n[4/5] Pages');
  const pages = await fetchAllPages();
  const auditablePages = pages.filter(p => !EXCLUDED_PAGE_HANDLES.has(p.handle));
  totals.pages_scanned = auditablePages.length;
  console.log(`  total ${pages.length} pages, auditing ${auditablePages.length} (excluded ${pages.length - auditablePages.length} legal pages)`);
  for (const p of auditablePages) {
    const titleG = isGerman(p.title);
    const bodyG = isGerman(p.body);
    if (!titleG && !bodyG) continue;
    const digests = await fetchDigests(p.id);
    await pause(80);
    if (titleG) {
      const l = makeLeak({
        resource_type: 'page',
        resource_id: p.id,
        handle_or_id_human: p.handle,
        field_key: 'title',
        value: p.title,
        digest: digests.title,
      });
      if (l) leaks.push(l);
    }
    if (bodyG) {
      const l = makeLeak({
        resource_type: 'page',
        resource_id: p.id,
        handle_or_id_human: p.handle,
        field_key: 'body',
        value: p.body,
        digest: digests.body_html || digests.body,
      });
      if (l) leaks.push(l);
    }
  }

  // -----  Menus  -----
  console.log('\n[5/5] Menus (header / footer)');
  const menusData = await gql(MENUS_LIST_Q);
  for (const menu of menusData.menus.nodes) {
    const flat = flattenMenuItems(menu.items);
    totals.menu_items_scanned += flat.length;
    for (const item of flat) {
      if (!isGerman(item.title)) continue;
      // Menu items are typically not translatable via translatableResource,
      // so we don't fetch a digest. Field key uses the menu handle for context.
      const l = makeLeak({
        resource_type: 'menu_item',
        resource_id: item.id,
        handle_or_id_human: `${menu.handle} :: ${item.parentTitle ? item.parentTitle + ' › ' : ''}${item.title}`,
        field_key: 'title',
        value: item.title,
        digest: null,
      });
      if (l) leaks.push(l);
    }
  }

  totals.leaks_found = leaks.length;
  totals.leaks_by_confidence = {
    high: leaks.filter(l => l.confidence === 'high').length,
    medium: leaks.filter(l => l.confidence === 'medium').length,
    low: leaks.filter(l => l.confidence === 'low').length,
  };

  // -----  Write JSON  -----
  if (!existsSync(dirname(OUT_PATH))) mkdirSync(dirname(OUT_PATH), { recursive: true });
  const report = {
    audited_at: new Date().toISOString(),
    store: STORE,
    api_version: API_VERSION,
    totals,
    leaks,
  };
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  // -----  Markdown summary  -----
  const byType = (t) => leaks.filter((l) => l.resource_type === t);
  const moLeaks = byType('metaobject');
  const prodLeaks = byType('product');
  const mfLeaks = byType('metafield');
  const collLeaks = byType('collection');
  const pageLeaks = byType('page');
  const menuLeaks = byType('menu_item');

  // FAQ vs other metaobject breakdown
  const faqLeaks = moLeaks.filter(l => l.handle_or_id_human.startsWith('faq_item/'));
  const otherMoLeaks = moLeaks.filter(l => !l.handle_or_id_human.startsWith('faq_item/'));

  // Product field breakdown
  const titleLeaks = prodLeaks.filter(l => l.field_key === 'title');
  const descLeaks = prodLeaks.filter(l => l.field_key === 'descriptionHtml');

  // Confidence buckets
  const high = leaks.filter(l => l.confidence === 'high');
  const med = leaks.filter(l => l.confidence === 'medium');
  const low = leaks.filter(l => l.confidence === 'low');

  // Top 10 worst by length, restricted to high-confidence (these are real bugs)
  const top10 = [...high]
    .sort((a, b) => (b.current_source_value?.length || 0) - (a.current_source_value?.length || 0))
    .slice(0, 10);

  const today = new Date().toISOString().slice(0, 10);
  const md = [
    `# Source-locale-mismatch Audit — ${today}`,
    ``,
    `- Scanned: ${totals.metaobjects_scanned} metaobjects, ${totals.products_scanned} products, ${totals.collections_scanned} collections, ${totals.pages_scanned} pages, ${totals.menu_items_scanned} menu items`,
    `- Found: **${totals.leaks_found} leaks** total (high: ${high.length}, medium: ${med.length}, low/likely-false-positive: ${low.length})`,
    `  - Metaobjects: ${moLeaks.length} (FAQ: ${faqLeaks.length}, other: ${otherMoLeaks.length})`,
    `  - Products: ${prodLeaks.length} (titles: ${titleLeaks.length}, descriptions: ${descLeaks.length})`,
    `  - Product metafields: ${mfLeaks.length}`,
    `  - Collections: ${collLeaks.length}`,
    `  - Pages: ${pageLeaks.length}`,
    `  - Menu items: ${menuLeaks.length}`,
    ``,
    `- Top 10 high-confidence leaks by length:`,
    ...(top10.length === 0 ? ['  (none)'] : top10.map((l, i) => `  ${i + 1}. [${l.resource_type}] ${l.handle_or_id_human} field=${l.field_key} — "${l.value_excerpt.slice(0, 120)}${l.value_excerpt.length > 120 ? '…' : ''}"`)),
    ``,
    `Note: confidence='low' rows are umlaut-only matches in text containing English function words (likely brand names like "Schäfer", "TÜV") — review before treating as bugs.`,
    ``,
    `Full data: tmp/source-locale-mismatch-audit.json`,
  ].join('\n');

  console.log('\n' + md);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
