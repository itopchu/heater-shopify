#!/usr/bin/env node
/**
 * Translate the prod store's shop policies (Refund / Privacy / Terms /
 * Shipping / Contact) to DE/NL/FR via Gemini and register the
 * translations against the policy GIDs.
 *
 * `prod-translate-content.mjs` deliberately skips policies (see comment
 * around line 270 of that script). Use this when you change a policy
 * body via prod-update-shipping-policy.mjs / prod-fill-shop-policies.mjs
 * and need the localized storefront pages (/de /nl /fr /policies/...) to
 * pick up the new English copy instead of falling back to the source.
 *
 * Run:
 *   node agent/scripts/prod-translate-shop-policies.mjs               # dry-run
 *   node agent/scripts/prod-translate-shop-policies.mjs --apply
 *   node agent/scripts/prod-translate-shop-policies.mjs --apply --policy=SHIPPING_POLICY
 *
 * Idempotent: re-registers digests on every run, so it's safe to call
 * after small body edits.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
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
const GEMINI_KEY = process.env.GOOGLE_API_KEY;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_STORE / SHOPIFY_PROD_ADMIN_TOKEN');
if (!GEMINI_KEY) throw new Error('Missing GOOGLE_API_KEY');

const APPLY = process.argv.includes('--apply');
const ONE_POLICY = (() => {
  const i = process.argv.findIndex(a => a.startsWith('--policy'));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
})();

const TARGET_LOCALES = ['de', 'nl', 'fr'];
const SOURCE_LOCALE = 'en';

const CACHE_PATH = resolve(ROOT, '.translation-cache', 'prod.json');
const cache = existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  : {};
function flushCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function gql(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

let geminiCalls = 0;
async function geminiTranslate(text, toLocale) {
  const cacheKey = `${SOURCE_LOCALE}|${toLocale}|${text}`;
  if (cache[cacheKey]) return cache[cacheKey];
  geminiCalls++;
  const isHtml = /<[a-z][^>]*>/i.test(text);
  const langName = {de: 'German', nl: 'Dutch', fr: 'French'}[toLocale];
  const prompt = isHtml
    ? `Translate the following English HTML into ${langName}. Preserve HTML tags exactly. Translate text only. Keep brand names, product codes (Typ 22, Typ 33), city names (Aachen), country names, and email addresses unchanged. Output ONLY the translated HTML, no commentary.\n\n${text}`
    : `Translate the following English text into ${langName}. Keep brand names, product codes (Typ 22, Typ 33), city names (Aachen), and email addresses unchanged. Output ONLY the translation, no commentary.\n\n${text}`;
  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr;
  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const model = MODELS[attempt];
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({contents: [{parts: [{text: prompt}]}]}),
      },
    );
    const j = await r.json();
    if (r.ok && j?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const out = j.candidates[0].content.parts[0].text.trim();
      cache[cacheKey] = out;
      if (geminiCalls % 5 === 0) flushCache();
      return out;
    }
    lastErr = `Gemini ${model} ${r.status}: ${JSON.stringify(j).slice(0, 160)}`;
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  Cache: ${CACHE_PATH} (${Object.keys(cache).length} entries)\n`);

const policies = (await gql(`{shop{shopPolicies{id type title body}}}`)).shop.shopPolicies;
const targets = ONE_POLICY
  ? policies.filter(p => p.type === ONE_POLICY)
  : policies.filter(p => p.body && p.body.trim().length > 0);

if (!targets.length) {
  console.error(`No matching policies found${ONE_POLICY ? ` (--policy=${ONE_POLICY})` : ''}.`);
  process.exit(1);
}

let totalRegistered = 0;

for (const policy of targets) {
  console.log(`--- ${policy.type} (${policy.title}) ---`);
  const tr = await gql(
    `query($id:ID!){translatableResource(resourceId:$id){translatableContent{key value digest locale type}}}`,
    {id: policy.id},
  );
  const fields = tr.translatableResource.translatableContent;
  if (!fields.length) {
    console.log(`  no translatable fields — skip`);
    continue;
  }

  for (const locale of TARGET_LOCALES) {
    const inputs = [];
    for (const f of fields) {
      const out = await geminiTranslate(f.value, locale);
      inputs.push({
        key: f.key,
        locale,
        value: out,
        translatableContentDigest: f.digest,
      });
    }
    if (!APPLY) {
      console.log(`  [dry-run] would register ${inputs.length} ${locale} translation(s) (geminiCalls=${geminiCalls})`);
      continue;
    }
    await gql(
      `mutation($id:ID!, $t:[TranslationInput!]!){translationsRegister(resourceId:$id, translations:$t){userErrors{field message}}}`,
      {id: policy.id, t: inputs},
    );
    totalRegistered += inputs.length;
    console.log(`  ✓ registered ${inputs.length} ${locale} translation(s) (geminiCalls=${geminiCalls})`);
  }
}

flushCache();
console.log(`\nDone. Registered ${totalRegistered} translation(s). Gemini calls used: ${geminiCalls}.`);
