#!/usr/bin/env node
/**
 * Re-translate product prose metafields (custom.subtitle and
 * custom.short_description) into de/nl/fr and register the translations
 * via Shopify's translationsRegister API.
 *
 * Why this exists despite prod-translate-content.mjs already shipping:
 *   The earlier script registered translations that came back equal to
 *   the English source for several products (Konrad family, every
 *   short_description on the Milan/Kaska family) and registered nothing
 *   at all for nl/fr. This script is targeted: it only walks the two
 *   user-visible prose metafields, validates that any newly-translated
 *   output is actually different from the input, and skips anything
 *   already correct.
 *
 * Reuses .translation-cache/prod.json (same key shape as
 * prod-translate-content.mjs) so re-runs are idempotent and don't burn
 * Gemini quota on already-translated strings.
 *
 * Flags:
 *   --apply               write changes (default: dry-run)
 *   --keys=a,b            restrict to specific metafield keys
 *                         (default: subtitle,short_description)
 *   --locales=de,nl,fr    restrict target locales (default: all three)
 *   --handle=foo          single-product run
 *   --force               re-translate even if a non-empty translation
 *                         is already registered (still skips when the
 *                         registered value isn't byte-equal to source)
 */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const GEMINI_KEY = process.env.GOOGLE_API_KEY;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
if (!GEMINI_KEY) throw new Error('Missing GOOGLE_API_KEY');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const KEYS = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--keys'));
  if (i < 0) return ['subtitle', 'short_description'];
  const a = process.argv[i];
  return (a.includes('=') ? a.split('=')[1] : process.argv[i + 1])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
})();
const LOCALES = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--locales'));
  if (i < 0) return ['de', 'nl', 'fr'];
  const a = process.argv[i];
  return (a.includes('=') ? a.split('=')[1] : process.argv[i + 1])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
})();
const ONLY_HANDLE = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--handle'));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
})();
const GEMINI_CAP = parseInt(process.env.GEMINI_CAP || '2000', 10);

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  keys    : ${KEYS.join(',')}`);
console.log(`  locales : ${LOCALES.join(',')}`);
if (ONLY_HANDLE) console.log(`  handle  : ${ONLY_HANDLE}`);
if (FORCE) console.log(`  force   : ON (re-translate even when not empty)`);
console.log('');

// ─────────────────────── cache ───────────────────────
const CACHE_DIR = resolve(ROOT, '.translation-cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, {recursive: true});
const CACHE_PATH = resolve(CACHE_DIR, 'prod.json');
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
const cacheKey = (text, locale) =>
  createHash('sha256').update(`${locale}::${text}`).digest('hex').slice(0, 24);
const flushCache = () => writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

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

// ─────────────────────── gemini ───────────────────────
const LANG_LABEL = {de: 'German (Germany)', nl: 'Dutch (Netherlands)', fr: 'French (France)'};
let geminiCalls = 0;

async function geminiTranslate(text, toLocale) {
  if (!text || !text.trim()) return '';
  const k = cacheKey(text, `en->${toLocale}`);
  if (cache[k]) return cache[k];

  if (geminiCalls >= GEMINI_CAP) {
    throw new Error(`Hit GEMINI_CAP=${GEMINI_CAP}, stopping for safety`);
  }
  geminiCalls++;

  const targetName = LANG_LABEL[toLocale] ?? toLocale;
  // Strict prompt — explicit anti-passthrough wording. Defends against
  // the previous failure mode where Gemini returned the input unchanged.
  const prompt =
    `Translate the following English text to ${targetName}. ` +
    `Output ONLY the translated text. ` +
    `Do NOT include preamble, explanation, language labels, or quotes. ` +
    `Do NOT return the input language unchanged. ` +
    `Preserve any "✔" bullets, line breaks, and HTML tags exactly. ` +
    `Translate every meaningful sentence; if the input has multiple bullets, translate each.\n\n` +
    `--- INPUT ---\n${text}\n--- OUTPUT ---`;

  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash'];
  let r, j, lastErr;
  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const model = MODELS[attempt];
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{parts: [{text: prompt}]}],
          generationConfig: {temperature: 0.2, maxOutputTokens: 4096},
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

  // Defence — if Gemini returned the input unchanged (the previous bug),
  // refuse to cache or use it. The caller will mark this product/key as
  // a failure and the human can investigate.
  if (out === text.trim()) {
    throw new Error(`Gemini returned input unchanged for ${toLocale}; refusing to register.`);
  }

  cache[k] = out;
  if (geminiCalls % 10 === 0) flushCache();
  return out;
}

// ─────────────────────── main ───────────────────────

console.log('Fetching prod products …');
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){
      products(first:50, after:$c){
        pageInfo{hasNextPage endCursor}
        nodes{
          id handle title
          metafields(first:60){nodes{id namespace key value type}}
        }
      }
    }`,
    {c: cursor},
  );
  for (const p of d.products.nodes) {
    if (ONLY_HANDLE && p.handle !== ONLY_HANDLE) continue;
    products.push(p);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`  ${products.length} product${products.length === 1 ? '' : 's'} fetched\n`);

const stats = {
  metafieldsConsidered: 0,
  alreadyOk: 0,
  reTranslated: 0,
  registered: 0,
  failed: 0,
  noSource: 0,
};

for (const p of products) {
  const mfsForKeys = KEYS
    .map((k) => p.metafields.nodes.find((m) => m.namespace === 'custom' && m.key === k))
    .filter(Boolean);
  if (mfsForKeys.length === 0) continue;

  for (const mf of mfsForKeys) {
    stats.metafieldsConsidered += LOCALES.length;
    const source = (mf.value ?? '').trim();
    if (!source) {
      stats.noSource += LOCALES.length;
      continue;
    }
    // Get the digest from translatableContent (translationsRegister needs it)
    const tc = await gql(
      `query($id:ID!){translatableResource(resourceId:$id){translatableContent{key value digest locale}}}`,
      {id: mf.id},
    );
    const valueContent = tc.translatableResource?.translatableContent.find((c) => c.key === 'value');
    if (!valueContent?.digest) {
      console.log(`  ✗ ${p.handle} :: ${mf.key}  no translatableContent`);
      stats.failed += LOCALES.length;
      continue;
    }
    const digest = valueContent.digest;

    // Pull existing translations once per locale
    for (const locale of LOCALES) {
      const trData = await gql(
        `query($id:ID!,$loc:String!){translatableResource(resourceId:$id){translations(locale:$loc){key value}}}`,
        {id: mf.id, loc: locale},
      );
      const existing = trData.translatableResource?.translations.find((t) => t.key === 'value')?.value;

      // Whitespace-insensitive comparison — earlier runs sometimes
      // registered the EN source as the DE translation but with internal
      // newlines collapsed to single spaces, which would slip past a
      // strict-equal check.
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const isMissing = !existing;
      const isBrokenEqualsSource = existing && norm(existing) === norm(source);
      const needsTranslate = isMissing || isBrokenEqualsSource || FORCE;

      if (!needsTranslate) {
        stats.alreadyOk++;
        continue;
      }

      let translated;
      try {
        translated = await geminiTranslate(source, locale);
      } catch (err) {
        console.log(`  ✗ ${p.handle} :: ${mf.key} → ${locale}  ${err.message}`);
        stats.failed++;
        continue;
      }
      stats.reTranslated++;

      const reason = isMissing ? 'missing' : isBrokenEqualsSource ? 'was=source' : 'force';
      console.log(`  ${p.handle} :: ${mf.key} → ${locale} (${reason})`);
      console.log(`    source : "${source.slice(0, 70)}${source.length > 70 ? '…' : ''}"`);
      console.log(`    target : "${translated.slice(0, 70)}${translated.length > 70 ? '…' : ''}"`);

      if (!APPLY) continue;

      const r = await gql(
        `mutation($id:ID!,$translations:[TranslationInput!]!){
          translationsRegister(resourceId:$id, translations:$translations){
            userErrors{field message}
          }
        }`,
        {
          id: mf.id,
          translations: [{locale, key: 'value', value: translated, translatableContentDigest: digest}],
        },
      );
      const errs = r.translationsRegister.userErrors;
      if (errs.length) {
        console.log(`    ✗ register: ${JSON.stringify(errs)}`);
        stats.failed++;
      } else {
        stats.registered++;
      }
    }
  }
}

flushCache();
console.log('');
console.log('Summary:');
console.log(`  considered  : ${stats.metafieldsConsidered} (per product × locales)`);
console.log(`  already OK  : ${stats.alreadyOk}`);
console.log(`  re-translated: ${stats.reTranslated}`);
console.log(`  registered  : ${stats.registered}`);
console.log(`  failed      : ${stats.failed}`);
console.log(`  no source   : ${stats.noSource}`);
console.log(`  Gemini calls: ${geminiCalls} / ${GEMINI_CAP}`);
if (!APPLY) console.log('\n(dry-run — re-run with --apply to write)');
