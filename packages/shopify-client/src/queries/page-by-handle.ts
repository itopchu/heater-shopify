/**
 * Storefront `pageByHandle` — fetches a Shopify Online Store Page (Admin →
 * Online Store → Pages) by its handle. Used by the storefront for static
 * info pages like /pages/shipping, /pages/imprint, /pages/about etc.
 *
 * Returns null when the page doesn't exist so the caller can render a
 * graceful 404 (or omit the link). Does NOT throw on missing pages — that
 * way merchants can edit nav menus without breaking builds.
 */
import {
  inContextDirective,
  type QueryContext,
  type StorefrontClient,
} from "../client";

export interface ShopifyPage {
  id: string;
  handle: string;
  title: string;
  body: string;
  bodySummary: string;
  seo: { title: string | null; description: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

interface RawResponse {
  page: ShopifyPage | null;
}

const PAGE_QUERY = /* GraphQL */ `
  query PageByHandle($handle: String!) __CTX__ {
    page(handle: $handle) {
      id
      handle
      title
      body
      bodySummary
      seo { title description }
      createdAt
      updatedAt
    }
  }
`;

export async function getPageByHandle(
  client: StorefrontClient,
  handle: string,
  context?: QueryContext,
): Promise<ShopifyPage | null> {
  const gql = PAGE_QUERY.replace("__CTX__", inContextDirective(context));
  const data = await client.query<RawResponse>(gql, { handle }, context);
  return data.page ?? null;
}
