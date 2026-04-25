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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { sanitizeBodyHtml, sanitizeShortText } from './sanitize-body.js';
import type { SyncReport } from './types.js';

interface CliFlags {
  dryRun: boolean;
  limit: number | null;
  onlyCollection: string | null;
  forceImages: boolean;
  source: 'live' | 'local';
  catalogPath: string | null;
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

  let source: 'live' | 'local' = 'live';
  const srcIdx = argv.indexOf('--source');
  if (srcIdx >= 0) {
    const v = argv[srcIdx + 1];
    if (v !== 'live' && v !== 'local') throw new Error(`--source must be "live" or "local"`);
    source = v;
  }

  let catalogPath: string | null = null;
  const cpIdx = argv.indexOf('--catalog-path');
  if (cpIdx >= 0) {
    catalogPath = argv[cpIdx + 1] || null;
  }

  return { dryRun, limit, onlyCollection, forceImages, source, catalogPath };
}

/**
 * Local-source loader: reads data/catalog/gberg-catalog.json and returns
 * NormalizedProduct[] directly (no xxl HTTP, no normalize() pass — the catalog
 * file is already the normalized shape). Mirrors what `normalize(fetched)` would
 * produce. EN fields stay as the file has them ("(EN translation pending)" by
 * default — translate.ts will fill on demand if reachable).
 */
function loadLocalCatalog(catalogPath: string): {
  normalized: import('./types.js').NormalizedProduct[];
  totalProducts: number;
} {
  const raw = readFileSync(catalogPath, 'utf8');
  const catalog = JSON.parse(raw) as {
    products: Array<import('./types.js').NormalizedProduct>;
  };
  // SECURITY: the local catalog file is checked into the repo but its
  // bodyHtml{De,En} fields originate from the LLM translator (which echoed
  // upstream xxl HTML). Sanitize on load so we never trust disk contents
  // either — the same allowlist that protects the live path applies here.
  // Also strip "(EN translation pending)" sentinels so write.ts falls back
  // to DE rather than writing the placeholder into Shopify.
  const normalized = catalog.products.map((p) => {
    const titleEn = p.titleEn === '(EN translation pending)' ? '' : sanitizeShortText(p.titleEn);
    const titleDe = sanitizeShortText(p.titleDe);
    const bodyHtmlEn = p.bodyHtmlEn === '(EN translation pending)' ? '' : sanitizeBodyHtml(p.bodyHtmlEn);
    const bodyHtmlDe = sanitizeBodyHtml(p.bodyHtmlDe);
    const customMetafields = (p.customMetafields || []).map((m) => {
      // Only string-valued text metafields can carry HTML; JSON-encoded
      // values (specs, dimensions) are written by normalize() which already
      // sanitized their inputs. Re-sanitizing JSON would corrupt it, so
      // we only touch the plain text_field types.
      if (m.type === 'single_line_text_field' || m.type === 'multi_line_text_field') {
        return { ...m, value: sanitizeShortText(m.value) };
      }
      return m;
    });
    const faqs = (p.faqs || [])
      .map((f) => ({
        question: sanitizeShortText(f.question),
        answer: sanitizeBodyHtml(f.answer),
      }))
      .filter((f) => f.question && f.answer);
    return {
      ...p,
      titleEn,
      titleDe: titleDe || p.titleDe,
      bodyHtmlEn,
      bodyHtmlDe,
      customMetafields,
      faqs,
    };
  });
  return { normalized, totalProducts: normalized.length };
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

  console.log(`[sync] store=${cfg.storeKey} domain=${cfg.shopifyStore} dry=${flags.dryRun} limit=${flags.limit ?? '∞'} onlyCollection=${flags.onlyCollection ?? '(all)'} source=${flags.source}`);
  const startedAt = new Date().toISOString();

  let normalized: import('./types.js').NormalizedProduct[];
  let totalsFromSource: number;

  if (flags.source === 'local') {
    // 1+3 (local). Read pre-normalized catalog from disk.
    const path = flags.catalogPath
      ? resolve(process.cwd(), flags.catalogPath)
      : resolve(process.cwd(), 'data', 'catalog', 'gberg-catalog.json');
    console.log(`[sync] reading local catalog ${path}`);
    const local = loadLocalCatalog(path);
    let products = local.normalized;
    if (flags.onlyCollection) {
      products = products.filter((p) => p.collectionHandles.includes(flags.onlyCollection!));
    }
    if (flags.limit != null) products = products.slice(0, flags.limit);
    console.log(`[sync] local catalog: ${products.length} product(s) after filter/limit (of ${local.totalProducts})`);
    normalized = products;
    totalsFromSource = local.totalProducts;
  } else {
    // 1. xxl fetch ------------------------------------------------------------
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
    totalsFromSource = productsInScope.length;

    // 2. load our store -------------------------------------------------------
    console.log(`[sync] loading products from our store (for handle collision check)`);
    const ourProductsForHandles = await loadStoreProducts(cfg);
    const existingHandles = new Set(ourProductsForHandles.map((p) => p.handle));

    // 3. normalize ------------------------------------------------------------
    normalized = truncated.map((p) =>
      normalize(p, { existingHandles, productCollections: productColIndex }),
    );
  }

  // 2 (shared). Re-load store products for diff (cheap; one extra paginated query in local mode).
  console.log(`[sync] loading products from our store`);
  const ourProducts = await loadStoreProducts(cfg);

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
        // SECURITY: the LLM may echo attacker-controlled HTML from the DE body
        // into the EN body. Sanitize before it reaches descriptionHtml writes.
        entry.payload.titleEn = sanitizeShortText(t.titleEn);
        entry.payload.bodyHtmlEn = sanitizeBodyHtml(t.bodyHtmlEn);
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
    totalsFromXxl: totalsFromSource,
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
