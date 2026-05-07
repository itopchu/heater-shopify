#!/usr/bin/env node
// Translate product / collection / page / policy content on the prod
// Shopify store across all 7 secondary locales (de, nl, fr, es, it, pl, da).
//
// Pipeline per resource:
//   1. Fetch translatableResource — gives source values + digests.
//   2. If a value is in German (most products are imported from xxl), first
//      translate German→English and overwrite the source field via
//      productUpdate / collectionUpdate / etc. This makes EN the canonical
//      source language (matching shop.primaryLocale=en).
//   3. Re-fetch translatableResource (digests change after step 2).
//   4. For each of the 7 secondary locales, translate EN→locale and register
//      via translationsRegister. The original German is registered as the
//      `de` translation alongside.
//
// Caching: every (source_text, locale) pair is cached at
// .translation-cache/prod.json so re-runs are idempotent and don't burn
// Gemini quota on already-translated strings.
//
// Usage:
//   node agent/scripts/prod-translate-content.mjs --scope=products --limit=1 --apply
//   node agent/scripts/prod-translate-content.mjs --scope=products --apply
//   node agent/scripts/prod-translate-content.mjs --scope=all --apply
//
// Cap: GEMINI_CAP env var (default 2000) — hard stop on Gemini calls per
// run as a safety. Re-run with same --scope to continue.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const GEMINI_KEY = process.env.GOOGLE_API_KEY;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
if (!GEMINI_KEY) throw new Error('Missing GOOGLE_API_KEY');

const APPLY = process.argv.includes('--apply');
const SCOPE = (() => {
  const i = process.argv.findIndex(a => a.startsWith('--scope'));
  if (i < 0) return 'products';
  const a = process.argv[i];
  return a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
})();
const LIMIT = (() => {
  const i = process.argv.findIndex(a => a.startsWith('--limit'));
  if (i < 0) return Infinity;
  const a = process.argv[i];
  const v = a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  return parseInt(v, 10) || Infinity;
})();
const GEMINI_CAP = parseInt(process.env.GEMINI_CAP || '2000', 10);

// Storefront supports en (primary) + de/nl/fr (2026-05 policy). Older
// locales (es, it, pl, da) were retired with the DE/NL/BE/LU market
// reduction; no need to spend Gemini quota translating into them.
const TARGET_LOCALES = ['de', 'nl', 'fr'];

// ---------------------------------------------------------------------------
// cache
// ---------------------------------------------------------------------------
const CACHE_DIR = resolve(ROOT, '.translation-cache');
const CACHE_PATH = resolve(CACHE_DIR, 'prod.json');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
const cacheKey = (text, locale) =>
  createHash('sha256').update(`${locale}::${text}`).digest('hex').slice(0, 24);
function flushCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ---------------------------------------------------------------------------
// gemini
// ---------------------------------------------------------------------------
let geminiCalls = 0;
async function geminiTranslate(text, fromLang, toLang) {
  if (!text || !text.trim()) return '';
  const k = cacheKey(text, `${fromLang}->${toLang}`);
  if (cache[k]) return cache[k];

  if (geminiCalls >= GEMINI_CAP) {
    throw new Error(`Hit GEMINI_CAP=${GEMINI_CAP}, stopping for safety`);
  }
  geminiCalls++;

  const isHtml = /<[a-z][^>]*>/i.test(text);
  const prompt = isHtml
    ? `Translate the following HTML from ${fromLang} to ${toLang}. Preserve every HTML tag, attribute, and entity exactly. Translate only visible text nodes. Do not wrap the response in code fences or commentary. Return only the translated HTML.\n\n---\n${text}`
    : `Translate the following ${fromLang} text to ${toLang}. Preserve any placeholders like {count} unchanged. Do not wrap the response in quotes or commentary. Return only the translated text.\n\n---\n${text}`;

  // 503 (overloaded) is common on gemini-2.5-flash; retry with exponential
  // backoff up to 5 attempts, then fall through to gemini-1.5-flash on the
  // final attempt as a fallback model.
  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash'];
  let r, j, lastErr;
  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const model = MODELS[attempt];
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      },
    );
    j = await r.json();
    if (r.ok && j.candidates?.[0]?.content?.parts?.[0]?.text) break;
    lastErr = `Gemini ${model} ${r.status}: ${JSON.stringify(j).slice(0, 160)}`;
    if (attempt < MODELS.length - 1) {
      const wait = Math.min(30_000, 2_000 * 2 ** attempt);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  if (!r.ok || !j.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(lastErr ?? 'Gemini call failed without a usable response.');
  }
  const out = j.candidates[0].content.parts[0].text.trim();
  cache[k] = out;
  // Flush every 20 calls so we don't lose work on a crash.
  if (geminiCalls % 20 === 0) flushCache();
  return out;
}

// ---------------------------------------------------------------------------
// shopify
// ---------------------------------------------------------------------------
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

async function fetchTranslatable(resourceId) {
  const d = await gql(
    `query($id:ID!){
      translatableResource(resourceId:$id){
        resourceId
        translatableContent{ key value digest locale type }
      }
    }`,
    { id: resourceId },
  );
  return d.translatableResource;
}

async function registerTranslations(resourceId, translations) {
  if (!translations.length) return;
  const r = await gql(
    `mutation($id:ID!, $t:[TranslationInput!]!){
      translationsRegister(resourceId:$id, translations:$t){
        userErrors{ field message }
      }
    }`,
    { id: resourceId, t: translations },
  );
  const errs = r.translationsRegister.userErrors;
  if (errs.length) throw new Error(`translationsRegister: ${JSON.stringify(errs)}`);
}

const GERMAN_HINT = /[äöüÄÖÜß]|Heizkörper|Heizkörper|Wohnraum|Badheizk|elektrisch|Anschluss/i;
const looksGerman = (s) => typeof s === 'string' && GERMAN_HINT.test(s);

// ---------------------------------------------------------------------------
// per-resource pipeline
// ---------------------------------------------------------------------------

/**
 * For a Product / Collection / Page that has its source text in German,
 * translate to English and update via the appropriate update mutation,
 * then re-fetch the translatable resource. Returns the post-update
 * translatable resource.
 */
async function maybePromoteToEnglish(kind, id, tr) {
  // Promote only specific keys per resource type.
  const PROMOTE_KEYS = {
    PRODUCT: ['title', 'body_html'],
    COLLECTION: ['title', 'body_html'],
    PAGE: ['title', 'body_html'],
    SHOP_POLICY: ['body'],
    // Metaobject field keys vary by definition. Promote anything that
    // looks like user-visible long-form text. Keys we DON'T translate
    // (image refs, slugs, taxonomies) are filtered out per-resource via
    // the SKIP list further down. The "question" and "answer" entries
    // cover faq_item; "title" / "body" / "intro" / "summary" / "label"
    // are common metaobject text fields across the rest of the schema.
    METAOBJECT: [
      'question',
      'answer',
      'title',
      'body',
      'intro',
      'summary',
      'label',
      'heading',
      'subheading',
      'description',
      'text',
    ],
  };
  const keys = PROMOTE_KEYS[kind] || [];
  const updates = {};

  for (const c of tr.translatableContent) {
    if (!keys.includes(c.key)) continue;
    if (!looksGerman(c.value)) continue;
    const en = await geminiTranslate(c.value, 'German', 'English');
    if (!en || en === c.value) continue;
    updates[c.key] = { de: c.value, en };
  }

  if (!Object.keys(updates).length) return tr;

  // Apply update via the right mutation.
  if (APPLY) {
    if (kind === 'PRODUCT') {
      const inp = { id };
      if (updates.title) inp.title = updates.title.en;
      if (updates.body_html) inp.descriptionHtml = updates.body_html.en;
      await gql(
        `mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ userErrors{message} } }`,
        { p: inp },
      );
    } else if (kind === 'COLLECTION') {
      const inp = { id };
      if (updates.title) inp.title = updates.title.en;
      if (updates.body_html) inp.descriptionHtml = updates.body_html.en;
      await gql(
        `mutation($p:CollectionInput!){ collectionUpdate(input:$p){ userErrors{message} } }`,
        { p: inp },
      );
    } else if (kind === 'PAGE') {
      // PageUpdateInput does not accept an `id` field in 2026-04 (id is a
      // separate top-level mutation argument). Build the input without it.
      const inp = {};
      if (updates.title) inp.title = updates.title.en;
      if (updates.body_html) inp.body = updates.body_html.en;
      if (Object.keys(inp).length === 0) {
        // Nothing to promote.
      } else {
        await gql(
          `mutation($p:PageUpdateInput!, $id:ID!){ pageUpdate(id:$id, page:$p){ userErrors{message} } }`,
          { p: inp, id },
        );
      }
    } else if (kind === 'SHOP_POLICY') {
      // Shop policies use a different mutation; need policy type.
      // Skip auto-promotion for policies — they were authored in EN already
      // by prod-fill-shop-policies.mjs.
    } else if (kind === 'METAOBJECT') {
      // Each promoted field becomes a fields[] entry on metaobjectUpdate.
      // Order doesn't matter; missing fields are left untouched.
      const fields = [];
      for (const [k, vs] of Object.entries(updates)) {
        fields.push({ key: k, value: vs.en });
      }
      if (fields.length > 0) {
        await gql(
          `mutation($id:ID!, $m:MetaobjectUpdateInput!){
            metaobjectUpdate(id:$id, metaobject:$m){ userErrors{ message field } }
          }`,
          { id, m: { fields } },
        );
      }
    }
  }

  // Re-fetch so digests are current.
  const fresh = await fetchTranslatable(id);
  // Stash the original German so we can register it as the `de` translation.
  for (const c of fresh.translatableContent) {
    if (updates[c.key]) {
      c._registerDe = updates[c.key].de;
    }
  }
  return fresh;
}

async function translateResource(kind, resourceId) {
  const tr0 = await fetchTranslatable(resourceId);
  if (!tr0) return { ok: 0, skipped: 1 };

  // Step 1+2: promote German to English.
  const tr = await maybePromoteToEnglish(kind, resourceId, tr0);

  // Step 3: register translations for each target locale.
  let ok = 0;
  for (const locale of TARGET_LOCALES) {
    const translations = [];
    for (const c of tr.translatableContent) {
      if (!c.value || typeof c.value !== 'string' || !c.value.trim()) continue;
      // Only translate user-visible fields. Skip handles/SKUs/raw_source/etc.
      const skip = ['handle', 'sku', 'raw_source', 'meta_image'];
      if (skip.some(s => c.key.includes(s))) continue;

      let value;
      if (locale === 'de' && c._registerDe) {
        // We already have the German source pre-promotion. No Gemini call.
        value = c._registerDe;
      } else {
        value = await geminiTranslate(c.value, 'English', locale);
      }
      if (!value) continue;

      translations.push({
        locale,
        key: c.key,
        value,
        translatableContentDigest: c.digest,
      });
    }
    if (translations.length) {
      if (APPLY) await registerTranslations(resourceId, translations);
      ok += translations.length;
    }
  }
  return { ok, skipped: 0 };
}

// ---------------------------------------------------------------------------
// scopes
// ---------------------------------------------------------------------------
async function* listProducts() {
  let cursor = null;
  let n = 0;
  while (true) {
    const d = await gql(
      `query($c:String){ products(first:50, after:$c){ pageInfo{hasNextPage endCursor} nodes{ id handle title } } }`,
      { c: cursor },
    );
    for (const p of d.products.nodes) {
      yield p;
      if (++n >= LIMIT) return;
    }
    if (!d.products.pageInfo.hasNextPage) return;
    cursor = d.products.pageInfo.endCursor;
  }
}

async function* listCollections() {
  const d = await gql(`{ collections(first:50){ nodes{ id handle title } } }`);
  let n = 0;
  for (const c of d.collections.nodes) {
    yield c;
    if (++n >= LIMIT) return;
  }
}

async function* listPages() {
  const d = await gql(`{ pages(first:50){ nodes{ id handle title } } }`);
  let n = 0;
  for (const p of d.pages.nodes) {
    yield p;
    if (++n >= LIMIT) return;
  }
}

// Metaobjects need a definition type filter — the API requires a `type:`
// argument. We grab every type the store has defined and walk each one,
// translating user-visible text fields. Use --metaobject-type=foo to
// scope to a single type during testing.
async function* listMetaobjects() {
  const typeFilter = (() => {
    const i = process.argv.findIndex(a => a.startsWith('--metaobject-type'));
    if (i < 0) return null;
    const a = process.argv[i];
    return a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  })();

  const defs = await gql(
    `{ metaobjectDefinitions(first:50){ nodes{ type } } }`,
  );
  const types = defs.metaobjectDefinitions.nodes
    .map(n => n.type)
    .filter(t => !typeFilter || t === typeFilter);

  let n = 0;
  for (const type of types) {
    let cursor = null;
    while (true) {
      const d = await gql(
        `query($t:String!, $c:String){
          metaobjects(type:$t, first:50, after:$c){
            pageInfo{ hasNextPage endCursor }
            nodes{ id handle type }
          }
        }`,
        { t: type, c: cursor },
      );
      for (const m of d.metaobjects.nodes) {
        yield { ...m, handle: m.handle ?? `${m.type}/${m.id.split('/').pop()}` };
        if (++n >= LIMIT) return;
      }
      if (!d.metaobjects.pageInfo.hasNextPage) break;
      cursor = d.metaobjects.pageInfo.endCursor;
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
console.log(`→ ${STORE}  scope=${SCOPE}  limit=${LIMIT}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  Gemini cap: ${GEMINI_CAP} calls`);
console.log(`  Cache: ${CACHE_PATH} (${Object.keys(cache).length} entries)`);

let totalOk = 0;

async function runScope(label, gen, kind) {
  console.log(`\n--- ${label} ---`);
  let count = 0;
  for await (const r of gen) {
    count++;
    process.stdout.write(`  [${count}] ${r.handle ?? r.id}  ... `);
    try {
      const { ok, skipped } = await translateResource(kind, r.id);
      console.log(`✓ ${ok} translations  (geminiCalls=${geminiCalls})`);
      totalOk += ok;
    } catch (e) {
      console.log(`✗ ${e.message.slice(0, 100)}`);
    }
    if (count % 5 === 0) flushCache();
  }
}

if (SCOPE === 'products' || SCOPE === 'all') {
  await runScope('PRODUCTS', listProducts(), 'PRODUCT');
}
if (SCOPE === 'collections' || SCOPE === 'all') {
  await runScope('COLLECTIONS', listCollections(), 'COLLECTION');
}
if (SCOPE === 'pages' || SCOPE === 'all') {
  await runScope('PAGES', listPages(), 'PAGE');
}
if (SCOPE === 'metaobjects' || SCOPE === 'all') {
  await runScope('METAOBJECTS', listMetaobjects(), 'METAOBJECT');
}

flushCache();
console.log(`\n=== Summary ===`);
console.log(`Total translations registered: ${totalOk}`);
console.log(`Gemini calls used:             ${geminiCalls} / ${GEMINI_CAP}`);
console.log(`Cache size after run:          ${Object.keys(cache).length}`);
