#!/usr/bin/env node
// Generate per-product `content.sections_nl` + `content.sections_fr`
// metafields by translating the `content.sections_en` JSON via Gemini.
//
// Why: NL/FR PDP visitors currently fall back to English `sections_en` because
// `sections_nl` / `sections_fr` don't exist on any of the 57 products. This
// script populates both locales by walking each section's `title` / `text` /
// `html` (and any `data` row's `label` / `value`) through Gemini and writing
// the resulting JSON via metafieldsSet.
//
// Pipeline per product:
//   1. Read content.sections_en (JSON array of section objects).
//   2. For each locale (nl, fr): clone the array; translate translatable
//      string fields; preserve everything else (icons, ids, source, etc).
//   3. Write back via metafieldsSet — namespace=content, key=sections_<locale>,
//      type=json. Idempotent (re-runs replace).
//
// Cache: dedicated .translation-cache/sections.json so we don't race with the
// other concurrent translation script using .translation-cache/prod.json.
//
// Usage:
//   node agent/scripts/generate-section-translations.mjs                    # dry-run all
//   node agent/scripts/generate-section-translations.mjs --apply            # all products
//   node agent/scripts/generate-section-translations.mjs --handle X --apply # one product
//   node agent/scripts/generate-section-translations.mjs --limit 5 --apply  # first 5
//
// Cap: GEMINI_CAP env (default 2000) — hard ceiling on Gemini calls per run.

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
const argVal = (flag) => {
  const i = process.argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
};
const LIMIT = (() => {
  const v = argVal('--limit');
  return v ? parseInt(v, 10) || Infinity : Infinity;
})();
const HANDLE = argVal('--handle');
const GEMINI_CAP = parseInt(process.env.GEMINI_CAP || '2000', 10);

// Locales we must populate. EN is the source; DE already exists on every
// product as content.sections_de and is left untouched.
const TARGET_LOCALES = [
  { code: 'nl', name: 'Dutch' },
  { code: 'fr', name: 'French' },
];

// ---------------------------------------------------------------------------
// cache (dedicated file to avoid race with prod-translate-content.mjs)
// ---------------------------------------------------------------------------
const CACHE_DIR = resolve(ROOT, '.translation-cache');
const CACHE_PATH = resolve(CACHE_DIR, 'sections.json');
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
  if (!text || typeof text !== 'string' || !text.trim()) return text;
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

async function setMetafield(ownerId, key, jsonValue) {
  const d = await gql(
    `mutation($m:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$m){
        metafields{ id namespace key }
        userErrors{ field message }
      }
    }`,
    {
      m: [
        {
          ownerId,
          namespace: 'content',
          key,
          type: 'json',
          value: jsonValue,
        },
      ],
    },
  );
  const errs = d.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`metafieldsSet ${key}: ${JSON.stringify(errs)}`);
}

// Ensure the metafield definition exists for sections_nl / sections_fr so the
// values are surfaced in Admin and Storefront APIs the same way sections_de is.
async function ensureDefinition(key, name) {
  const d = await gql(
    `query($ns:String!,$k:String!){
      metafieldDefinitions(first:1, ownerType:PRODUCT, namespace:$ns, key:$k){
        nodes{ id key }
      }
    }`,
    { ns: 'content', k: key },
  );
  if (d.metafieldDefinitions.nodes.length) return;
  if (!APPLY) {
    console.log(`  [dry-run] would create metafield definition content.${key}`);
    return;
  }
  const r = await gql(
    `mutation($d:MetafieldDefinitionInput!){
      metafieldDefinitionCreate(definition:$d){
        createdDefinition{ id key }
        userErrors{ field message code }
      }
    }`,
    {
      d: {
        name,
        namespace: 'content',
        key,
        type: 'json',
        ownerType: 'PRODUCT',
        access: { storefront: 'PUBLIC_READ' },
      },
    },
  );
  const errs = r.metafieldDefinitionCreate.userErrors;
  if (errs.length) {
    // TAKEN means a parallel run created it — that's fine.
    if (!errs.every((e) => e.code === 'TAKEN')) {
      throw new Error(`metafieldDefinitionCreate ${key}: ${JSON.stringify(errs)}`);
    }
  } else {
    console.log(`  created metafield definition content.${key}`);
  }
}

// ---------------------------------------------------------------------------
// translate one section JSON array
// ---------------------------------------------------------------------------
const TRANSLATABLE_FIELDS = ['title', 'text', 'html'];

async function translateSections(sections, fromLang, toLang) {
  const out = [];
  for (const section of sections) {
    const next = { ...section };
    for (const f of TRANSLATABLE_FIELDS) {
      if (typeof next[f] === 'string' && next[f].trim()) {
        next[f] = await geminiTranslate(next[f], fromLang, toLang);
      }
    }
    if (Array.isArray(next.data) && next.data.length) {
      const newData = [];
      for (const row of next.data) {
        const r = { ...row };
        if (typeof r.label === 'string' && r.label.trim()) {
          r.label = await geminiTranslate(r.label, fromLang, toLang);
        }
        if (typeof r.value === 'string' && r.value.trim()) {
          r.value = await geminiTranslate(r.value, fromLang, toLang);
        }
        newData.push(r);
      }
      next.data = newData;
    }
    out.push(next);
  }
  return out;
}

// ---------------------------------------------------------------------------
// list products
// ---------------------------------------------------------------------------
async function* listProducts() {
  if (HANDLE) {
    const d = await gql(
      `query($h:String!){
        productByHandle(handle:$h){
          id handle title
          m_en: metafield(namespace:"content", key:"sections_en"){ value }
          m_nl: metafield(namespace:"content", key:"sections_nl"){ value }
          m_fr: metafield(namespace:"content", key:"sections_fr"){ value }
        }
      }`,
      { h: HANDLE },
    );
    if (d.productByHandle) yield d.productByHandle;
    return;
  }
  let cursor = null;
  let n = 0;
  while (true) {
    const d = await gql(
      `query($c:String){
        products(first:50, after:$c){
          pageInfo{ hasNextPage endCursor }
          nodes{
            id handle title
            m_en: metafield(namespace:"content", key:"sections_en"){ value }
            m_nl: metafield(namespace:"content", key:"sections_nl"){ value }
            m_fr: metafield(namespace:"content", key:"sections_fr"){ value }
          }
        }
      }`,
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
console.log(`→ ${STORE}`);
console.log(`  scope: ${HANDLE ? `handle=${HANDLE}` : `all (limit=${LIMIT === Infinity ? 'none' : LIMIT})`}`);
console.log(`  mode:  ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  Gemini cap: ${GEMINI_CAP} calls`);
console.log(`  Cache: ${CACHE_PATH} (${Object.keys(cache).length} entries)`);

console.log(`\n--- Ensuring metafield definitions ---`);
await ensureDefinition('sections_nl', 'Sections (Dutch)');
await ensureDefinition('sections_fr', 'Sections (French)');

console.log(`\n--- Products ---`);
let totalProducts = 0;
let totalWritten = 0;
let totalSkipped = 0;
const errors = [];

for await (const p of listProducts()) {
  totalProducts++;
  const label = `[${totalProducts}] ${p.handle}`;
  if (!p.m_en?.value) {
    console.log(`  ${label}  ⨯ no sections_en — skip`);
    totalSkipped++;
    continue;
  }
  let sourceArr;
  try {
    sourceArr = JSON.parse(p.m_en.value);
  } catch (e) {
    console.log(`  ${label}  ⨯ sections_en is not valid JSON — skip`);
    totalSkipped++;
    continue;
  }
  if (!Array.isArray(sourceArr) || !sourceArr.length) {
    console.log(`  ${label}  ⨯ sections_en empty — skip`);
    totalSkipped++;
    continue;
  }

  process.stdout.write(`  ${label}  (${sourceArr.length} sections) ... `);
  try {
    for (const { code, name } of TARGET_LOCALES) {
      // Idempotent: replace existing values on each run.
      const translated = await translateSections(sourceArr, 'English', name);
      const value = JSON.stringify(translated);
      if (APPLY) await setMetafield(p.id, `sections_${code}`, value);
    }
    totalWritten++;
    console.log(`✓ nl+fr written  (geminiCalls=${geminiCalls})`);
  } catch (e) {
    console.log(`✗ ${e.message.slice(0, 120)}`);
    errors.push({ handle: p.handle, message: e.message });
    if (e.message.includes('GEMINI_CAP')) break;
  }
  if (totalProducts % 5 === 0) flushCache();
}

flushCache();
console.log(`\n=== Summary ===`);
console.log(`Products processed:  ${totalProducts}`);
console.log(`Products written:    ${totalWritten}`);
console.log(`Products skipped:    ${totalSkipped}`);
console.log(`Errors:              ${errors.length}`);
console.log(`Gemini calls used:   ${geminiCalls} / ${GEMINI_CAP}`);
console.log(`Cache size after:    ${Object.keys(cache).length}`);
if (errors.length) {
  console.log(`\nError details:`);
  for (const e of errors.slice(0, 20)) console.log(`  - ${e.handle}: ${e.message.slice(0, 200)}`);
}
