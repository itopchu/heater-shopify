/**
 * Catalog sync orchestrator.
 *
 * Usage:
 *   npm run sync -- --store dev --dry-run --limit 5
 *   npm run sync -- --store dev --limit 10 --only-collection badheizkoerper
 *   npm run sync -- --store dev --force-images       # bypass image manifest cache
 *
 * Flow:
 *   1. Load config from env + CLI flags
 *   2. Fetch xxl collections + products (public JSON)
 *   3. Index which xxl collection each product belongs to
 *   4. Load our current store products (for diff)
 *   5. Normalize xxl → internal model
 *   6. Compute diff (CREATE / UPDATE / ARCHIVE / UNCHANGED)
 *   7. Translate DE → EN (cached per-text-hash)
 *   8. Regenerate images (cached per source URL, capped per run)
 *   9. Apply diff to store (unless --dry-run)
 *  10. Emit sync-reports/YYYY-MM-DD-hhmm.json
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from './env.js';
import {
  fetchAllCollections,
  buildProductCollectionIndex,
  fetchAllProducts,
  fetchProductsInCollection,
} from './fetch-xxl.js';
import { normalize } from './normalize.js';
import { translateProduct } from './translate.js';
import { regenerateImagesForProduct, type ImageResult, type ImageRunStats } from './images.js';
import { loadStoreProducts, computeDiff } from './diff.js';
import { applyEntry } from './write.js';
import { mapXxlCollectionHandle } from './collection-map.js';
import type { SyncReport } from './types.js';

interface CliFlags {
  dryRun: boolean;
  limit: number | null;
  onlyCollection: string | null;
  forceImages: boolean;
}

function parseCli(argv: string[], dryRunDefault: boolean): CliFlags {
  const hasDryRun = argv.includes('--dry-run');
  const hasNoDryRun = argv.includes('--no-dry-run');
  const dryRun = hasNoDryRun ? false : hasDryRun || dryRunDefault;

  let limit: number | null = null;
  const limIdx = argv.indexOf('--limit');
  if (limIdx >= 0) {
    const n = Number(argv[limIdx + 1]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--limit must be a non-negative integer`);
    limit = n;
  }

  let onlyCollection: string | null = null;
  const ocIdx = argv.indexOf('--only-collection');
  if (ocIdx >= 0) {
    onlyCollection = argv[ocIdx + 1] || null;
  }

  const forceImages = argv.includes('--force-images');
  return { dryRun, limit, onlyCollection, forceImages };
}

function emitReport(report: SyncReport): string {
  const dir = resolve(process.cwd(), 'sync-reports');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const path = resolve(dir, `${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cfg = loadConfig(argv);
  const flags = parseCli(argv, cfg.dryRunDefault);

  console.log(`[sync] store=${cfg.storeKey} domain=${cfg.shopifyStore} dry=${flags.dryRun} limit=${flags.limit ?? '∞'} onlyCollection=${flags.onlyCollection ?? '(all)'}`);
  const startedAt = new Date().toISOString();

  // 1. xxl fetch ---------------------------------------------------------------
  console.log(`[sync] fetching collections from ${cfg.xxlBaseUrl}`);
  const collections = await fetchAllCollections(cfg);
  const filteredCollections = flags.onlyCollection
    ? collections.filter((c) => c.handle === flags.onlyCollection)
    : collections;
  console.log(`[sync] ${filteredCollections.length} collection(s) in scope`);

  let productsInScope;
  let productColIndex;
  if (flags.onlyCollection) {
    console.log(`[sync] fetching products in collection "${flags.onlyCollection}"`);
    productsInScope = await fetchProductsInCollection(cfg, flags.onlyCollection);
    productColIndex = new Map<number, string[]>();
    for (const p of productsInScope) productColIndex.set(p.id, [flags.onlyCollection]);
  } else {
    console.log(`[sync] fetching all products`);
    productsInScope = await fetchAllProducts(cfg);
    productColIndex = await buildProductCollectionIndex(cfg, filteredCollections);
    // Translate xxl collection handles → ours (drops unmapped handles like frontpage/bestseller).
    for (const [id, xxlHandles] of productColIndex) {
      const mapped = xxlHandles.map(mapXxlCollectionHandle).filter((h): h is string => h !== null);
      productColIndex.set(id, mapped);
    }
  }

  const truncated = flags.limit != null ? productsInScope.slice(0, flags.limit) : productsInScope;
  console.log(`[sync] ${truncated.length} product(s) after limit/filter`);

  // 2. load our store ----------------------------------------------------------
  console.log(`[sync] loading products from our store`);
  const ourProducts = await loadStoreProducts(cfg);
  const existingHandles = new Set(ourProducts.map((p) => p.handle));

  // 3. normalize ---------------------------------------------------------------
  const normalized = truncated.map((p) =>
    normalize(p, { existingHandles, productCollections: productColIndex }),
  );

  // 4. diff --------------------------------------------------------------------
  const diff = computeDiff(normalized, ourProducts);
  const counts = { CREATE: 0, UPDATE: 0, ARCHIVE: 0, UNCHANGED: 0 };
  for (const e of diff) counts[e.action]++;
  console.log(`[sync] diff: CREATE=${counts.CREATE} UPDATE=${counts.UPDATE} ARCHIVE=${counts.ARCHIVE} UNCHANGED=${counts.UNCHANGED}`);
  for (const e of diff) console.log(`  · ${e.summary}`);

  // Image budget guard: project cost before generating anything.
  // Gemini pricing (April 2026, subject to change):
  //   - gemini-2.5-flash-image   ≈ $0.039 / image (~1290 output tokens @ $30/M)
  //   - gemini-3-pro-image-preview (Nano Banana Pro) ≈ $0.12–$0.20 / image
  // Pick a conservative estimate based on the selected model.
  const perImageUsd = cfg.geminiImageModel.includes('pro') ? 0.15 : 0.04;
  const writeActions = counts.CREATE + counts.UPDATE;
  const avgImagesPerProduct = 3;
  const projectedImages = Math.min(writeActions * avgImagesPerProduct, cfg.imageGenCap);
  const projectedCostUsd = projectedImages * perImageUsd;
  const BUDGET_HARD_CAP_USD = 10;
  const allowLarge = process.env.ALLOW_LARGE_IMAGE_RUN === '1';
  console.log(`[sync] image budget projection: ~${projectedImages} images × $${perImageUsd.toFixed(2)} ≈ $${projectedCostUsd.toFixed(2)} (model=${cfg.geminiImageModel}, cap=${cfg.imageGenCap})`);
  if (!flags.dryRun && projectedCostUsd > BUDGET_HARD_CAP_USD && !allowLarge) {
    console.error(`[sync] ABORT: projected image cost $${projectedCostUsd.toFixed(2)} exceeds $${BUDGET_HARD_CAP_USD} safety cap. Re-run with ALLOW_LARGE_IMAGE_RUN=1 env var if intentional, or lower --limit / IMAGE_GEN_CAP.`);
    process.exit(2);
  }

  // 5. translate + image regen + apply -----------------------------------------
  const imageStats: ImageRunStats = { generated: 0, skippedCached: 0, capHit: false };
  const errors: SyncReport['errors'] = [];

  for (const entry of diff) {
    if (!entry.payload) {
      // ARCHIVE
      if (!flags.dryRun) {
        try {
          await applyEntry(cfg, entry, []);
        } catch (err) {
          errors.push({ handle: '(archived)', phase: 'apply', message: (err as Error).message });
        }
      }
      continue;
    }

    const handle = entry.payload.handle;
    let images: ImageResult[] = [];

    if (entry.action === 'CREATE' || entry.action === 'UPDATE') {
      // Translate DE → EN.
      try {
        const t = await translateProduct(entry.payload);
        entry.payload.titleEn = t.titleEn;
        entry.payload.bodyHtmlEn = t.bodyHtmlEn;
      } catch (err) {
        errors.push({ handle, phase: 'translate', message: (err as Error).message });
      }

      // Regenerate images.
      try {
        images = await regenerateImagesForProduct(cfg, entry.payload, imageStats, flags.dryRun);
      } catch (err) {
        errors.push({ handle, phase: 'images', message: (err as Error).message });
      }
    }

    if (flags.dryRun) continue;

    // Apply.
    try {
      await applyEntry(cfg, entry, images);
    } catch (err) {
      errors.push({ handle, phase: 'apply', message: (err as Error).message });
    }
  }

  // 6. emit report -------------------------------------------------------------
  const report: SyncReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: flags.dryRun,
    limit: flags.limit,
    totalsFromXxl: productsInScope.length,
    totalsInStore: ourProducts.length,
    actions: counts,
    imagesGenerated: imageStats.generated,
    imagesSkippedCached: imageStats.skippedCached,
    imagesCapHit: imageStats.capHit,
    errors,
  };
  const reportPath = emitReport(report);
  console.log(`[sync] report: ${reportPath}`);
  console.log(`[sync] done. errors=${errors.length}`);
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[sync] FATAL: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});
