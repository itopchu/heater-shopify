/**
 * Heating-storefront-specific data composition.
 * Wraps the shared @gberg/shopify-client queries with route-level defaults
 * (revalidation windows, locale → @inContext mapping, fallback queries).
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
} from "@gberg/shopify-client";
import type { HeatingProduct } from "@gberg/product-schema";
import { getShopifyClient, isShopifyConfigured } from "./shopify";
import { localeToInContext, normalizeLocale } from "./i18n";

/**
 * Map a route locale (`nl`, `de`, `fr`, `en`) to a Storefront API
 * `@inContext(country, language)` directive. The country/language pair
 * comes from the central i18n helper (lib/i18n.localeToInContext) so any
 * future locale addition only requires updating one switch.
 *
 * EN intentionally maps to country=NL — it is the fallback locale per
 * brief 01 / 07 §12, never a primary surface for an EU market.
 */
export function localeToContext(locale: string): QueryContext {
  const hint = localeToInContext(normalizeLocale(locale));
  return {
    country: hint.country,
    language: hint.language,
    next: { revalidate: 300 },
  };
}

/** PDP fetch with locale context. Returns null if product doesn't exist. */
export async function fetchProductByHandle(
  handle: string,
  locale: string,
): Promise<HeatingProduct | null> {
  if (!isShopifyConfigured()) return null;
  const ctx = localeToContext(locale);
  return getHeatingProductByHandle(getShopifyClient(), handle, ctx);
}

/** PLP fetch. */
export async function fetchCollectionByHandle(
  handle: string,
  locale: string,
  first = 24,
): Promise<CollectionResult | null> {
  if (!isShopifyConfigured()) return null;
  const ctx = localeToContext(locale);
  return getCollectionByHandle(getShopifyClient(), handle, { first }, ctx);
}

/**
 * Bestseller rail. Tries the `bestseller` collection first; if it doesn't
 * exist, falls back to a top-N best-selling products list.
 */
export async function fetchBestsellers(
  locale: string,
  first = 8,
): Promise<HeatingProduct[]> {
  if (!isShopifyConfigured()) return [];
  const ctx = localeToContext(locale);
  const client = getShopifyClient();
  const col = await getCollectionByHandle(client, "bestseller", { first }, ctx).catch(
    () => null,
  );
  if (col?.products?.length) return col.products;
  return getProductsList(client, { first }, ctx).catch(() => []);
}

/**
 * "Related products" rail for the PDP — pulls 4 from the first collection the
 * current product belongs to, excluding the current product. Falls back to
 * bestsellers when the product has no collection memberships or all of its
 * collections are empty / single-item.
 */
export async function fetchRelatedProducts(
  product: HeatingProduct,
  locale: string,
  first = 4,
): Promise<HeatingProduct[]> {
  if (!isShopifyConfigured()) return [];
  const ctx = localeToContext(locale);
  const client = getShopifyClient();

  for (const handle of product.collectionHandles ?? []) {
    const col = await getCollectionByHandle(
      client,
      handle,
      { first: first + 1 },
      ctx,
    ).catch(() => null);
    if (col?.products?.length) {
      const peers = col.products.filter((p) => p.id !== product.id).slice(0, first);
      if (peers.length > 0) return peers;
    }
  }

  // Fall back to bestsellers, minus self.
  const bestsellers = await fetchBestsellers(locale, first + 1);
  return bestsellers.filter((p) => p.id !== product.id).slice(0, first);
}

/** Header/Footer menus. Returns empty fallback if Shopify isn't configured. */
export async function fetchHeaderMenu(locale: string): Promise<MenuItem[]> {
  if (!isShopifyConfigured()) return [];
  const ctx = localeToContext(locale);
  const menu = await getMenu(getShopifyClient(), "main-menu", ctx).catch(() => null);
  return menu?.items ?? [];
}

export async function fetchFooterMenu(locale: string): Promise<MenuItem[]> {
  if (!isShopifyConfigured()) return [];
  const ctx = localeToContext(locale);
  const menu = await getMenu(getShopifyClient(), "footer", ctx).catch(() => null);
  return menu?.items ?? [];
}

/**
 * Fetch a Shopify Online Store Page by handle. Returns null if the page
 * doesn't exist (so the route handler can render notFound() gracefully
 * instead of throwing during build).
 */
export async function fetchPageByHandle(
  handle: string,
  locale: string,
): Promise<ShopifyPage | null> {
  if (!isShopifyConfigured()) return null;
  const ctx = localeToContext(locale);
  return getPageByHandle(getShopifyClient(), handle, ctx).catch(() => null);
}

/**
 * Multi-fetch helper for the homepage category section. Pulls the first
 * product image for each requested collection handle in parallel. Used to
 * replace the SVG/emoji placeholders with real lifestyle imagery.
 *
 * Returns one entry per requested handle, in the same order, with `image`
 * = null when the collection doesn't exist or has no products. Callers
 * decide whether to omit empty cards.
 */
export interface CategoryPreview {
  handle: string;
  title: string | null;
  image: { url: string; altText: string | null } | null;
  productCount: number;
}

/**
 * Whole-catalog product list (paginated). Used by the `/products` shop-all
 * route since `/collections/all` isn't a real Shopify collection.
 */
export async function fetchAllProducts(
  locale: string,
  options: {
    first?: number;
    after?: string | null;
    sortKey?: ProductSortKey;
    reverse?: boolean;
  } = {},
): Promise<AllProductsResult> {
  if (!isShopifyConfigured()) {
    return { products: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }
  const ctx = localeToContext(locale);
  return getAllProducts(getShopifyClient(), options, ctx);
}

/**
 * Fetch all collections (handle + title + has-products flag). Used by the
 * mega-menu so it can render whichever categories the merchant created in
 * Shopify Admin without code changes.
 */
export async function fetchCollectionsList(
  locale: string,
  first = 50,
): Promise<CollectionListItem[]> {
  if (!isShopifyConfigured()) return [];
  const ctx = localeToContext(locale);
  return getCollectionsList(getShopifyClient(), { first }, ctx).catch(() => []);
}

/**
 * Full search across products. Powers `/search?q=…`. Returns an empty
 * result when the query is empty so callers can skip the network round-trip.
 */
export async function fetchSearchResults(
  query: string,
  locale: string,
  first = 24,
): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed || !isShopifyConfigured()) {
    return { totalCount: 0, products: [] };
  }
  const ctx = localeToContext(locale);
  return getSearchResults(getShopifyClient(), trimmed, { first }, ctx).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[fetchSearchResults] search failed", err);
    return { totalCount: 0, products: [] };
  });
}

/**
 * Typeahead predictive search. Cheap; called from the header overlay's
 * server-action / API route as the user types.
 */
export async function fetchPredictiveSearch(
  query: string,
  locale: string,
  limit = 6,
): Promise<PredictiveResult> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2 || !isShopifyConfigured()) {
    return { products: [], collections: [], queries: [] };
  }
  const ctx = localeToContext(locale);
  return getPredictiveSearch(getShopifyClient(), trimmed, { limit }, ctx).catch(
    () => ({ products: [], collections: [], queries: [] }),
  );
}

/** Blog/news fetch with the resilient "any blog" fallback. */
export async function fetchBlog(
  locale: string,
  options: { handle?: string; first?: number } = {},
): Promise<BlogResult | null> {
  if (!isShopifyConfigured()) return null;
  const ctx = localeToContext(locale);
  const client = getShopifyClient();
  if (options.handle) {
    return getBlogByHandle(client, options.handle, { first: options.first }, ctx).catch(
      () => null,
    );
  }
  return getAnyBlog(client, { first: options.first }, ctx).catch(() => null);
}

export async function fetchCategoryPreviews(
  handles: readonly string[],
  locale: string,
): Promise<CategoryPreview[]> {
  if (!isShopifyConfigured()) {
    return handles.map((h) => ({ handle: h, title: null, image: null, productCount: 0 }));
  }
  const ctx = localeToContext(locale);
  const client = getShopifyClient();
  const results = await Promise.all(
    handles.map(async (handle) => {
      const col = await getCollectionByHandle(client, handle, { first: 1 }, ctx).catch(
        () => null,
      );
      if (!col) {
        return { handle, title: null, image: null, productCount: 0 } as CategoryPreview;
      }
      const firstProduct = col.products[0];
      const firstImage = firstProduct?.featuredImage ?? null;
      return {
        handle,
        title: col.title,
        image: firstImage
          ? { url: firstImage.url, altText: firstImage.altText ?? null }
          : col.image
            ? { url: col.image.url, altText: col.image.altText ?? null }
            : null,
        productCount: col.products.length,
      } as CategoryPreview;
    }),
  );
  return results;
}
