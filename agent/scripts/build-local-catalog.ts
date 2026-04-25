/**
 * build-local-catalog.ts
 *
 * Phase 1 of the catalog rebuild: scrape xxl-heizung.de and persist a clean
 * local catalog file that becomes OUR asset. Two artefacts:
 *
 *   data/catalog/xxl-snapshot-YYYY-MM-DD.json   raw scrape (collections + per-product JSON)
 *   data/catalog/gberg-catalog.json             normalized push-ready catalog
 *
 * Usage:
 *   tsx agent/scripts/build-local-catalog.ts
 *   tsx agent/scripts/build-local-catalog.ts --date 2026-04-25   # override snapshot stamp
 *   tsx agent/scripts/build-local-catalog.ts --limit 5           # only first 5 products (debug)
 *
 * No Shopify writes happen here. No Claude / Gemini calls — EN translations
 * are stubbed with "(EN translation pending)" so this script is free + offline-
 * for-LLM (still needs xxl HTTP). A separate translate step can fill EN later.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../sync/env.js';
import {
  fetchAllCollections,
  fetchAllProducts,
  buildProductCollectionIndex,
} from '../sync/fetch-xxl.js';
import { normalize } from '../sync/normalize.js';
import { mapXxlCollectionHandle } from '../sync/collection-map.js';
import type { XxlCollection, XxlProduct, NormalizedProduct } from '../sync/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = resolve(__dirname, '..', '..', 'data', 'catalog');

interface Cli {
  dateStamp: string;
  limit: number | null;
}

function parseCli(argv: string[]): Cli {
  let dateStamp = new Date().toISOString().slice(0, 10);
  const dIdx = argv.indexOf('--date');
  if (dIdx >= 0) {
    const v = argv[dIdx + 1];
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`--date must be YYYY-MM-DD`);
    dateStamp = v;
  }
  let limit: number | null = null;
  const lIdx = argv.indexOf('--limit');
  if (lIdx >= 0) {
    const n = Number(argv[lIdx + 1]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--limit must be a non-negative integer`);
    limit = n;
  }
  return { dateStamp, limit };
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

interface SnapshotFile {
  scrapedAt: string;
  source: string;
  collections: XxlCollection[];
  products: XxlProduct[];
  productCollectionIndex: Array<{ productId: number; xxlCollectionHandles: string[] }>;
}

interface CatalogProduct {
  xxlId: number;
  xxlHandle: string;
  handle: string;
  titleDe: string;
  titleEn: string;
  bodyHtmlDe: string;
  bodyHtmlEn: string;
  vendor: string;
  productType: string;
  tags: string[];
  options: NormalizedProduct['options'];
  variants: NormalizedProduct['variants'];
  sourceImageUrls: string[];
  collectionHandles: string[];
  customMetafields: NormalizedProduct['customMetafields'];
  faqs: NormalizedProduct['faqs'];
}

interface CatalogFile {
  builtAt: string;
  builderVersion: string;
  source: string;
  totalProducts: number;
  totalCollectionsMirrored: number;
  notes: {
    enTranslation: string;
    images: string;
  };
  collections: Array<{ handle: string; title: string; description: string }>;
  products: CatalogProduct[];
}

const EN_PLACEHOLDER = '(EN translation pending)';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cli = parseCli(argv);
  // We pass --store dev so loadConfig finds the dev creds, but we never
  // actually hit Shopify here — this is read-only to xxl + write to disk.
  if (!argv.includes('--store')) argv.push('--store', 'dev');
  const cfg = loadConfig(argv);

  ensureDir(CATALOG_DIR);

  console.log(`[catalog] scraping ${cfg.xxlBaseUrl}`);
  const collections = await fetchAllCollections(cfg);
  console.log(`[catalog]   collections: ${collections.length}`);

  let products = await fetchAllProducts(cfg);
  console.log(`[catalog]   products:    ${products.length}`);

  if (cli.limit != null) {
    products = products.slice(0, cli.limit);
    console.log(`[catalog]   limited to ${products.length} for this run`);
  }

  console.log(`[catalog] building product→collection index (${collections.length} collections)`);
  const xxlIndex = await buildProductCollectionIndex(cfg, collections);
  console.log(`[catalog]   indexed ${xxlIndex.size} products across collections`);

  // 1. Persist raw snapshot ----------------------------------------------------
  const snapshot: SnapshotFile = {
    scrapedAt: new Date().toISOString(),
    source: cfg.xxlBaseUrl,
    collections,
    products,
    productCollectionIndex: Array.from(xxlIndex.entries()).map(([productId, xxlCollectionHandles]) => ({
      productId,
      xxlCollectionHandles,
    })),
  };
  const snapshotPath = resolve(CATALOG_DIR, `xxl-snapshot-${cli.dateStamp}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  const snapshotKb = Math.round(readFileSync(snapshotPath).length / 1024);
  console.log(`[catalog] wrote snapshot ${snapshotPath} (${snapshotKb} KiB)`);

  // 2. Normalize → push-ready catalog ------------------------------------------
  // Map xxl collection handles → ours (drops merch-only handles like frontpage).
  const ourCollectionIndex = new Map<number, string[]>();
  for (const [pid, xxlHandles] of xxlIndex) {
    const mapped = xxlHandles
      .map(mapXxlCollectionHandle)
      .filter((h): h is string => h !== null);
    ourCollectionIndex.set(pid, Array.from(new Set(mapped)));
  }

  // Existing handles set is empty: this is "OUR catalog from scratch", we
  // intentionally keep the upstream xxl handle so URLs are stable + clean.
  const existingHandles = new Set<string>();

  const catalogProducts: CatalogProduct[] = products.map((p) => {
    const n = normalize(p, { existingHandles, productCollections: ourCollectionIndex });
    return {
      xxlId: n.xxlId,
      xxlHandle: n.xxlHandle,
      handle: n.handle,
      titleDe: n.titleDe,
      titleEn: EN_PLACEHOLDER,
      bodyHtmlDe: n.bodyHtmlDe,
      bodyHtmlEn: EN_PLACEHOLDER,
      vendor: n.vendor,
      productType: n.productType,
      tags: n.tags,
      options: n.options,
      variants: n.variants,
      sourceImageUrls: n.sourceImageUrls,
      collectionHandles: n.collectionHandles,
      customMetafields: n.customMetafields,
      faqs: n.faqs,
    };
  });

  // Filter the collections list to only those mirrored downstream.
  const mirroredHandles = new Set<string>();
  for (const cp of catalogProducts) for (const ch of cp.collectionHandles) mirroredHandles.add(ch);
  const mirroredCollections = collections
    .filter((c) => mapXxlCollectionHandle(c.handle) != null)
    .map((c) => ({
      handle: mapXxlCollectionHandle(c.handle)!,
      title: c.title,
      description: c.description ?? '',
    }));

  const catalog: CatalogFile = {
    builtAt: new Date().toISOString(),
    builderVersion: '1',
    source: cfg.xxlBaseUrl,
    totalProducts: catalogProducts.length,
    totalCollectionsMirrored: mirroredCollections.length,
    notes: {
      enTranslation: `Stubbed with "${EN_PLACEHOLDER}" — run translate step before launch.`,
      images: 'sourceImageUrls are xxl CDN URLs. NEVER upload to Shopify; for AI regen reference only.',
    },
    collections: mirroredCollections,
    products: catalogProducts,
  };
  const catalogPath = resolve(CATALOG_DIR, 'gberg-catalog.json');
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  const catalogKb = Math.round(readFileSync(catalogPath).length / 1024);
  console.log(`[catalog] wrote catalog  ${catalogPath} (${catalogKb} KiB)`);

  // Summary -------------------------------------------------------------------
  const productsWithoutCollection = catalogProducts.filter((p) => p.collectionHandles.length === 0);
  const productsWithoutImages = catalogProducts.filter((p) => p.sourceImageUrls.length === 0);
  console.log(`[catalog] summary:`);
  console.log(`  · products:                 ${catalogProducts.length}`);
  console.log(`  · mirrored collections:     ${mirroredCollections.length}`);
  console.log(`  · products w/o collection:  ${productsWithoutCollection.length}`);
  console.log(`  · products w/o source imgs: ${productsWithoutImages.length}`);
  console.log(`[catalog] done.`);
}

main().catch((err) => {
  console.error(`[catalog] FATAL: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});
