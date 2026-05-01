#!/usr/bin/env node
/**
 * Promote German values in product metafields (custom.short_description,
 * custom.subtitle) to English. The catalog import left these fields in
 * the source language and the EN→7-locale translation pipeline only ran
 * over the title/body_html/handle/product_type set.
 *
 * For each affected metafield:
 *   1. Detect German source (umlauts, ß, common heating terms).
 *   2. Translate to English via Gemini (with retry + 2.0-flash fallback).
 *   3. Overwrite the metafield value via metafieldsSet.
 *
 * Usage:
 *   node agent/scripts/prod-promote-metafields-en.mjs            # dry-run
 *   node agent/scripts/prod-promote-metafields-en.mjs --apply
 */
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
if (!STORE || !TOKEN || !GEMINI_KEY) throw new Error('Missing env vars');
const APPLY = process.argv.includes('--apply');

const TARGET_KEYS = [
  { namespace: 'custom', key: 'short_description' },
  { namespace: 'custom', key: 'subtitle' },
];

const GERMAN_HINT = /[äöüÄÖÜß]|Heizkörper|Wohnraum|Badheizk|elektrisch|Anschluss|Vorteile|Eigenschaften|Lieferumfang|erstklassig|Verarbeitung|Widerstandsfähig|Beständig|Beschichtung|Trocknung|Raumbeheizung|Was zeichnet|Wir übernehmen/i;
const looksGerman = (s) => typeof s === 'string' && GERMAN_HINT.test(s);

const CACHE_DIR = resolve(ROOT, '.translation-cache');
const CACHE_PATH = resolve(CACHE_DIR, 'prod.json');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
const cacheKey = (text, locale) =>
  createHash('sha256').update(`${locale}::${text}`).digest('hex').slice(0, 24);
function flushCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function gemini(text, fromLang, toLang) {
  if (!text || !text.trim()) return '';
  const k = cacheKey(text, `${fromLang}->${toLang}`);
  if (cache[k]) return cache[k];
  const isHtml = /<[a-z][^>]*>/i.test(text);
  const prompt = isHtml
    ? `Translate the following HTML from ${fromLang} to ${toLang}. Preserve every HTML tag, attribute, and entity exactly. Translate only visible text nodes. Return only the translated HTML.\n\n---\n${text}`
    : `Translate the following ${fromLang} text to ${toLang}. Preserve any unicode bullets (✔, ✓, •) and line breaks exactly. Return only the translated text.\n\n---\n${text}`;
  const MODELS = ['gemini-2.5-flash','gemini-2.5-flash','gemini-2.0-flash','gemini-2.0-flash'];
  let r, j, lastErr;
  for (let i=0; i<MODELS.length; i++) {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[i]}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      }
    );
    j = await r.json();
    if (r.ok && j.candidates?.[0]?.content?.parts?.[0]?.text) break;
    lastErr = `${MODELS[i]} ${r.status}: ${JSON.stringify(j).slice(0,160)}`;
    if (i < MODELS.length - 1) await new Promise(res => setTimeout(res, 2000 * (i+1)));
  }
  if (!r.ok || !j.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(lastErr ?? 'gemini failed');
  }
  const out = j.candidates[0].content.parts[0].text.trim();
  cache[k] = out;
  return out;
}

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

async function listProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const d = await gql(`query($c:String){
      products(first:50, after:$c){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id handle
          short: metafield(namespace:"custom", key:"short_description"){ id value type }
          subtitle: metafield(namespace:"custom", key:"subtitle"){ id value type }
        }
      }
    }`, { c: cursor });
    out.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

async function setMetafield(productId, namespace, key, type, value) {
  const d = await gql(`mutation($m:[MetafieldsSetInput!]!){
    metafieldsSet(metafields:$m){ userErrors{ field message } }
  }`, {
    m: [{ ownerId: productId, namespace, key, type, value }],
  });
  const errs = d.metafieldsSet.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
const products = await listProducts();
let touched = 0, calls = 0;
for (const p of products) {
  for (const field of [
    { meta: p.short, key: 'short_description' },
    { meta: p.subtitle, key: 'subtitle' },
  ]) {
    if (!field.meta?.value || !looksGerman(field.meta.value)) continue;
    process.stdout.write(`  ${p.handle}/${field.key}: `);
    try {
      let en = await gemini(field.meta.value, 'German', 'English');
      if (!en || en === field.meta.value) {
        console.log('no change');
        continue;
      }
      // single_line_text_field cannot contain a newline. Collapse to a
      // single space so Gemini's line-broken output writes cleanly.
      if (field.meta.type === 'single_line_text_field') {
        en = en.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      }
      calls++;
      console.log(`${field.meta.value.length}→${en.length} chars`);
      if (APPLY) {
        await setMetafield(p.id, 'custom', field.key, field.meta.type, en);
      }
      touched++;
      if (calls % 10 === 0) flushCache();
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 100)}`);
    }
  }
}
flushCache();
console.log(`\n=== Summary ===`);
console.log(`fields ${APPLY ? 'rewritten' : 'would rewrite'}: ${touched}`);
console.log(`gemini calls: ${calls}`);
