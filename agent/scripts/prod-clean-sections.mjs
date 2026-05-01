#!/usr/bin/env node
/**
 * Deduplicate and denoise the `content.sections_en` and `content.sections_de`
 * metafields on every prod product.
 *
 * Issues found in the wild after the DE→EN translation pass:
 *   - Same Q&A appearing twice (named_section + collapsible Elementor widgets
 *     captured the same content).
 *   - "FAQ - Frequently Asked Questions" rendered as a section with the same
 *     string as both title and body.
 *   - "Sign up now and never miss any news!" newsletter widget captured as a
 *     section.
 *   - Section bodies that begin by restating the section title verbatim.
 *
 * Strategy:
 *   1. Drop sections whose title matches a noise-list (newsletter, header-only
 *      "FAQ" markers, etc.).
 *   2. If a section's body is just the title or a near-empty repeat, drop it.
 *   3. Strip a leading copy of the title from the body when present.
 *   4. Deduplicate by normalised title (lowercased, punctuation-stripped) —
 *      keep the first occurrence; merge longer body if the duplicate has more.
 *
 * Usage:
 *   node agent/scripts/prod-clean-sections.mjs              # dry-run, all
 *   node agent/scripts/prod-clean-sections.mjs --apply
 *   node agent/scripts/prod-clean-sections.mjs --handle X --apply
 */
import { readFileSync } from 'node:fs';
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
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');

const APPLY = process.argv.includes('--apply');
const HANDLE = (() => {
  const i = process.argv.indexOf('--handle');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const NOISE_TITLES = [
  /^sign up( now)?\b/i,
  /^subscribe to/i,
  /^newsletter/i,
  /^never miss/i,
  /^FAQ\s*[-—:]?\s*(frequently asked|häufig gestellte)/i,
  /^FAQs?$/i,
  /^Häufig gestellte Fragen$/i,
  /^Frequently Asked Questions?$/i,
];

function normTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoiseTitle(title) {
  return NOISE_TITLES.some((re) => re.test((title || '').trim()));
}

function bodyEqualsTitle(title, text) {
  const a = normTitle(title);
  const b = normTitle(text);
  if (!a || !b) return false;
  if (a === b) return true;
  // body is just title with trailing punctuation
  if (b.length < 30 && b.startsWith(a)) return true;
  return false;
}

function stripLeadingTitleEcho(title, text) {
  if (!title || !text) return text;
  const t = text.trimStart();
  // If body starts with the title (verbatim or with trailing ?), strip that
  // line and a following blank line.
  const titleLine = title.trim();
  if (t.startsWith(titleLine)) {
    return t
      .slice(titleLine.length)
      .replace(/^[\s\?]+/, '')
      .replace(/^\n+/, '');
  }
  return text;
}

function clean(sections) {
  if (!Array.isArray(sections)) return [];
  const seen = new Map(); // normTitle -> index in out
  const out = [];
  for (const s of sections) {
    const title = (s.title || '').trim();
    const text = (s.text || '').trim();
    const html = (s.html || '').trim();
    if (isNoiseTitle(title)) continue;
    if (bodyEqualsTitle(title, text)) continue;
    const cleanedText = stripLeadingTitleEcho(title, text);
    if (!cleanedText && !html) continue;
    const key = normTitle(title);
    if (!key) {
      out.push({ ...s, text: cleanedText });
      continue;
    }
    if (seen.has(key)) {
      // Merge: keep the entry whose text is longer.
      const idx = seen.get(key);
      if (cleanedText.length > (out[idx].text || '').length) {
        out[idx] = { ...s, text: cleanedText };
      }
      continue;
    }
    const cleaned = { ...s, text: cleanedText };
    seen.set(key, out.length);
    out.push(cleaned);
  }
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
    const d = await gql(
      `query($c:String){
        products(first:50, after:$c){
          pageInfo{ hasNextPage endCursor }
          nodes{
            id
            handle
            sectionsEn: metafield(namespace:"content", key:"sections_en"){ id value }
            sectionsDe: metafield(namespace:"content", key:"sections_de"){ id value }
          }
        }
      }`,
      { c: cursor },
    );
    out.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

async function setMetafield(productId, key, jsonValue) {
  const d = await gql(
    `mutation($m:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$m){ userErrors{ field message } }
    }`,
    {
      m: [
        {
          ownerId: productId,
          namespace: 'content',
          key,
          type: 'json',
          value: jsonValue,
        },
      ],
    },
  );
  const errs = d.metafieldsSet.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
let products = await listProducts();
if (HANDLE) products = products.filter((p) => p.handle === HANDLE);
console.log(`Scanning ${products.length} products...`);

let totalEnDropped = 0;
let totalDeDropped = 0;
let touched = 0;

for (const p of products) {
  const enRaw = p.sectionsEn?.value ? JSON.parse(p.sectionsEn.value) : null;
  const deRaw = p.sectionsDe?.value ? JSON.parse(p.sectionsDe.value) : null;
  const enClean = enRaw ? clean(enRaw) : null;
  const deClean = deRaw ? clean(deRaw) : null;
  const enDelta = enRaw ? enRaw.length - (enClean?.length ?? 0) : 0;
  const deDelta = deRaw ? deRaw.length - (deClean?.length ?? 0) : 0;
  if (enDelta === 0 && deDelta === 0) continue;
  touched++;
  totalEnDropped += enDelta;
  totalDeDropped += deDelta;
  console.log(`  ${p.handle}  EN ${enRaw?.length ?? 0}→${enClean?.length ?? 0}  DE ${deRaw?.length ?? 0}→${deClean?.length ?? 0}`);
  if (APPLY) {
    if (enRaw && enDelta > 0) await setMetafield(p.id, 'sections_en', JSON.stringify(enClean));
    if (deRaw && deDelta > 0) await setMetafield(p.id, 'sections_de', JSON.stringify(deClean));
  }
}

console.log(`\n=== Summary ===`);
console.log(`products touched: ${touched}`);
console.log(`EN sections dropped: ${totalEnDropped}`);
console.log(`DE sections dropped: ${totalDeDropped}`);
