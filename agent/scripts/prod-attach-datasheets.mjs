#!/usr/bin/env node
/**
 * Replace the placeholder `media.primary_pdf_url` values (which are local
 * paths like "catalog/Flora Vertikal/PDF.pdf") with live xxl-heizung.de
 * Datenblatt URLs based on the series the product belongs to. Each
 * candidate URL is HEAD-checked before write — never store a 404.
 *
 * Usage:
 *   node agent/scripts/prod-attach-datasheets.mjs            # dry-run
 *   node agent/scripts/prod-attach-datasheets.mjs --apply    # actually write
 */
import { existsSync, readFileSync } from 'node:fs';
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
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_STORE / _ADMIN_TOKEN');

const APPLY = process.argv.includes('--apply');

// xxl-heizung.de hosts datasheets at /Datenblatt/<Series>.pdf. The series
// names map roughly 1:1 to product family names; the keys below are
// substrings we look for (lowercased) in the existing placeholder path
// or, if no placeholder is set, in the product title.
const SERIES_TO_PDF = {
  flora: 'https://xxl-heizung.de/Datenblatt/Flora.pdf',
  astoria: 'https://xxl-heizung.de/Datenblatt/Astoria.pdf',
  pullman: 'https://xxl-heizung.de/Datenblatt/Pullman.pdf',
  twister: 'https://xxl-heizung.de/Datenblatt/Twister.pdf',
  elanor: 'https://xxl-heizung.de/Datenblatt/Elanor.pdf',
  konrad: 'https://xxl-heizung.de/Datenblatt/Konrad.pdf',
  platis: 'https://xxl-heizung.de/Datenblatt/Platis.pdf',
  lavinno: 'https://xxl-heizung.de/Datenblatt/Lavinno.pdf',
  // Common product families on xxl-heizung that don't share a name with
  // the Hydrogen storefront's series taxonomy:
  atlas: 'https://xxl-heizung.de/Datenblatt/Atlas.pdf',
  alpha: 'https://xxl-heizung.de/Datenblatt/Alpha.pdf',
  mira: 'https://xxl-heizung.de/Datenblatt/Mira.pdf',
  milan: 'https://xxl-heizung.de/Datenblatt/Milan.pdf',
};

async function gql(query, variables = {}) {
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
            title
            existing: metafield(namespace:"media", key:"primary_pdf_url"){ value }
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

function pickSeries(p) {
  const haystacks = [
    p.existing?.value || '',
    p.title || '',
    p.handle || '',
  ].map((s) => s.toLowerCase());
  for (const [needle, url] of Object.entries(SERIES_TO_PDF)) {
    for (const h of haystacks) {
      if (h.includes(needle)) return { series: needle, url };
    }
  }
  return null;
}

const headCache = new Map();
async function headOk(url) {
  if (headCache.has(url)) return headCache.get(url);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'gberg-datasheet-checker/1.0' },
    });
    const ok = res.ok && (res.headers.get('content-type') || '').toLowerCase().includes('pdf');
    // Fallback: some webservers return 200 with text/html on HEAD even
    // though the URL serves a PDF on GET. Accept any 2xx if the URL
    // already ends in .pdf.
    const okLoose = res.ok && url.toLowerCase().endsWith('.pdf');
    headCache.set(url, ok || okLoose);
    return ok || okLoose;
  } catch (err) {
    headCache.set(url, false);
    return false;
  }
}

async function setPrimaryPdf(productId, url) {
  const d = await gql(
    `mutation($m:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$m){ userErrors{ field message } }
    }`,
    {
      m: [
        {
          ownerId: productId,
          namespace: 'media',
          key: 'primary_pdf_url',
          type: 'url',
          value: url,
        },
      ],
    },
  );
  const errs = d.metafieldsSet.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
const products = await listProducts();
console.log(`Total products: ${products.length}`);

let changed = 0;
let kept = 0;
let unmatched = 0;

for (const p of products) {
  const matched = pickSeries(p);
  // Skip if existing value is already a live URL — don't clobber.
  if (p.existing?.value && /^https?:\/\//i.test(p.existing.value)) {
    kept++;
    console.log(`  [keep ] ${p.handle} -> ${p.existing.value}`);
    continue;
  }
  if (!matched) {
    unmatched++;
    console.log(`  [skip ] ${p.handle} (no series match in placeholder/title/handle)`);
    continue;
  }
  const ok = await headOk(matched.url);
  if (!ok) {
    unmatched++;
    console.log(`  [404  ] ${p.handle} -> ${matched.url}`);
    continue;
  }
  console.log(`  [write] ${p.handle} -> ${matched.url}  (was: ${p.existing?.value ?? 'unset'})`);
  if (APPLY) await setPrimaryPdf(p.id, matched.url);
  changed++;
}

console.log(`\n=== Summary ===`);
console.log(`changed (would change): ${changed}`);
console.log(`already-live:           ${kept}`);
console.log(`unmatched / 404:        ${unmatched}`);
