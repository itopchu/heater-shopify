/**
 * Storefront client adapter for Hydrogen → @gberg/shopify-client.
 *
 * Our existing `@gberg/shopify-client` queries (getHeatingProductByHandle,
 * getCollectionByHandle, getMenu, getPageByHandle, getSearchResults, etc.)
 * accept a `StorefrontClient` interface with shape:
 *
 *   client.query<T>(gql: string, variables?, context?): Promise<T>
 *
 * Hydrogen exposes `context.storefront` with a *different* signature:
 *
 *   storefront.query<T>(gql: string, options?: { variables, cache })
 *
 * This adapter bridges the two so our queries continue to work unchanged
 * inside Hydrogen loaders. The `@inContext(country, language)` directive is
 * already inlined in our query strings via `inContextDirective(ctx)`, so we
 * just forward the request to Hydrogen's storefront. Hydrogen's storefront
 * automatically appends its own i18n context which we override via the
 * `__CTX__` token replacement performed inside each query function — that
 * stays as-is.
 *
 * Cache strategy: we use Hydrogen's `CacheShort()` (1m fresh + 9m SWR) by
 * default. Long cache used to make registered translations propagate
 * slowly — a translation registered via translationsRegister wouldn't
 * appear on the storefront until the previous response's max-age (1h)
 * expired. Short cache keeps the storefront snappy under load (most
 * requests hit the SWR window) while letting fresh translations and
 * product edits land within minutes.
 */

import type {Storefront} from '@shopify/hydrogen';
import type {StorefrontClient, QueryContext} from '@gberg/shopify-client';

export type HydrogenStorefront = Storefront;

/**
 * Wrap a Hydrogen storefront so it satisfies `@gberg/shopify-client`'s
 * `StorefrontClient` interface. Lets us call our existing query helpers
 * (getHeatingProductByHandle, getCollectionByHandle, ...) from RR7 loaders.
 */
export function createGbergClient(storefront: HydrogenStorefront): StorefrontClient {
  return {
    domain: 'storefront',
    apiVersion: 'managed-by-hydrogen',
    async query<T>(
      gql: string,
      variables: Record<string, unknown> = {},
      context: QueryContext = {},
    ): Promise<T> {
      // Hydrogen handles caching, retries and the access token automatically.
      // We pass through the raw gql + variables; the @inContext directive is
      // already baked into the query string by our query builders.
      const cache =
        context.cache === 'no-store'
          ? storefront.CacheNone()
          : storefront.CacheShort();
      const data = (await storefront.query(gql, {
        variables,
        cache,
      })) as T;
      return data;
    },
  };
}
