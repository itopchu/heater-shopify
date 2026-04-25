/**
 * Pulls product + collection data from xxl-heizung.de's public Shopify JSON endpoints.
 * No HTML parsing — Shopify exposes intentional public JSON, redesign-proof.
 *
 * Endpoints used:
 *   GET /collections.json                              — all collections
 *   GET /collections/{handle}/products.json?page=N     — products per collection
 *   GET /products/{handle}.json                        — full product detail
 *   GET /sitemap_products_1.xml                        — product URL list (fallback)
 */

import type { SyncConfig } from './env.js';
import type { XxlCollection, XxlProduct } from './types.js';

const PAGE_LIMIT = 250;
const RATE_LIMIT_MS = 250;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'gberg-sync/0.1 (+https://gberg-heizung.de)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status} ${res.statusText}`);
  }

  // Defensive: cap response size to prevent DoS via an upstream returning a huge payload.
  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error(
        `GET ${url} → Response too large: content-length ${declared} exceeds ${MAX_RESPONSE_BYTES} bytes`,
      );
    }
  }

  // Defensive: ensure upstream actually served JSON. xxl could redirect to an HTML error page.
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `GET ${url} → Unexpected content-type "${contentType}" (expected application/json)`,
    );
  }

  return res.json() as Promise<T>;
}

export async function fetchAllCollections(cfg: SyncConfig): Promise<XxlCollection[]> {
  const out: XxlCollection[] = [];
  let page = 1;
  while (true) {
    const url = `${cfg.xxlBaseUrl}/collections.json?limit=${PAGE_LIMIT}&page=${page}`;
    const json = await fetchJson<{ collections: XxlCollection[] }>(url);
    const batch = json.collections || [];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }
  return out;
}

export async function fetchProductsInCollection(
  cfg: SyncConfig,
  handle: string,
): Promise<XxlProduct[]> {
  const out: XxlProduct[] = [];
  let page = 1;
  while (true) {
    const url = `${cfg.xxlBaseUrl}/collections/${encodeURIComponent(handle)}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const json = await fetchJson<{ products: XxlProduct[] }>(url);
    const batch = json.products || [];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }
  return out;
}

export async function fetchAllProducts(cfg: SyncConfig): Promise<XxlProduct[]> {
  const out: XxlProduct[] = [];
  let page = 1;
  while (true) {
    const url = `${cfg.xxlBaseUrl}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const json = await fetchJson<{ products: XxlProduct[] }>(url);
    const batch = json.products || [];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }
  return out;
}

/** Build a map of productId → [collectionHandle...] so we can assign products on create. */
export async function buildProductCollectionIndex(
  cfg: SyncConfig,
  collections: XxlCollection[],
): Promise<Map<number, string[]>> {
  const index = new Map<number, string[]>();
  for (const c of collections) {
    const products = await fetchProductsInCollection(cfg, c.handle);
    for (const p of products) {
      const arr = index.get(p.id) || [];
      if (!arr.includes(c.handle)) arr.push(c.handle);
      index.set(p.id, arr);
    }
    await sleep(RATE_LIMIT_MS);
  }
  return index;
}
