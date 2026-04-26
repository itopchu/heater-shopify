#!/usr/bin/env node
/**
 * translate-faq-metaobjects.mjs
 *
 * Fixes the EN-homepage FAQ leak where 5 toilet-product `faq_item`
 * metaobjects were seeded in German with no EN translation registered,
 * so they render as German text on the EN storefront.
 *
 * For every `faq_item` metaobject:
 *   1. Detect German source by scanning `question`+`answer` for ≥2 distinct
 *      German signals (umlauts/ß or German function words).
 *   2. If German AND no existing EN translation → translate `question` and
 *      `answer` via Claude (Claude Max via Claude Code CLI runtime — free)
 *      and register with `translationsRegister` (locale=en).
 *   3. If `category` is null on a known toilet-product FAQ, set it to
 *      `"toilets"` via `metaobjectUpdate` so the home FAQ section can later
 *      filter to the desired subset.
 *
 * Idempotent. Dry-run by default (`--apply` to mutate). Translations are
 * cached on disk in `.sync-cache/translations/` so repeated runs do not
 * re-translate unchanged source.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 * Scopes: read_metaobjects, write_metaobjects, read_translations,
 *         write_translations.
 *
 * Flags:
 *   --apply        actually mutate the store (default is dry-run)
 *   --store <key>  informational; we always read dev creds from env
 *   --limit N      cap the number of items processed (debugging)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');
const CACHE_DIR = resolve(REPO_ROOT, '.sync-cache', 'translations');

// ---------------------------------------------------------------------------
// Env loader (mirrors seed-widerrufsbelehrung.mjs)
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

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const storeFlagIdx = ARGV.indexOf('--store');
const STORE_FLAG = storeFlagIdx >= 0 ? ARGV[storeFlagIdx + 1] : 'dev';
const limitFlagIdx = ARGV.indexOf('--limit');
const LIMIT = limitFlagIdx >= 0 ? Number(ARGV[limitFlagIdx + 1]) : 0;

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing env vars: SHOPIFY_DEV_STORE and/or SHOPIFY_DEV_ADMIN_TOKEN');
  console.error('Add them to .env.local at the repo root.');
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

console.log(`→ translate-faq-metaobjects  store=${STORE_FLAG} (${STORE})  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
if (!APPLY) {
  console.log('  (dry-run: no mutations will be sent. Re-run with --apply to write.)');
}

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// German detection
// Require ≥2 distinct German signals so EN sentences with one borrowed word
// (e.g. "Über") don't trip the heuristic.
// ---------------------------------------------------------------------------
const UMLAUT_RE = /[äöüÄÖÜß]/;
const GERMAN_WORD_RE = /\b(und|die|der|das|ist|sind|wie|wo|für|nicht|wir|sie|werden|haben|mit|bei|durch|kann|können|lässt|passen|welche|softclose|reinigung|spülung|spülkästen|bädern|bädern)\b/gi;

function detectGermanSignals(text) {
  if (!text) return 0;
  const signals = new Set();
  if (UMLAUT_RE.test(text)) signals.add('umlaut');
  const matches = text.toLowerCase().match(GERMAN_WORD_RE) || [];
  for (const m of matches) signals.add(m.toLowerCase());
  return signals.size;
}

function isGerman(question, answer) {
  const combined = `${question || ''} ${answer || ''}`;
  return detectGermanSignals(combined) >= 2;
}

// ---------------------------------------------------------------------------
// Translation helper — mirrors agent/sync/translate.ts (cache + Claude SDK)
// ---------------------------------------------------------------------------
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}
function cacheKey(deText) {
  return createHash('sha256').update(`faq:${deText}`).digest('hex').slice(0, 16);
}
function readCache(key) {
  const p = resolve(CACHE_DIR, `${key}.txt`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}
function writeCache(key, value) {
  ensureCacheDir();
  writeFileSync(resolve(CACHE_DIR, `${key}.txt`), value);
}

async function translateViaClaude(deText, context) {
  const systemPrompt = `You are a professional DE→EN translator for an e-commerce heater/radiator/bathroom retailer's customer-facing FAQ.
Translate the German source text to idiomatic, concise, customer-facing British English.
Preserve any HTML tags, markdown, JSON structure, and technical units (mm, cm, W, °C) exactly.
Do not add explanations, prefaces, or quotation marks. Output only the translation.`;
  const userPrompt = `Context: ${context}

--- DE source ---
${deText}`;
  const stream = claudeQuery({
    prompt: userPrompt,
    options: {
      systemPrompt,
      maxTurns: 1,
      permissionMode: 'default',
      allowedTools: [],
    },
  });
  let out = '';
  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') out += block.text;
      }
    }
  }
  return out.trim();
}

async function translateText(deText, context) {
  const trimmed = (deText || '').trim();
  if (!trimmed) return '';
  const key = cacheKey(trimmed);
  const cached = readCache(key);
  if (cached != null) return cached;
  const en = await translateViaClaude(trimmed, context);
  writeCache(key, en);
  return en;
}

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------
const METAOBJECTS_LIST = `
  query($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        type
        fields { key value type }
      }
    }
  }
`;

const TRANSLATABLE_RESOURCE = `
  query($id: ID!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent { key value digest locale type }
      translations(locale: "en") { key value locale }
    }
  }
`;

const TRANSLATIONS_REGISTER = `
  mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations { key value locale }
      userErrors { field message }
    }
  }
`;

const METAOBJECT_UPDATE = `
  mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

// ---------------------------------------------------------------------------
// Pull all faq_item metaobjects (paginated)
// ---------------------------------------------------------------------------
async function fetchAllFaqItems() {
  const all = [];
  let after = null;
  for (;;) {
    const data = await gql(METAOBJECTS_LIST, { type: 'faq_item', first: 100, after });
    for (const node of data.metaobjects.nodes) {
      const fieldMap = Object.fromEntries(node.fields.map((f) => [f.key, f.value]));
      all.push({
        id: node.id,
        handle: node.handle,
        question: fieldMap.question || '',
        answer: fieldMap.answer || '',
        category: fieldMap.category ?? null,
      });
    }
    if (!data.metaobjects.pageInfo.hasNextPage) break;
    after = data.metaobjects.pageInfo.endCursor;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Toilet-FAQ recognizer (for the category=null backfill).
// Ties to the 5 known German questions surfaced in the live verification.
// ---------------------------------------------------------------------------
function looksLikeToiletFaq(item) {
  const blob = `${item.question} ${item.answer}`.toLowerCase();
  return /(wand-?wc|softclose|spülkästen|spülung|wc|bäder|toilet|bidet|unterputz)/i.test(blob);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n→ Step 1: Fetch all faq_item metaobjects');
  const items = await fetchAllFaqItems();
  console.log(`  · found ${items.length} faq_item metaobjects total`);

  const stats = {
    total: items.length,
    german: 0,
    alreadyTranslated: 0,
    translated: 0,
    failed: 0,
    categoryFixed: 0,
    categoryWouldFix: 0,
  };

  const todo = LIMIT > 0 ? items.slice(0, LIMIT) : items;
  if (LIMIT > 0) console.log(`  · --limit ${LIMIT} applied (processing first ${todo.length})`);

  console.log('\n→ Step 2: Detect German FAQs and translate missing EN');
  for (const item of todo) {
    if (!isGerman(item.question, item.answer)) continue;
    stats.german += 1;

    let resource;
    try {
      const data = await gql(TRANSLATABLE_RESOURCE, { id: item.id });
      resource = data.translatableResource;
    } catch (err) {
      console.warn(`  ! failed translatableResource for ${item.id}: ${err.message}`);
      stats.failed += 1;
      continue;
    }
    if (!resource) {
      console.warn(`  ! no translatableResource for ${item.id} — skipping`);
      stats.failed += 1;
      continue;
    }

    const enExisting = new Map((resource.translations || []).map((t) => [t.key, t.value]));
    const sourceByKey = new Map(resource.translatableContent.map((c) => [c.key, c]));

    const needs = [];
    for (const key of ['question', 'answer']) {
      const src = sourceByKey.get(key);
      if (!src || !src.value) continue;
      const enVal = enExisting.get(key);
      if (enVal && enVal.trim()) continue;
      needs.push({ key, source: src });
    }

    if (needs.length === 0) {
      stats.alreadyTranslated += 1;
      continue;
    }

    const translations = [];
    let labelPrinted = false;
    for (const n of needs) {
      const ctx = `FAQ ${n.key} (handle: ${item.handle})`;
      let en;
      try {
        en = await translateText(n.source.value, ctx);
      } catch (err) {
        console.warn(`  ! translate failed for ${item.handle}.${n.key}: ${err.message}`);
        stats.failed += 1;
        continue;
      }
      if (!en) continue;
      if (!labelPrinted) {
        const preview = item.question.slice(0, 70);
        console.log(`  • ${item.handle}  "${preview}${item.question.length > 70 ? '…' : ''}"`);
        labelPrinted = true;
      }
      console.log(`      ${n.key}: → ${en.slice(0, 80)}${en.length > 80 ? '…' : ''}`);
      translations.push({
        locale: 'en',
        key: n.key,
        value: en,
        translatableContentDigest: n.source.digest,
      });
    }

    if (translations.length === 0) continue;

    if (!APPLY) {
      console.log(`      · would register ${translations.length} EN translation(s)`);
      stats.translated += 1;
      continue;
    }

    try {
      const res = await gql(TRANSLATIONS_REGISTER, {
        resourceId: item.id,
        translations,
      });
      const errs = res.translationsRegister.userErrors;
      if (errs.length) throw new Error(JSON.stringify(errs));
      console.log(`      ✓ registered ${res.translationsRegister.translations.length} EN translation(s)`);
      stats.translated += 1;
    } catch (err) {
      console.warn(`  ! translationsRegister failed for ${item.handle}: ${err.message}`);
      stats.failed += 1;
    }
  }

  console.log('\n→ Step 3: Backfill category="toilets" on toilet FAQs missing category');
  for (const item of todo) {
    if (item.category && item.category.trim()) continue;
    if (!looksLikeToiletFaq(item)) continue;

    if (!APPLY) {
      console.log(`  · would set category="toilets" on ${item.handle} (${item.id})`);
      stats.categoryWouldFix += 1;
      continue;
    }
    try {
      const res = await gql(METAOBJECT_UPDATE, {
        id: item.id,
        metaobject: { fields: [{ key: 'category', value: 'toilets' }] },
      });
      const errs = res.metaobjectUpdate.userErrors;
      if (errs.length) throw new Error(JSON.stringify(errs));
      console.log(`  ✓ category=toilets set on ${item.handle}`);
      stats.categoryFixed += 1;
    } catch (err) {
      console.warn(`  ! metaobjectUpdate failed for ${item.handle}: ${err.message}`);
      stats.failed += 1;
    }
  }

  console.log('\n────────────────────────────────────────────────────────────');
  console.log('SUMMARY');
  console.log(`  total faq_item metaobjects        : ${stats.total}`);
  console.log(`  detected as German                : ${stats.german}`);
  console.log(`  already had EN translations       : ${stats.alreadyTranslated}`);
  console.log(`  newly translated (this run)       : ${stats.translated}`);
  console.log(`  category="toilets" applied        : ${stats.categoryFixed}`);
  console.log(`  category="toilets" would-apply    : ${stats.categoryWouldFix}`);
  console.log(`  failed                            : ${stats.failed}`);
  console.log('────────────────────────────────────────────────────────────');

  if (!APPLY) {
    console.log('\n(dry-run only — re-run with --apply to perform the writes.)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
