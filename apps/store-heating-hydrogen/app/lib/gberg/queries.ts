/**
 * Heating-storefront-specific data composition for Hydrogen.
 *
 * Adapts the existing `@gberg/shopify-client` query helpers (which take a
 * generic `StorefrontClient`) to Hydrogen's storefront context. Each helper
 * accepts the wrapped client (built via `createGbergClient(storefront)` in
 * the route loader) plus a locale.
 *
 * Spec ref: shop/09_storefront_api_query_plan.md.
 */

import {
  getAllProducts,
  getAnyBlog,
  getBlogByHandle,
  getCollectionByHandle,
  getCollectionsList,
  getHeatingProductByHandle,
  getMenu,
  getPageByHandle,
  getPredictiveSearch,
  getProductsList,
  getSearchResults,
  type AllProductsResult,
  type BlogResult,
  type CollectionListItem,
  type CollectionResult,
  type MenuItem,
  type PredictiveResult,
  type ProductSortKey,
  type QueryContext,
  type SearchResult,
  type ShopifyPage,
  type StorefrontClient,
} from '@gberg/shopify-client';
import type {HeatingProduct} from '@gberg/product-schema';
import {localeToInContext, normalizeLocale} from './i18n';

export function localeToContext(locale: string): QueryContext {
  const hint = localeToInContext(normalizeLocale(locale));
  return {country: hint.country, language: hint.language};
}

export async function fetchProductByHandle(
  client: StorefrontClient,
  handle: string,
  locale: string,
): Promise<HeatingProduct | null> {
  const ctx = localeToContext(locale);
  return getHeatingProductByHandle(client, handle, ctx);
}

/**
 * A heating product is shown to the customer only if it has a real
 * featured image (or a media node that resolves to one). Catalog leftovers
 * synced before the image pipeline ran have no media — those should never
 * appear on PLPs, bestsellers, or the homepage.
 */
function hasUsableImage(p: HeatingProduct): boolean {
  if (p.featuredImage?.url) return true;
  if (p.images?.some((img) => Boolean(img?.url))) return true;
  for (const node of p.media ?? []) {
    if (
      node.__typename === 'MediaImage' &&
      (node as {image?: {url?: string} | null}).image?.url
    ) {
      return true;
    }
  }
  return false;
}

export async function fetchCollectionByHandle(
  client: StorefrontClient,
  handle: string,
  locale: string,
  first = 24,
): Promise<CollectionResult | null> {
  const ctx = localeToContext(locale);
  // Over-fetch a little so that filtering out leftovers doesn't leave PLPs
  // looking artificially short. The wrapper below trims back to `first`.
  const fetchSize = Math.min(first + 12, 100);
  const col = await getCollectionByHandle(client, handle, {first: fetchSize}, ctx);
  if (!col) return null;
  return {
    ...col,
    products: col.products.filter(hasUsableImage).slice(0, first),
  };
}

export async function fetchBestsellers(
  client: StorefrontClient,
  locale: string,
  first = 8,
): Promise<HeatingProduct[]> {
  const ctx = localeToContext(locale);
  const fetchSize = first + 12;
  const col = await getCollectionByHandle(
    client,
    'bestseller',
    {first: fetchSize},
    ctx,
  ).catch(() => null);
  if (col?.products?.length) {
    return col.products.filter(hasUsableImage).slice(0, first);
  }
  const list = await getProductsList(client, {first: fetchSize}, ctx).catch(
    () => [] as HeatingProduct[],
  );
  return list.filter(hasUsableImage).slice(0, first);
}

export async function fetchRelatedProducts(
  client: StorefrontClient,
  product: HeatingProduct,
  locale: string,
  first = 4,
): Promise<HeatingProduct[]> {
  const ctx = localeToContext(locale);

  for (const handle of product.collectionHandles ?? []) {
    const col = await getCollectionByHandle(
      client,
      handle,
      {first: first + 1},
      ctx,
    ).catch(() => null);
    if (col?.products?.length) {
      const peers = col.products
        .filter((p) => p.id !== product.id)
        .slice(0, first);
      if (peers.length > 0) return peers;
    }
  }

  const bestsellers = await fetchBestsellers(client, locale, first + 1);
  return bestsellers.filter((p) => p.id !== product.id).slice(0, first);
}

export async function fetchHeaderMenu(
  client: StorefrontClient,
  locale: string,
): Promise<MenuItem[]> {
  const ctx = localeToContext(locale);
  const menu = await getMenu(client, 'main-menu', ctx).catch(() => null);
  return menu?.items ?? [];
}

export async function fetchFooterMenu(
  client: StorefrontClient,
  locale: string,
): Promise<MenuItem[]> {
  const ctx = localeToContext(locale);
  const menu = await getMenu(client, 'footer', ctx).catch(() => null);
  return menu?.items ?? [];
}

export async function fetchPageByHandle(
  client: StorefrontClient,
  handle: string,
  locale: string,
): Promise<ShopifyPage | null> {
  const ctx = localeToContext(locale);
  return getPageByHandle(client, handle, ctx).catch(() => null);
}

export interface CategoryPreview {
  handle: string;
  title: string | null;
  image: {url: string; altText: string | null} | null;
  productCount: number;
}

export async function fetchAllProducts(
  client: StorefrontClient,
  locale: string,
  options: {
    first?: number;
    after?: string | null;
    sortKey?: ProductSortKey;
    reverse?: boolean;
  } = {},
): Promise<AllProductsResult> {
  const ctx = localeToContext(locale);
  return getAllProducts(client, options, ctx);
}

export async function fetchCollectionsList(
  client: StorefrontClient,
  locale: string,
  first = 50,
): Promise<CollectionListItem[]> {
  const ctx = localeToContext(locale);
  return getCollectionsList(client, {first}, ctx).catch(() => []);
}

export async function fetchSearchResults(
  client: StorefrontClient,
  query: string,
  locale: string,
  first = 24,
): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return {totalCount: 0, products: []};
  const ctx = localeToContext(locale);
  return getSearchResults(client, trimmed, {first}, ctx).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[fetchSearchResults] search failed', err);
    return {totalCount: 0, products: []};
  });
}

export async function fetchPredictiveSearch(
  client: StorefrontClient,
  query: string,
  locale: string,
  limit = 6,
): Promise<PredictiveResult> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return {products: [], collections: [], queries: []};
  }
  const ctx = localeToContext(locale);
  return getPredictiveSearch(client, trimmed, {limit}, ctx).catch(() => ({
    products: [],
    collections: [],
    queries: [],
  }));
}

export async function fetchBlog(
  client: StorefrontClient,
  locale: string,
  options: {handle?: string; first?: number} = {},
): Promise<BlogResult | null> {
  const ctx = localeToContext(locale);
  if (options.handle) {
    return getBlogByHandle(
      client,
      options.handle,
      {first: options.first},
      ctx,
    ).catch(() => null);
  }
  return getAnyBlog(client, {first: options.first}, ctx).catch(() => null);
}

/**
 * Curated hero product per category card. Each value is a Shopify product
 * handle whose `featuredImage` will be the category card's hero photo on
 * the homepage. Editing a value here is the merchant-facing knob to swap
 * the visual representation of any category.
 *
 * If a curated handle isn't found (or has no image), the loader falls
 * back to the most-expensive imaged product in the linked collection.
 * If that fails too, the homepage renders a text placeholder.
 */
// Handles updated 2026-05-14 for the Twister/Pullman/Elanor/Astoria/Flora →
// Berlin/Dresden/Hamburg/Potsdam/Köln rebrand. Old handles still 301 at the
// HTTP layer, but `fetchProductByHandle` queries the Storefront API directly —
// it would return null for the old handles, hiding the hero image entirely.
const CATEGORY_HERO_PRODUCT_HANDLES: Record<string, string> = {
  'living-room-radiators':
    'vertikal-paneelheizkorper-koeln-mittel-und-seitenanschluss-anthrazit',
  'bathroom-radiators':
    'badheizkoerper-mittelanschluss-potsdam-anthrazit-handtuchwaermer',
  'electric-bathroom-radiators':
    'badheizkorper-elektrisch-hamburg-anthrazit-handtuchheizkorper-handtuchwarmer',
  'replacement-radiators':
    'austausch-badheizkorper-handtuchheizkorper-schwarz-hamburg-seitlich-offen',
  fussbodenheizung:
    'fussbodenheizungsrohr-16x2-mm-pe-rt-5-schicht-rohr-240-m',
  accessories:
    'handtuchhaken-bademantelhalter-fur-badheizkorper-in-weiss-oder-chrom',
};

/**
 * From a list of products, return the featuredImage of the highest-priced
 * one that actually has an image. Returns null if every candidate is
 * imageless. Used by category previews and editorial heroes — the most
 * expensive piece in a collection is usually the best photograph.
 */
function pickMostExpensiveImage(
  products: readonly HeatingProduct[],
): {url: string; altText: string | null} | null {
  let best: HeatingProduct | null = null;
  let bestPrice = -Infinity;
  for (const p of products) {
    if (!p.featuredImage?.url) continue;
    const price = Number(p.priceRange?.minVariantPrice?.amount);
    if (!Number.isFinite(price)) continue;
    if (price > bestPrice) {
      best = p;
      bestPrice = price;
    }
  }
  if (!best?.featuredImage) return null;
  return {
    url: best.featuredImage.url,
    altText: best.featuredImage.altText ?? null,
  };
}

/**
 * Fetch the featuredImage of the most expensive product in a collection.
 * Used by the homepage to hero specific categories (electric in the main
 * banner, living-room panels in the "Designed in Germany" split).
 */
export async function fetchMostExpensiveImage(
  client: StorefrontClient,
  collectionHandle: string,
  locale: string,
): Promise<{url: string; altText: string | null} | null> {
  const ctx = localeToContext(locale);
  const col = await getCollectionByHandle(
    client,
    collectionHandle,
    {first: 50},
    ctx,
  ).catch(() => null);
  if (!col) return null;
  return pickMostExpensiveImage(col.products);
}

export async function fetchCategoryPreviews(
  client: StorefrontClient,
  handles: readonly string[],
  locale: string,
): Promise<CategoryPreview[]> {
  const ctx = localeToContext(locale);

  // Resolve all curated hero products in parallel. Each card's image
  // sources from its own curated product first, so the photograph is
  // unambiguously category-relevant.
  const curatedHandles = handles
    .map((h) => CATEGORY_HERO_PRODUCT_HANDLES[h])
    .filter((h): h is string => Boolean(h));
  const curatedProducts = await Promise.all(
    curatedHandles.map((h) =>
      getHeatingProductByHandle(client, h, ctx).catch(() => null),
    ),
  );
  const curatedImageByHandle = new Map<string, {url: string; altText: string | null}>();
  curatedHandles.forEach((h, i) => {
    const img = curatedProducts[i]?.featuredImage;
    if (img?.url) {
      curatedImageByHandle.set(h, {url: img.url, altText: img.altText ?? null});
    }
  });

  const results = await Promise.all(
    handles.map(async (handle) => {
      const col = await getCollectionByHandle(
        client,
        handle,
        {first: 50},
        ctx,
      ).catch(() => null);

      // 1. Curated hero product wins (editable in CATEGORY_HERO_PRODUCT_HANDLES).
      // 2. Else most expensive imaged product in this collection.
      // 3. Else null — homepage renders a text placeholder. Skip
      //    `col.image` (the Shopify Admin collection cover) because those
      //    have proven unreliable / off-brand.
      const curated = CATEGORY_HERO_PRODUCT_HANDLES[handle];
      const curatedImage = curated ? curatedImageByHandle.get(curated) : undefined;
      const chosen =
        curatedImage ?? (col ? pickMostExpensiveImage(col.products) : null);

      if (!col) {
        return {
          handle,
          title: null,
          image: curatedImage ?? null,
          productCount: 0,
        } as CategoryPreview;
      }

      return {
        handle,
        title: col.title,
        image: chosen,
        productCount: col.products.length,
      } as CategoryPreview;
    }),
  );
  return results;
}
