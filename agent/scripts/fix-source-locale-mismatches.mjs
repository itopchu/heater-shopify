#!/usr/bin/env node
/**
 * fix-source-locale-mismatches.mjs
 *
 * Remediates the i18n leaks recorded in tmp/source-locale-mismatch-audit.json.
 *
 * Strategy (the prior failed attempt's lesson):
 *   The shop's primary locale is `en`. translationsRegister rejects
 *   `locale: "en"` ("Locale cannot be the same as the shop's primary locale").
 *   So we cannot keep a German source and "translate" it to English by
 *   registering an EN translation.
 *
 *   We must:
 *     1. Register the original German content as the `de` translation
 *        BEFORE we touch the source (so we can use the current digest).
 *     2. Rewrite the source to English with the appropriate update mutation
 *        (metaobjectUpdate / productOptionUpdate / productOptionUpdate
 *        for option values via PATCH or `productSet` if needed).
 *
 *   This way Shopify's native locale resolution shows EN by default and the
 *   /de storefront keeps showing the German via the registered translation.
 *
 * Phases handled here:
 *   Phase 1 — Metaobject leaks
 *     a. Detect FAQ duplicates (`*-faq-N` and `*-gberg-faq-N` pairs) and
 *        delete the older `*-faq-N` set (keep the gberg-prefixed handle).
 *     b. For each surviving German metaobject (faq_item, spec_section), for
 *        every German text field: register the German as `de` translation,
 *        then rewrite the source field to English. Translation goes through
 *        the Claude Agent SDK with disk cache (free under Claude Max).
 *     c. Skip `trust_badge/tb-tuev` — "TÜV certified" is intentional EN with
 *        a German trademark, not a leak.
 *
 *   Phase 2 — Product variant option names + values
 *     For every product, enumerate options. For each option whose `name` or
 *     any `values[]` looks German, register DE translation on PRODUCT_OPTION
 *     and PRODUCT_OPTION_VALUE first, then rewrite source to English via
 *     productOptionUpdate.
 *
 * Audit log: every change is appended to data/i18n-fix-log.jsonl with
 * resource_id, field, before, after, timestamp.
 *
 * Usage:
 *   node agent/scripts/fix-source-locale-mismatches.mjs                 # dry-run
 *   node agent/scripts/fix-source-locale-mismatches.mjs --apply         # mutate
 *   node agent/scripts/fix-source-locale-mismatches.mjs --apply --phase 1
 *   node agent/scripts/fix-source-locale-mismatches.mjs --apply --phase 2
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');
const AUDIT_PATH = resolve(REPO_ROOT, 'tmp', 'source-locale-mismatch-audit.json');
const CACHE_DIR = resolve(REPO_ROOT, '.sync-cache', 'translations');
const LOG_PATH = resolve(REPO_ROOT, 'data', 'i18n-fix-log.jsonl');

function loadEnvLocal(p) {
  let raw;
  try { raw = readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
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

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const phaseIdx = ARGV.indexOf('--phase');
const PHASE = phaseIdx >= 0 ? Number(ARGV[phaseIdx + 1]) : 0;     // 0 = both
const limitIdx = ARGV.indexOf('--limit-products');
const PRODUCT_LIMIT = limitIdx >= 0 ? Number(ARGV[limitIdx + 1]) : 0;

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing SHOPIFY_DEV_STORE / SHOPIFY_DEV_ADMIN_TOKEN');
  process.exit(1);
}
if (!STORE.endsWith('-dev.myshopify.com') && !STORE.endsWith('heater-dev.myshopify.com')) {
  console.error(`Refusing to run on non-dev store ${STORE}. Add an explicit override if you really mean this.`);
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

console.log(`→ fix-source-locale-mismatches  store=${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}  phase=${PHASE || 'all'}`);
if (!APPLY) console.log('  (dry-run: no mutations sent. Re-run with --apply.)');

// ---------------------------------------------------------------------------
// GraphQL + helpers
// ---------------------------------------------------------------------------
async function gql(q, variables = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query: q, variables }),
    });
    const json = await res.json();
    if (res.status === 429 || (json.errors && /throttled/i.test(JSON.stringify(json.errors)))) {
      const wait = 1500 * (attempt + 1);
      console.warn(`  throttled, sleeping ${wait}ms`);
      await pause(wait);
      continue;
    }
    if (!res.ok || json.errors) {
      throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 800)}`);
    }
    return json.data;
  }
  throw new Error('Throttled too many times');
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDirs() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(dirname(LOG_PATH))) mkdirSync(dirname(LOG_PATH), { recursive: true });
}
ensureDirs();

function logChange(entry) {
  appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), apply: APPLY, ...entry }) + '\n');
}

// ---------------------------------------------------------------------------
// Translation (cached). Free under Claude Max via the SDK.
// ---------------------------------------------------------------------------
const translationStats = { cacheHits: 0, newCalls: 0, manual: 0 };

function cacheKey(prefix, deText) {
  return createHash('sha256').update(`${prefix}:${deText}`).digest('hex').slice(0, 16);
}
function readCache(key) {
  const p = resolve(CACHE_DIR, `${key}.txt`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}
function writeCache(key, value) {
  writeFileSync(resolve(CACHE_DIR, `${key}.txt`), value);
}

async function translateViaClaude(deText, contextDescr) {
  const systemPrompt = `You are a professional DE→EN translator for an e-commerce heater/radiator/bathroom retailer.
Translate the German source text to idiomatic, concise customer-facing British English.

Strict output rules:
- Output ONLY the English translation, nothing else.
- Do NOT echo or include any of the German source text.
- Do NOT add explanations, prefaces, headers, or quotation marks.
- Do NOT prefix the answer with "Translation:" or similar.
- Preserve HTML tags, markdown, JSON structure, technical units (mm, cm, W, °C, RAL numbers) exactly.
- For very short labels (one to a few words), output only the equivalent short English label.`;
  const userPrompt = `Context: ${contextDescr}

--- DE source ---
${deText}
--- end ---`;
  const stream = claudeQuery({
    prompt: userPrompt,
    options: { systemPrompt, maxTurns: 1, permissionMode: 'default', allowedTools: [] },
  });
  let out = '';
  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') out += block.text;
      }
    }
  }
  out = out.trim();
  // Defensive cleanup: if the LLM echoed the source, strip the echo.
  // Pattern: source text appears at the start of out, followed by blank line + actual translation.
  const trimmedSrc = deText.trim();
  if (out.startsWith(trimmedSrc)) {
    const after = out.slice(trimmedSrc.length).replace(/^[\s\n]+/, '');
    if (after) out = after;
  }
  return out;
}

async function translateText(deText, contextDescr, prefix = 'fix') {
  const trimmed = (deText || '').trim();
  if (!trimmed) return '';
  const key = cacheKey(prefix, trimmed);
  const cached = readCache(key);
  if (cached != null) {
    // Validate cached entry: detect the "source-echoed-then-translation" bug
    // where Claude returned `<DE source>\n\n<EN translation>` and we stored both.
    if (cached.startsWith(trimmed)) {
      const stripped = cached.slice(trimmed.length).replace(/^[\s\n]+/, '');
      if (stripped) {
        // Repair the cache and use stripped value
        writeCache(key, stripped);
        translationStats.cacheHits += 1;
        return stripped;
      }
      // else: cache only has the echoed source — fall through to re-translate
    } else if (!isStillGerman(cached)) {
      translationStats.cacheHits += 1;
      return cached;
    }
    // cached value is still German — invalidate and re-translate
  }
  const en = await translateViaClaude(trimmed, contextDescr);
  writeCache(key, en);
  translationStats.newCalls += 1;
  return en;
}

// For Shopify rich-text JSON values: translate ONLY the text nodes' string
// content, preserving structure.
async function translateRichTextJson(jsonStr, contextDescr, prefix) {
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch { return null; }
  let touched = false;
  async function walk(node) {
    if (Array.isArray(node)) { for (const n of node) await walk(n); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.value === 'string' && node.value.trim()) {
      const en = await translateText(node.value, contextDescr, prefix);
      node.value = en;
      touched = true;
    }
    if (node.children) await walk(node.children);
  }
  await walk(parsed);
  return touched ? JSON.stringify(parsed) : jsonStr;
}

// ---------------------------------------------------------------------------
// Common GraphQL queries / mutations
// ---------------------------------------------------------------------------
const TRANSLATABLE_RESOURCE_Q = `
  query($id: ID!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent { key value digest locale type }
      translations(locale: "de") { key value locale }
    }
  }
`;

const TRANSLATIONS_REGISTER = `
  mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations { key value locale }
      userErrors { field message code }
    }
  }
`;

const METAOBJECT_FETCH = `
  query($id: ID!) {
    metaobject(id: $id) {
      id handle type displayName
      fields { key value type }
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

const METAOBJECT_DELETE = `
  mutation($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message code }
    }
  }
`;

const PRODUCTS_LIST_Q = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title
        options { id name position
          optionValues { id name }
        }
      }
    }
  }
`;

const PRODUCT_OPTION_UPDATE = `
  mutation($productId: ID!, $option: OptionUpdateInput!, $optionValuesToUpdate: [OptionValueUpdateInput!], $variantStrategy: ProductOptionUpdateVariantStrategy) {
    productOptionUpdate(productId: $productId, option: $option, optionValuesToUpdate: $optionValuesToUpdate, variantStrategy: $variantStrategy) {
      product { id }
      userErrors { field message code }
    }
  }
`;

// ---------------------------------------------------------------------------
// PHASE 1 — Metaobject leaks
// ---------------------------------------------------------------------------

const METAOBJECT_SKIP_HANDLES = new Set([
  'tb-tuev',  // intentional EN with German trademark
]);

// Helper: register DE translation for a list of {key, source, deValue, digest}
async function registerDeForMetaobject(resourceId, items, label) {
  const translations = items.map(({ key, deValue, digest }) => ({
    locale: 'de',
    key,
    value: deValue,
    translatableContentDigest: digest,
  }));
  if (translations.length === 0) return { ok: true, count: 0 };
  if (!APPLY) {
    console.log(`      · would register ${translations.length} DE translation(s) on ${label}`);
    return { ok: true, count: translations.length };
  }
  const data = await gql(TRANSLATIONS_REGISTER, { resourceId, translations });
  const errs = data.translationsRegister.userErrors || [];
  if (errs.length) {
    console.warn(`      ! translationsRegister errors on ${label}: ${JSON.stringify(errs).slice(0, 400)}`);
    return { ok: false, count: 0, errors: errs };
  }
  return { ok: true, count: data.translationsRegister.translations.length };
}

// Helper: update a metaobject's source fields to new values
async function updateMetaobjectFields(id, fieldUpdates, label) {
  if (fieldUpdates.length === 0) return { ok: true };
  if (!APPLY) {
    console.log(`      · would update ${fieldUpdates.length} source field(s) on ${label}: ${fieldUpdates.map(f => f.key).join(',')}`);
    return { ok: true };
  }
  const data = await gql(METAOBJECT_UPDATE, {
    id,
    metaobject: { fields: fieldUpdates },
  });
  const errs = data.metaobjectUpdate.userErrors || [];
  if (errs.length) {
    console.warn(`      ! metaobjectUpdate errors on ${label}: ${JSON.stringify(errs).slice(0, 400)}`);
    return { ok: false, errors: errs };
  }
  return { ok: true };
}

async function processMetaobjectLeaks(audit) {
  console.log('\n========================================');
  console.log('PHASE 1 — Metaobject leaks');
  console.log('========================================');

  const moLeaks = audit.leaks.filter((l) => l.resource_type === 'metaobject');
  console.log(`  ${moLeaks.length} metaobject leak rows total`);

  // Group by resource_id
  const byId = new Map();
  for (const l of moLeaks) {
    if (!byId.has(l.resource_id)) byId.set(l.resource_id, []);
    byId.get(l.resource_id).push(l);
  }

  // Dedupe FAQ duplicates: prefer `*-gberg-faq-N` and delete `*-faq-N` siblings.
  // Build a lookup from handle → metaobject id.
  const handleToId = new Map();
  const idToHandle = new Map();
  for (const [id, leaks] of byId) {
    const h = leaks[0].handle_or_id_human;  // e.g. "faq_item/lavinno-...-faq-0"
    handleToId.set(h, id);
    idToHandle.set(id, h);
  }

  const dupeDeletes = []; // [{id, handle, gbergSibling}]
  for (const [h, id] of handleToId) {
    if (!h.startsWith('faq_item/')) continue;
    const handle = h.slice('faq_item/'.length);
    // Match pattern: <prefix>-faq-N (NOT gberg-faq-N)
    const m = handle.match(/^(.+?)-faq-(\d+)$/);
    if (!m || m[1].endsWith('-gberg')) continue;
    const prefix = m[1];
    const n = m[2];
    const gbergHandle = `faq_item/${prefix}-gberg-faq-${n}`;
    if (handleToId.has(gbergHandle)) {
      dupeDeletes.push({ id, handle, gbergSibling: gbergHandle });
    }
  }
  console.log(`\n  → FAQ duplicate detection: found ${dupeDeletes.length} *-faq-N rows with *-gberg-faq-N siblings to delete`);
  for (const d of dupeDeletes) {
    console.log(`    - DELETE ${d.handle}  (kept: ${d.gbergSibling})`);
  }

  // Skip-list extension: never delete tb-tuev etc.
  const skipDelete = new Set();
  for (const d of dupeDeletes) {
    const handleOnly = d.handle.split('/').pop();
    if (METAOBJECT_SKIP_HANDLES.has(handleOnly)) skipDelete.add(d.id);
  }

  const stats = {
    duplicatesDeleted: 0,
    metaobjectsRewritten: 0,
    fieldsRewritten: 0,
    deTranslationsRegistered: 0,
    skipped: 0,
    failed: 0,
  };

  // -------- 1a. Delete duplicates --------
  for (const d of dupeDeletes) {
    if (skipDelete.has(d.id)) {
      console.log(`    SKIP delete ${d.handle} (in skip-list)`);
      continue;
    }
    if (!APPLY) {
      console.log(`    · would delete ${d.handle}`);
      logChange({ phase: 1, action: 'delete-metaobject', resource_id: d.id, handle: d.handle, kept_sibling: d.gbergSibling });
      stats.duplicatesDeleted += 1;
      continue;
    }
    try {
      const r = await gql(METAOBJECT_DELETE, { id: d.id });
      const errs = r.metaobjectDelete.userErrors || [];
      if (errs.length) throw new Error(JSON.stringify(errs));
      console.log(`    ✓ deleted ${d.handle}`);
      logChange({ phase: 1, action: 'delete-metaobject', resource_id: d.id, handle: d.handle, kept_sibling: d.gbergSibling });
      stats.duplicatesDeleted += 1;
      // Remove this id from byId so we don't try to translate a dead row
      byId.delete(d.id);
      await pause(120);
    } catch (err) {
      console.warn(`    ! delete failed for ${d.handle}: ${err.message}`);
      stats.failed += 1;
    }
  }

  // -------- 1b. Rewrite remaining metaobjects: register DE then update source --------
  console.log('\n  → Rewriting remaining German metaobjects to EN source + DE translation');

  for (const [id, leaks] of byId) {
    const handleHuman = idToHandle.get(id);
    const handleOnly = handleHuman.split('/').pop();
    if (METAOBJECT_SKIP_HANDLES.has(handleOnly)) {
      console.log(`    SKIP ${handleHuman} (skip-list — intentional)`);
      stats.skipped += 1;
      continue;
    }

    console.log(`\n    • ${handleHuman}`);

    // Fetch fresh translatable content + current de translations
    let resource;
    try {
      const data = await gql(TRANSLATABLE_RESOURCE_Q, { id });
      resource = data.translatableResource;
    } catch (err) {
      console.warn(`      ! translatableResource fetch failed: ${err.message}`);
      stats.failed += 1;
      continue;
    }
    if (!resource) {
      console.warn(`      ! no translatableResource for ${id} (may be deleted)`);
      stats.failed += 1;
      continue;
    }
    const sourceByKey = new Map(resource.translatableContent.map((c) => [c.key, c]));
    const deExisting = new Map((resource.translations || []).map((t) => [t.key, t.value]));

    // Determine which fields are still German (re-check fresh source value, not stale audit)
    const germanFieldKeys = leaks.map((l) => l.field_key);
    const fieldsToProcess = [];
    for (const key of germanFieldKeys) {
      const src = sourceByKey.get(key);
      if (!src) {
        console.log(`      · field ${key}: no longer in translatable content (skip)`);
        continue;
      }
      if (!isStillGerman(src.value)) {
        console.log(`      · field ${key}: source already EN (skip — idempotent)`);
        continue;
      }
      fieldsToProcess.push({ key, source: src });
    }
    if (fieldsToProcess.length === 0) {
      console.log(`      · nothing to do (already-EN)`);
      stats.skipped += 1;
      continue;
    }

    // Translate all DE → EN first
    const translations = [];
    for (const { key, source } of fieldsToProcess) {
      const ctxDescr = `Metaobject ${handleHuman} field=${key}`;
      let enValue;
      try {
        if (source.type === 'rich_text_field' || (source.value && source.value.trim().startsWith('{') && source.value.includes('"type":"root"'))) {
          enValue = await translateRichTextJson(source.value, ctxDescr, 'mo-rich');
        } else {
          enValue = await translateText(source.value, ctxDescr, 'mo-text');
        }
      } catch (err) {
        console.warn(`      ! translate failed for ${key}: ${err.message}`);
        stats.failed += 1;
        continue;
      }
      if (!enValue || enValue === source.value) {
        console.warn(`      ! translation produced empty / unchanged for ${key} — skipping`);
        continue;
      }
      const before = source.value;
      const after = enValue;
      console.log(`      ${key}:`);
      console.log(`        DE: ${oneLine(before).slice(0, 90)}${oneLine(before).length > 90 ? '…' : ''}`);
      console.log(`        EN: ${oneLine(after).slice(0, 90)}${oneLine(after).length > 90 ? '…' : ''}`);
      translations.push({ key, deValue: source.value, enValue, digest: source.digest });
    }

    if (translations.length === 0) continue;

    // Step 1: register DE translation FIRST (uses current digest for German source)
    const deAlreadyOk = translations.filter((t) => deExisting.get(t.key) === t.deValue);
    if (deAlreadyOk.length) {
      console.log(`      · ${deAlreadyOk.length} DE translation(s) already registered (no-op)`);
    }
    const deNeed = translations.filter((t) => deExisting.get(t.key) !== t.deValue);
    if (deNeed.length) {
      const r = await registerDeForMetaobject(id, deNeed, handleHuman);
      if (!r.ok) { stats.failed += 1; continue; }
      stats.deTranslationsRegistered += r.count;
      logChange({ phase: 1, action: 'register-de-translation', resource_id: id, handle: handleHuman, fields: deNeed.map(t => t.key) });
    }

    // Step 2: rewrite source to EN via metaobjectUpdate
    const fieldUpdates = translations.map((t) => ({ key: t.key, value: t.enValue }));
    const beforeMap = Object.fromEntries(translations.map((t) => [t.key, t.deValue]));
    const afterMap = Object.fromEntries(translations.map((t) => [t.key, t.enValue]));
    const u = await updateMetaobjectFields(id, fieldUpdates, handleHuman);
    if (!u.ok) { stats.failed += 1; continue; }
    stats.metaobjectsRewritten += 1;
    stats.fieldsRewritten += fieldUpdates.length;
    logChange({ phase: 1, action: 'update-metaobject-source', resource_id: id, handle: handleHuman, before: beforeMap, after: afterMap });
    await pause(150);
  }

  return stats;
}

function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Quick German check (mirrors the audit script's high/medium logic)
const UMLAUT_RE = /[äöüßÄÖÜ]/;
const STARTER_RE = /^(Ist|Wie|Wir|Wo|Was|Können|Welche|Passen|Lässt|Sind|Müssen|Werden|Wird|Würden|Hat|Haben|Der|Die|Das|Den|Dem|Ein|Eine|Für|Mit|Von|Auf|Bei|Durch|Über|Unter)\b/;
const GERMAN_FN_RE = /\b(und|oder|aber|nicht|sehr|auch|noch|nur|sich|wird|werden|wurde|wurden|für|über)\b/i;
const ENGLISH_FN_RE = /\b(the|and|is|are|with|for|of|to|from|this|that|these|those|you|your|our|we|will|have|has)\b/i;

function plain(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function isStillGerman(value) {
  if (!value) return false;
  // Try parse as rich-text JSON and check the inner text
  let text = String(value);
  try {
    const j = JSON.parse(text);
    if (j && j.type === 'root') {
      const collected = [];
      const walk = (n) => {
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n && typeof n === 'object') {
          if (n.type === 'text' && typeof n.value === 'string') collected.push(n.value);
          if (n.children) walk(n.children);
        }
      };
      walk(j);
      text = collected.join(' ');
    }
  } catch { /* not JSON */ }
  const p = plain(text);
  if (!p) return false;
  if (UMLAUT_RE.test(text)) return true;
  const first = (p.match(/[A-Za-zÄÖÜäöüß]+/) || [])[0] || '';
  if (STARTER_RE.test(first)) return true;
  const hasGermanFn = GERMAN_FN_RE.test(p);
  const hasEnglishFn = ENGLISH_FN_RE.test(p);
  if (hasGermanFn && !hasEnglishFn) return true;
  return false;
}

// ---------------------------------------------------------------------------
// PHASE 2 — Product variant option names + values
// ---------------------------------------------------------------------------

// Controlled vocab — translate without burning tokens.
const KNOWN_OPTION_NAME_MAP = {
  'Größe': 'Size',
  'Farbe': 'Color',
  'Farbe:': 'Color:',
  'Material': 'Material',
  'Breite': 'Width',
  'Höhe': 'Height',
  'Länge': 'Length',
  'Tiefe': 'Depth',
  'Breite x Höhe in cm': 'Width x Height in cm',
  'Breite × Höhe in cm': 'Width × Height in cm',
  'Breite x Höhe': 'Width x Height',
  'Breite × Höhe': 'Width × Height',
  'Höhe x Breite': 'Height x Width',
  'Höhe × Breite in cm': 'Height × Width in cm',
  'Größe in cm': 'Size in cm',
  'Ausführung': 'Variant',
  'Anschluss': 'Connection',
  'Anschluss wählen': 'Connection type',
  'Bauart': 'Construction',
  'Leistung': 'Power',
  'Auslieferungszustand': 'Delivery state',
  'Nabenabstände in cm': 'Pipe centres in cm',
  // additional German option-name vocabulary that lacks umlauts but still indicates German
  // (these are flagged via dictionary lookup in looksGermanOption)
};

// Names that have NO umlauts/ß but are unmistakably German option labels.
// Used by looksGermanOption fallback detection.
const GERMAN_OPTION_NAMES_NO_UMLAUT = new Set([
  'Auslieferungszustand',
  'Farbe:',
]);

const KNOWN_OPTION_VALUE_MAP = {
  'Weiß': 'White',
  'Weiss': 'White',
  'Chrom': 'Chrome',
  'Schwarz': 'Black',
  'Anthrazit': 'Anthracite',
  'Grau': 'Gray',
  'Grey': 'Gray',
  'Beige': 'Beige',
  'Edelstahl': 'Stainless steel',
  'Messing': 'Brass',
  'Kupfer': 'Copper',
  'Silber': 'Silver',
  'Gold': 'Gold',
  'Bronze': 'Bronze',
  'Glanzend': 'Glossy',
  'Glänzend': 'Glossy',
  'Matt': 'Matte',
  'Seidenmatt': 'Silk-matte',
  'Hochglanz': 'High gloss',
  'Klein': 'Small',
  'Mittel': 'Medium',
  'Groß': 'Large',
  'Eckig': 'Angled',
  'Gerade': 'Straight',
  'Links': 'Left',
  'Rechts': 'Right',
  'Mitte': 'Middle',
  'Standard': 'Standard',
  // common heater color variants
  'Mattschwarz': 'Matte black',
  'Mattweiß': 'Matte white',
  'Mattweiss': 'Matte white',
  'Reinweiß': 'Pure white',
};

function looksGermanOption(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (!t) return false;
  // Pure dimensions like "60 × 120" or "60x120 cm" are language-neutral
  if (/^\d+\s*[x×]\s*\d+/i.test(t)) return false;
  if (/^\d+[\s.]/.test(t) && t.length < 12) return false;  // "60 cm"
  // German-name dictionary hit
  if (KNOWN_OPTION_NAME_MAP[t] || KNOWN_OPTION_VALUE_MAP[t]) return true;
  if (GERMAN_OPTION_NAMES_NO_UMLAUT.has(t)) return true;
  // Umlaut/ß
  if (UMLAUT_RE.test(t)) return true;
  // German-only function words inside (rare in option names)
  if (GERMAN_FN_RE.test(t) && !ENGLISH_FN_RE.test(t)) return true;
  return false;
}

async function translateOptionLabel(de, kindCtx) {
  const trimmed = String(de || '').trim();
  if (!trimmed) return '';
  const nameHit = KNOWN_OPTION_NAME_MAP[trimmed] || KNOWN_OPTION_VALUE_MAP[trimmed];
  if (nameHit) return nameHit;
  // Otherwise call Claude (cheap, very short strings)
  return translateText(trimmed, `Product ${kindCtx}, very short label — output only the EN equivalent (no extra text)`, 'opt-label');
}

async function fetchAllProducts(limit) {
  const all = [];
  let after = null;
  for (;;) {
    const d = await gql(PRODUCTS_LIST_Q, { first: 100, after });
    all.push(...d.products.nodes);
    if (limit && all.length >= limit) return all.slice(0, limit);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
    await pause(150);
  }
  return all;
}

async function processProductOptionLeaks() {
  console.log('\n========================================');
  console.log('PHASE 2 — Product variant option names + values');
  console.log('========================================');
  const products = await fetchAllProducts(PRODUCT_LIMIT);
  console.log(`  scanned ${products.length} products`);

  const stats = {
    productsTouched: 0,
    optionsRenamed: 0,
    valuesRenamed: 0,
    deTranslationsRegistered: 0,
    failed: 0,
  };

  for (const p of products) {
    const optionChanges = [];   // [{option, newName, valueRenames: [{id, oldName, newName}]}]
    for (const opt of p.options || []) {
      const nameIsGerman = looksGermanOption(opt.name);
      const valueRenames = [];
      for (const v of opt.optionValues || []) {
        if (looksGermanOption(v.name)) {
          valueRenames.push({ id: v.id, oldName: v.name });
        }
      }
      if (nameIsGerman || valueRenames.length > 0) {
        optionChanges.push({ option: opt, nameIsGerman, valueRenames });
      }
    }
    if (optionChanges.length === 0) continue;

    console.log(`\n  • ${p.handle}`);
    let touched = false;

    for (const change of optionChanges) {
      const { option, nameIsGerman, valueRenames } = change;
      let newName = option.name;
      if (nameIsGerman) {
        newName = await translateOptionLabel(option.name, `option name on "${p.title}"`);
      }
      // Translate each value label
      for (const v of valueRenames) {
        v.newName = await translateOptionLabel(v.oldName, `option value (option=${option.name})`);
      }
      const renamesNonTrivial = valueRenames.filter((v) => v.newName && v.newName !== v.oldName);
      const nameChange = nameIsGerman && newName && newName !== option.name;
      if (!nameChange && renamesNonTrivial.length === 0) continue;

      console.log(`    option ${option.name} → ${newName}${renamesNonTrivial.length ? ' (+ ' + renamesNonTrivial.length + ' value(s))' : ''}`);
      for (const v of renamesNonTrivial) {
        console.log(`      value "${v.oldName}" → "${v.newName}"`);
      }

      // ---- Step A: register DE translations on the PRODUCT_OPTION + each PRODUCT_OPTION_VALUE
      // Fetch translatableContent for the option resource (for digests)
      let optionResource;
      try {
        const data = await gql(TRANSLATABLE_RESOURCE_Q, { id: option.id });
        optionResource = data.translatableResource;
      } catch (err) {
        console.warn(`      ! translatableResource(option) failed: ${err.message}`);
        stats.failed += 1;
        continue;
      }

      // Option name: register DE = original German name
      if (nameChange && optionResource) {
        const nameContent = optionResource.translatableContent.find((c) => c.key === 'name');
        if (nameContent) {
          const r = await registerDeForMetaobject(option.id, [{
            key: 'name',
            deValue: option.name,
            digest: nameContent.digest,
          }], `option ${option.name}`);
          if (r.ok) stats.deTranslationsRegistered += r.count;
          else stats.failed += 1;
        }
      }

      // Each value: register DE
      for (const v of renamesNonTrivial) {
        let vRes;
        try {
          const data = await gql(TRANSLATABLE_RESOURCE_Q, { id: v.id });
          vRes = data.translatableResource;
        } catch (err) {
          console.warn(`      ! translatableResource(value ${v.oldName}) failed: ${err.message}`);
          stats.failed += 1;
          continue;
        }
        if (!vRes) continue;
        const nameContent = vRes.translatableContent.find((c) => c.key === 'name');
        if (!nameContent) continue;
        const r = await registerDeForMetaobject(v.id, [{
          key: 'name',
          deValue: v.oldName,
          digest: nameContent.digest,
        }], `value ${v.oldName}`);
        if (r.ok) stats.deTranslationsRegistered += r.count;
        else stats.failed += 1;
        await pause(60);
      }

      // ---- Step B: rewrite source via productOptionUpdate
      const optionInput = nameChange ? { id: option.id, name: newName } : { id: option.id };
      const optionValuesToUpdate = renamesNonTrivial.map((v) => ({ id: v.id, name: v.newName }));

      if (!APPLY) {
        console.log(`      · would productOptionUpdate name=${nameChange ? newName : '(keep)'}, values=${optionValuesToUpdate.length}`);
        if (nameChange) stats.optionsRenamed += 1;
        stats.valuesRenamed += optionValuesToUpdate.length;
        touched = true;
        logChange({ phase: 2, action: 'product-option-update', product_handle: p.handle, option_id: option.id, before_name: option.name, after_name: newName, value_renames: renamesNonTrivial });
        continue;
      }
      try {
        const data = await gql(PRODUCT_OPTION_UPDATE, {
          productId: p.id,
          option: optionInput,
          optionValuesToUpdate: optionValuesToUpdate.length > 0 ? optionValuesToUpdate : null,
          variantStrategy: 'LEAVE_AS_IS',
        });
        const errs = data.productOptionUpdate.userErrors || [];
        if (errs.length && !errs.every((e) => /already/i.test(e.message))) {
          console.warn(`      ! productOptionUpdate errors: ${JSON.stringify(errs).slice(0, 400)}`);
          stats.failed += 1;
          continue;
        }
        console.log(`      ✓ rewrote option source to EN`);
        if (nameChange) stats.optionsRenamed += 1;
        stats.valuesRenamed += optionValuesToUpdate.length;
        touched = true;
        logChange({ phase: 2, action: 'product-option-update', product_handle: p.handle, option_id: option.id, before_name: option.name, after_name: newName, value_renames: renamesNonTrivial });
      } catch (err) {
        console.warn(`      ! productOptionUpdate threw: ${err.message}`);
        stats.failed += 1;
      }
      await pause(150);
    }

    if (touched) stats.productsTouched += 1;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(AUDIT_PATH)) {
    console.error(`Missing audit file at ${AUDIT_PATH}. Run audit-source-locale.mjs first.`);
    process.exit(1);
  }
  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
  console.log(`  audit @ ${audit.audited_at}: ${audit.totals.leaks_found} leaks (high=${audit.totals.leaks_by_confidence?.high || 0})`);

  const summary = { phase1: null, phase2: null };
  if (PHASE === 0 || PHASE === 1) {
    summary.phase1 = await processMetaobjectLeaks(audit);
  }
  if (PHASE === 0 || PHASE === 2) {
    summary.phase2 = await processProductOptionLeaks();
  }

  console.log('\n════════════════════════════════════════');
  console.log('RUN SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`  mode: ${APPLY ? 'APPLY (writes were sent)' : 'DRY-RUN (no writes sent)'}`);
  if (summary.phase1) {
    console.log(`  Phase 1 (metaobjects):`);
    console.log(`    duplicates deleted          : ${summary.phase1.duplicatesDeleted}`);
    console.log(`    metaobjects rewritten       : ${summary.phase1.metaobjectsRewritten}`);
    console.log(`    fields rewritten            : ${summary.phase1.fieldsRewritten}`);
    console.log(`    DE translations registered  : ${summary.phase1.deTranslationsRegistered}`);
    console.log(`    skipped (already EN / list) : ${summary.phase1.skipped}`);
    console.log(`    failed                      : ${summary.phase1.failed}`);
  }
  if (summary.phase2) {
    console.log(`  Phase 2 (product options):`);
    console.log(`    products touched            : ${summary.phase2.productsTouched}`);
    console.log(`    option names renamed        : ${summary.phase2.optionsRenamed}`);
    console.log(`    option values renamed       : ${summary.phase2.valuesRenamed}`);
    console.log(`    DE translations registered  : ${summary.phase2.deTranslationsRegistered}`);
    console.log(`    failed                      : ${summary.phase2.failed}`);
  }
  console.log(`  translation cost:`);
  console.log(`    cache hits        : ${translationStats.cacheHits}`);
  console.log(`    new Claude calls  : ${translationStats.newCalls}`);
  console.log(`  audit log: ${LOG_PATH}`);
  if (!APPLY) console.log(`\n  (Dry-run only — re-run with --apply to write.)`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
