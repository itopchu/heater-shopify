#!/usr/bin/env node
/**
 * Backfill English descriptions + clean titles for the 8 DRAFT accessory
 * products on the dev store, sourced from xxl-heizung.de's public product
 * JSON and translated/cleaned via Gemini 2.5 Flash.
 *
 * For each DRAFT product:
 *   1. Fetch  https://xxl-heizung.de/products/<handle>.json
 *   2. Send title + body_html to Gemini Flash with a prompt that:
 *      - translates German → English
 *      - strips all Elementor / CSS / inline-style markup
 *      - returns clean structured HTML (h2/h3/p/ul/li only)
 *      - returns a short product title in English
 *   3. productUpdate the dev store product with the new title + descriptionHtml
 *
 * Status stays DRAFT — merchant should still review before promoting.
 *
 * Usage:
 *   node agent/scripts/backfill-draft-descriptions.mjs            # dry-run
 *   node agent/scripts/backfill-draft-descriptions.mjs --apply
 *   node agent/scripts/backfill-draft-descriptions.mjs --handle <h>  # one product
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function loadEnvLocal(path) {
  const raw = readFileSync(path, 'utf8');
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
loadEnvLocal(resolve(REPO_ROOT, '.env.local'));

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const HANDLE = (() => {
  const i = argv.indexOf('--handle');
  return i >= 0 ? argv[i + 1] : null;
})();

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
const GOOGLE = process.env.GOOGLE_API_KEY;
if (!STORE || !TOKEN) { console.error('Missing dev store env vars'); process.exit(1); }
if (!GOOGLE) { console.error('Missing GOOGLE_API_KEY'); process.exit(1); }

const VISION_MODEL = 'gemini-2.5-flash';

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchXxlProduct(handle) {
  const url = `https://xxl-heizung.de/products/${handle}.json`;
  const res = await fetch(url, {
    headers: {
      'Cookie': 'cart_currency=EUR; localization=DE',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`xxl fetch ${url}: HTTP ${res.status}`);
  const j = await res.json();
  return j.product || j;
}

async function geminiTranslate(germanTitle, germanBodyHtml) {
  const prompt = `You are translating and cleaning up a German Shopify product page so it can be used as the canonical English description on a different storefront.

INPUT (German):
- Title: ${germanTitle}
- Body HTML (contains Elementor / WordPress markup that must be discarded):
${germanBodyHtml}

OUTPUT — return STRICT JSON with exactly these two keys:
{
  "title": "<a clean, professional English product title, 3-8 words>",
  "descriptionHtml": "<clean English HTML product description>"
}

Rules for descriptionHtml:
- Use ONLY these HTML tags: <h2>, <h3>, <p>, <ul>, <li>, <strong>. No divs, no spans, no class/style/data attributes, no Elementor markup.
- Translate every meaningful sentence to natural English. Do not transliterate German.
- Keep all technical specs (dimensions, materials, compatibility, threading like M30x1.5, BSP sizes like 1/2", etc.) verbatim where they are technical identifiers.
- Structure: optionally an <h2>What it is</h2> intro, then bullet lists for "Key features", "Specifications", or "What's in the box" as appropriate. 100-220 words total.
- Do NOT include marketing fluff, pricing, shipping promises, or links.
- Do NOT mention "xxl-heizung" or any third-party brand.
- Output ONLY the JSON object, no preamble, no markdown fences.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${GOOGLE}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  if (!text) throw new Error('Gemini returned no text');
  // The model is asked to return JSON; parse it.
  const cleaned = text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function updateProduct(productId, title, descriptionHtml) {
  const data = await gql(
    `mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }`,
    { input: { id: productId, title, descriptionHtml } },
  );
  const errs = data.productUpdate.userErrors;
  if (errs.length) throw new Error(`productUpdate: ${JSON.stringify(errs)}`);
  return data.productUpdate.product;
}

async function main() {
  console.log(`-> Backfill draft descriptions on ${STORE}${APPLY ? '' : ' [DRY RUN]'}`);

  const filter = HANDLE ? `status:DRAFT AND handle:${HANDLE}` : 'status:DRAFT';
  const data = await gql(
    `query($q: String!) { products(first: 50, query: $q) { edges { node { id handle title descriptionHtml } } } }`,
    { q: filter },
  );
  const drafts = data.products.edges.map((e) => e.node);
  console.log(`   ${drafts.length} DRAFT product(s) to process`);
  if (!drafts.length) return;

  let okCount = 0, errCount = 0;
  for (const p of drafts) {
    console.log(`\n[${p.handle}]`);
    try {
      const xxl = await fetchXxlProduct(p.handle);
      console.log(`   xxl: title="${xxl.title}", body_html=${(xxl.body_html||'').length} chars`);
      if (!xxl.body_html) { console.warn(`   ! no body_html on xxl side, skipping`); errCount++; continue; }

      const translated = await geminiTranslate(xxl.title, xxl.body_html);
      console.log(`   en title: "${translated.title}"`);
      console.log(`   en desc:  ${translated.descriptionHtml.length} chars`);
      console.log(`   preview:  ${translated.descriptionHtml.slice(0, 180).replace(/\s+/g, ' ')}…`);

      if (APPLY) {
        await updateProduct(p.id, translated.title, translated.descriptionHtml);
        console.log(`   ✓ updated on Shopify`);
      }
      okCount++;
    } catch (e) {
      console.error(`   ✗ ${e.message}`);
      errCount++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Mode:        ${APPLY ? 'LIVE' : 'DRY RUN'}`);
  console.log(`Succeeded:   ${okCount}`);
  console.log(`Failed:      ${errCount}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
