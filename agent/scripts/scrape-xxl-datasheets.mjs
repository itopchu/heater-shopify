#!/usr/bin/env node
/**
 * Scrape datasheet PDF URLs from xxl-heizung.de product pages.
 *
 * The source store hosts datasheets on its Shopify Files CDN at URLs like
 *   //xxl-heizung.de/cdn/shop/files/PDF_<Series>_<Variant>.pdf?v=<n>
 * Each product page has 0–N such links embedded inline. This script:
 *
 *   1. Reads `product-catalog/.cache/index.json` for the canonical
 *      xxl-heizung.de product URL of every handle we ship.
 *   2. Fetches each page, extracts `*.pdf` URLs, normalises them to
 *      absolute https URLs, and dedupes.
 *   3. Picks the first PDF that looks like a datasheet (handles names
 *      containing "PDF_" or "Datenblatt" or "Technische") as the
 *      primary; the rest are stored as a list for the documents block.
 *   4. Writes the result to `data/datasheets-from-xxl.json` so the
 *      attach script can read it without re-scraping.
 *
 * Usage:
 *   node agent/scripts/scrape-xxl-datasheets.mjs              # scrape all
 *   node agent/scripts/scrape-xxl-datasheets.mjs --limit 5    # debug
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

const indexPath = resolve(ROOT, 'product-catalog/.cache/index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
let products = index.products.slice(0, LIMIT);

// Resume mode: if `data/datasheets-from-xxl.json` already exists, skip the
// products that already have a primary_pdf_url and only re-scrape the
// failures. Pass --force to re-scrape everything.
const FORCE = process.argv.includes('--force');
const existingPath = resolve(ROOT, 'data/datasheets-from-xxl.json');
const existingByHandle = new Map();
if (!FORCE && existsSync(existingPath)) {
  const prior = JSON.parse(readFileSync(existingPath, 'utf8'));
  for (const p of prior.products ?? []) {
    if (p.primary_pdf_url) existingByHandle.set(p.handle, p);
  }
  console.log(`Resume mode: ${existingByHandle.size} products already have a PDF, skipping those.`);
}

const PDF_RE = /(?:href=["']|src=["']|"|')((?:https?:)?\/\/[^"'\s)]*\.pdf(?:\?[^"'\s)]*)?)/gi;

function absolutise(url) {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  return null;
}

function isLikelyDatasheet(url) {
  // xxl uses PDF_<Series>.pdf, Datenblatt_*, *Technische* — pick those first.
  const u = url.toLowerCase();
  return /pdf_/i.test(u) || /datenblatt/i.test(u) || /technische/i.test(u);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url, attempt = 1) {
  // Pace requests so the source server doesn't 429 us. xxl-heizung.de
  // tolerates ~1 req/s comfortably.
  await sleep(900 + Math.floor(Math.random() * 400));
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; gberg-datasheet-scraper/1.0)',
      'Accept': 'text/html',
    },
  });
  if (res.status === 429) {
    if (attempt > 5) throw new Error(`HTTP 429 after ${attempt} attempts`);
    const wait = Math.min(60_000, 2_000 * 2 ** attempt);
    console.log(`    (429, sleeping ${wait}ms then retry ${attempt + 1})`);
    await sleep(wait);
    return fetchHtml(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

const out = [];
let withPdf = 0;
let withoutPdf = 0;

for (let i = 0; i < products.length; i++) {
  const p = products[i];
  process.stdout.write(`[${i + 1}/${products.length}] ${p.handle} ... `);
  // Resume: keep existing successful entries verbatim.
  const prior = existingByHandle.get(p.handle);
  if (prior) {
    out.push(prior);
    withPdf++;
    console.log(`(cached: ${prior.primary_pdf_url})`);
    continue;
  }
  try {
    const html = await fetchHtml(p.url);
    const found = new Set();
    let m;
    PDF_RE.lastIndex = 0;
    while ((m = PDF_RE.exec(html)) != null) {
      const abs = absolutise(m[1]);
      if (abs && abs.toLowerCase().endsWith('.pdf') === false && abs.includes('.pdf')) {
        // Strip query for dedup but keep original for storage.
        found.add(abs);
      } else if (abs) {
        found.add(abs);
      }
    }
    // Filter: keep only PDFs hosted on xxl-heizung.de or its Shopify CDN
    // (the site links to lots of unrelated PDFs in scripts otherwise).
    const candidates = [...found].filter((u) => /xxl-heizung\.de|cdn\.shopify/i.test(u));
    const sheets = candidates.filter(isLikelyDatasheet);
    const primary = sheets[0] ?? candidates[0] ?? null;

    if (primary) {
      withPdf++;
      console.log(`✓ ${primary}`);
    } else {
      withoutPdf++;
      console.log(`(none)`);
    }

    out.push({
      handle: p.handle,
      source_url: p.url,
      primary_pdf_url: primary,
      all_pdfs: candidates,
    });
  } catch (err) {
    console.log(`✗ ${err.message}`);
    out.push({
      handle: p.handle,
      source_url: p.url,
      primary_pdf_url: null,
      all_pdfs: [],
      error: err.message,
    });
  }
}

const outPath = resolve(ROOT, 'data/datasheets-from-xxl.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      _doc: 'Datasheet PDF URLs scraped from each product page on xxl-heizung.de. Read by prod-attach-datasheets.mjs to set the media.primary_pdf_url metafield on G-Berg products.',
      _generated: new Date().toISOString(),
      products: out,
    },
    null,
    2,
  ),
);

console.log(`\n=== Summary ===`);
console.log(`with primary PDF:    ${withPdf}`);
console.log(`without primary PDF: ${withoutPdf}`);
console.log(`written to:          ${outPath}`);
