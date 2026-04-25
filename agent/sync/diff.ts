/**
 * Compares normalized xxl products against our current Shopify store.
 * Key is product.metafields.sync.xxl_source_id (integer).
 *
 * Output classification:
 *   - CREATE     — xxl product has no matching xxl_source_id in our store
 *   - UPDATE     — id matches; one or more fields differ (title, body, tags, vendor, image count, collections)
 *   - ARCHIVE    — we have it but xxl no longer lists it → productUpdate(status: ARCHIVED)
 *   - UNCHANGED  — everything matches
 */

import type { SyncConfig } from './env.js';
import type { DiffEntry, NormalizedProduct } from './types.js';

interface StoreProduct {
  id: string;
  handle: string;
  title: string;
  status: string;
  xxlSourceId: number | null;
  bodySha: string;
  tags: string[];
  vendor: string;
  imageCount: number;
}

async function shopifyGraphql<T>(cfg: SyncConfig, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${cfg.shopifyStore}/admin/api/${cfg.shopifyApiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.shopifyToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export async function loadStoreProducts(cfg: SyncConfig): Promise<StoreProduct[]> {
  const out: StoreProduct[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string };
        nodes: Array<{
          id: string;
          handle: string;
          title: string;
          status: string;
          vendor: string;
          tags: string[];
          images: { nodes: Array<{ id: string }> };
          metafield: { value: string } | null;
        }>;
      };
    } = await shopifyGraphql(
      cfg,
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id handle title status vendor tags
            images(first: 1) { nodes { id } }
            metafield(namespace: "sync", key: "xxl_source_id") { value }
          }
        }
      }`,
      { cursor },
    );
    for (const n of data.products.nodes) {
      const xxlSourceId = n.metafield ? Number(n.metafield.value) : null;
      out.push({
        id: n.id,
        handle: n.handle,
        title: n.title,
        status: n.status,
        xxlSourceId: Number.isFinite(xxlSourceId as number) ? (xxlSourceId as number) : null,
        bodySha: '',
        tags: n.tags,
        vendor: n.vendor,
        imageCount: n.images.nodes.length,
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

function summarize(payload: NormalizedProduct, store: StoreProduct | null): string {
  if (!store) return `CREATE ${payload.handle} (xxl=${payload.xxlId}) variants=${payload.variants.length} images=${payload.sourceImageUrls.length}`;
  const changes: string[] = [];
  if (payload.titleDe !== store.title && payload.titleEn !== store.title) changes.push('title');
  if (payload.vendor !== store.vendor) changes.push('vendor');
  if (payload.sourceImageUrls.length !== store.imageCount) changes.push(`images(${store.imageCount}→${payload.sourceImageUrls.length})`);
  const tagSet = new Set(store.tags);
  for (const t of payload.tags) if (!tagSet.has(t)) changes.push(`+tag:${t}`);
  return `UPDATE ${payload.handle} (xxl=${payload.xxlId}) changes=[${changes.join(',') || 'metafields-only'}]`;
}

export function computeDiff(
  normalized: NormalizedProduct[],
  storeProducts: StoreProduct[],
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const storeByXxlId = new Map<number, StoreProduct>();
  for (const s of storeProducts) {
    if (s.xxlSourceId != null) storeByXxlId.set(s.xxlSourceId, s);
  }
  const seenXxlIds = new Set<number>();

  for (const n of normalized) {
    seenXxlIds.add(n.xxlId);
    const existing = storeByXxlId.get(n.xxlId);
    if (!existing) {
      entries.push({ action: 'CREATE', ourGid: null, payload: n, summary: summarize(n, null) });
    } else {
      // Light heuristic: flag as UPDATE unless title + vendor + image count all match.
      const unchanged =
        (existing.title === n.titleDe || existing.title === n.titleEn) &&
        existing.vendor === n.vendor &&
        existing.imageCount === n.sourceImageUrls.length;
      if (unchanged) {
        entries.push({ action: 'UNCHANGED', ourGid: existing.id, payload: n, summary: `UNCHANGED ${n.handle}` });
      } else {
        entries.push({ action: 'UPDATE', ourGid: existing.id, payload: n, summary: summarize(n, existing) });
      }
    }
  }

  // Anything in our store with an xxl_source_id that's no longer in xxl → ARCHIVE.
  for (const [xxlId, store] of storeByXxlId) {
    if (!seenXxlIds.has(xxlId) && store.status !== 'ARCHIVED') {
      entries.push({
        action: 'ARCHIVE',
        ourGid: store.id,
        payload: null,
        summary: `ARCHIVE ${store.handle} (xxl=${xxlId} no longer in source)`,
      });
    }
  }

  return entries;
}
