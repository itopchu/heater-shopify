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
  enrichFrom: 'dev' | 'prod' | null;
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
  // --enrich-from=dev | --enrich-from=prod  (also accepts space form)
  let enrichFrom: 'dev' | 'prod' | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let v: string | undefined;
    if (a.startsWith('--enrich-from=')) v = a.slice('--enrich-from='.length);
    else if (a === '--enrich-from') v = argv[i + 1];
    if (v == null) continue;
    if (v !== 'dev' && v !== 'prod') {
      throw new Error(`--enrich-from must be "dev" or "prod" (got ${JSON.stringify(v)})`);
    }
    enrichFrom = v;
  }
  return { dateStamp, limit, enrichFrom };
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

// ---------------------------------------------------------------------------
// Shopify enrichment (read-only). Uses loadConfig's resolved store creds —
// matches the convention in agent/scripts/wipe-catalog.mjs but typed.
// ---------------------------------------------------------------------------

interface ShopifyEnrichment {
  id: string;
  handle: string;
  titleEn: string;
  bodyHtmlEn: string;
  storeXxlSourceId: number | null;
  deTitleTranslation: string | null;
  deBodyTranslation: string | null;
}

interface EnrichmentSummary {
  matched: number;
  missing: string[];
  deTitleDrift: string[];
  deBodyDrift: string[];
  xxlIdDrift: string[];
}

async function shopifyGraphql(
  endpoint: string,
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<any> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: any; errors?: unknown };
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch products by handle, batched. Shopify supports `query: "handle:a OR handle:b"`
 * on the products connection. We chunk handles into pages of 50 to keep query
 * length and result set under typical limits.
 */
async function fetchProductsByHandles(
  endpoint: string,
  token: string,
  handles: string[],
): Promise<Map<string, { id: string; title: string; descriptionHtml: string; xxlSourceId: number | null }>> {
  const out = new Map<string, { id: string; title: string; descriptionHtml: string; xxlSourceId: number | null }>();
  const q = `query ($q: String!) {
    products(first: 50, query: $q) {
      nodes {
        id
        handle
        title
        descriptionHtml
        metafield(namespace: "sync", key: "xxl_source_id") { value }
      }
    }
  }`;
  for (const batch of chunk(handles, 50)) {
    const queryStr = batch.map((h) => `handle:${h}`).join(' OR ');
    const data = await shopifyGraphql(endpoint, token, q, { q: queryStr });
    for (const n of data.products.nodes as Array<{
      id: string;
      handle: string;
      title: string;
      descriptionHtml: string;
      metafield: { value: string } | null;
    }>) {
      const xxlSourceId = n.metafield ? Number(n.metafield.value) : null;
      out.set(n.handle, {
        id: n.id,
        title: n.title,
        descriptionHtml: n.descriptionHtml,
        xxlSourceId: Number.isFinite(xxlSourceId as number) ? (xxlSourceId as number) : null,
      });
    }
  }
  return out;
}

/**
 * Fetch DE-locale translations for an array of product GIDs in a single
 * round trip per chunk by composing aliased translatableResource() calls.
 * We chunk at 25 to keep the document modest.
 */
async function fetchDeTranslations(
  endpoint: string,
  token: string,
  ids: string[],
): Promise<Map<string, { title: string | null; body: string | null }>> {
  const out = new Map<string, { title: string | null; body: string | null }>();
  for (const batch of chunk(ids, 25)) {
    const varDecls = batch.map((_, i) => `$id${i}: ID!`).join(', ');
    const aliases = batch
      .map(
        (_, i) => `t${i}: translatableResource(resourceId: $id${i}) {
          resourceId
          translations(locale: "de") { key value }
        }`,
      )
      .join('\n');
    const q = `query (${varDecls}) { ${aliases} }`;
    const variables: Record<string, string> = {};
    batch.forEach((id, i) => (variables[`id${i}`] = id));
    const data = await shopifyGraphql(endpoint, token, q, variables);
    batch.forEach((id, i) => {
      const node = data[`t${i}`] as { resourceId: string; translations: Array<{ key: string; value: string }> } | null;
      if (!node) {
        out.set(id, { title: null, body: null });
        return;
      }
      const titleT = node.translations.find((t) => t.key === 'title');
      const bodyT = node.translations.find((t) => t.key === 'body_html');
      out.set(id, { title: titleT?.value ?? null, body: bodyT?.value ?? null });
    });
  }
  return out;
}

async function enrichFromShopify(
  catalogProducts: CatalogProduct[],
  endpoint: string,
  token: string,
): Promise<EnrichmentSummary> {
  const summary: EnrichmentSummary = {
    matched: 0,
    missing: [],
    deTitleDrift: [],
    deBodyDrift: [],
    xxlIdDrift: [],
  };

  const handles = catalogProducts.map((p) => p.handle);
  console.log(`[enrich] fetching ${handles.length} products from Shopify...`);
  const byHandle = await fetchProductsByHandles(endpoint, token, handles);
  console.log(`[enrich]   matched ${byHandle.size}/${handles.length} on the store`);

  const matchedIds: string[] = [];
  const idToHandle = new Map<string, string>();
  for (const cp of catalogProducts) {
    const hit = byHandle.get(cp.handle);
    if (!hit) {
      summary.missing.push(cp.handle);
      continue;
    }
    matchedIds.push(hit.id);
    idToHandle.set(hit.id, cp.handle);
  }

  console.log(`[enrich] fetching DE translations for ${matchedIds.length} products...`);
  const deByGid = await fetchDeTranslations(endpoint, token, matchedIds);

  for (const cp of catalogProducts) {
    const hit = byHandle.get(cp.handle);
    if (!hit) continue;

    cp.titleEn = hit.title;
    cp.bodyHtmlEn = hit.descriptionHtml;
    summary.matched++;

    if (hit.xxlSourceId != null && hit.xxlSourceId !== cp.xxlId) {
      summary.xxlIdDrift.push(`${cp.handle}: catalog=${cp.xxlId} store=${hit.xxlSourceId}`);
    }

    const de = deByGid.get(hit.id);
    if (de) {
      if (de.title != null && de.title !== cp.titleDe) {
        summary.deTitleDrift.push(cp.handle);
      }
      if (de.body != null && de.body !== cp.bodyHtmlDe) {
        summary.deBodyDrift.push(cp.handle);
      }
    }
  }

  return summary;
}

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

  // 2b. Optional Shopify enrichment ------------------------------------------
  let enrichmentNote = `Stubbed with "${EN_PLACEHOLDER}" — run translate step before launch.`;
  let enrichmentSummary: EnrichmentSummary | null = null;
  if (cli.enrichFrom === 'prod') {
    console.log(`[enrich] prod enrichment is disabled by safety policy; use dev for now`);
  } else if (cli.enrichFrom === 'dev') {
    const endpoint = `https://${cfg.shopifyStore}/admin/api/${cfg.shopifyApiVersion}/graphql.json`;
    console.log(`[enrich] enriching from store=dev domain=${cfg.shopifyStore}`);
    enrichmentSummary = await enrichFromShopify(catalogProducts, endpoint, cfg.shopifyToken);
    enrichmentNote = `Enriched from Shopify ${cli.enrichFrom} (${cfg.shopifyStore}) at ${new Date().toISOString()}. Missing handles use the "${EN_PLACEHOLDER}" stub.`;
  }

  const catalog: CatalogFile = {
    builtAt: new Date().toISOString(),
    builderVersion: '1',
    source: cfg.xxlBaseUrl,
    totalProducts: catalogProducts.length,
    totalCollectionsMirrored: mirroredCollections.length,
    notes: {
      enTranslation: enrichmentNote,
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
  if (enrichmentSummary) {
    console.log(`[enrich] summary:`);
    console.log(`  · matched on store:     ${enrichmentSummary.matched}/${catalogProducts.length}`);
    console.log(`  · [missing]:            ${enrichmentSummary.missing.length}`);
    for (const h of enrichmentSummary.missing) console.log(`      [missing] ${h}`);
    console.log(`  · [de-drift] titles:    ${enrichmentSummary.deTitleDrift.length}`);
    for (const h of enrichmentSummary.deTitleDrift) console.log(`      [de-drift] title  ${h}`);
    console.log(`  · [de-drift] bodies:    ${enrichmentSummary.deBodyDrift.length}`);
    for (const h of enrichmentSummary.deBodyDrift) console.log(`      [de-drift] body   ${h}`);
    console.log(`  · [xxlId-drift]:        ${enrichmentSummary.xxlIdDrift.length}`);
    for (const m of enrichmentSummary.xxlIdDrift) console.log(`      [xxlId-drift] ${m}`);
  }
  console.log(`[catalog] done.`);
}

main().catch((err) => {
  console.error(`[catalog] FATAL: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});
