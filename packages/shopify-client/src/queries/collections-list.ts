/**
 * List all collections (handle + title + count). Used by the storefront to
 * discover what categories exist in Shopify Admin so the navbar mega-menu
 * can render dynamically — and by the "Shop all" route to link to every
 * collection group.
 *
 * Returns a flat list, sorted by Admin display order. Defensive: returns []
 * when the store is empty rather than throwing.
 */
import {
  inContextDirective,
  type QueryContext,
  type StorefrontClient,
} from "../client";

export interface CollectionListItem {
  id: string;
  handle: string;
  title: string;
  productsCount: number;
  image: { url: string; altText: string | null } | null;
}

interface RawResponse {
  collections: {
    nodes: Array<{
      id: string;
      handle: string;
      title: string;
      products: { nodes: Array<{ id: string }>; pageInfo: { hasNextPage: boolean } };
      image: { url: string; altText: string | null } | null;
    }>;
  };
}

const COLLECTIONS_QUERY = /* GraphQL */ `
  query CollectionsList($first: Int!) __CTX__ {
    collections(first: $first) {
      nodes {
        id
        handle
        title
        image { url altText }
        # We can't read aggregate productsCount from the Storefront API; fall
        # back to fetching 1 product to test "has products". Counting beyond 1
        # would explode the query — callers that need the real count should
        # use the Admin API.
        products(first: 1) {
          nodes { id }
          pageInfo { hasNextPage }
        }
      }
    }
  }
`;

export async function getCollectionsList(
  client: StorefrontClient,
  options: { first?: number } = {},
  context?: QueryContext,
): Promise<CollectionListItem[]> {
  const first = options.first ?? 50;
  const gql = COLLECTIONS_QUERY.replace("__CTX__", inContextDirective(context));
  const data = await client.query<RawResponse>(gql, { first }, context);
  return data.collections.nodes.map((c) => ({
    id: c.id,
    handle: c.handle,
    title: c.title,
    image: c.image,
    productsCount:
      c.products.nodes.length + (c.products.pageInfo.hasNextPage ? 1 : 0),
  }));
}

/**
 * Catalog-wide product list, paginated. Used by `/products` (shop-all)
 * route. Returns the full set of products across all collections.
 */
import {
  parseHeatingProduct,
  type HeatingProduct,
  type ShopifyProductRaw,
} from "@gberg/product-schema";
import {
  HEATING_PRODUCT_CARD_METAFIELD_IDENTIFIERS,
  IMAGE_FRAGMENT,
  MONEY_FRAGMENT,
  PRODUCT_CARD_FRAGMENT,
  metafieldIdentifiersInline,
} from "../fragments";

const HEATING_CARD_METAFIELD_LITERAL = metafieldIdentifiersInline(
  HEATING_PRODUCT_CARD_METAFIELD_IDENTIFIERS,
);

const ALL_PRODUCTS_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${PRODUCT_CARD_FRAGMENT}

  query AllProducts($first: Int!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean) __CTX__ {
    products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ...ProductCardFields
        options { id name values }
        variants(first: 1) {
          nodes {
            id
            availableForSale
            price { ...MoneyFields }
            compareAtPrice { ...MoneyFields }
          }
        }
        metafields(identifiers: __MF_IDS__) {
          namespace
          key
          type
          value
        }
      }
    }
  }
`;

interface AllProductsRaw {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyProductRaw[];
  };
}

export interface AllProductsResult {
  products: HeatingProduct[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export type ProductSortKey =
  | "TITLE"
  | "PRICE"
  | "CREATED_AT"
  | "BEST_SELLING"
  | "RELEVANCE";

export async function getAllProducts(
  client: StorefrontClient,
  options: {
    first?: number;
    after?: string | null;
    sortKey?: ProductSortKey;
    reverse?: boolean;
  } = {},
  context?: QueryContext,
): Promise<AllProductsResult> {
  const first = options.first ?? 24;
  const gql = ALL_PRODUCTS_QUERY
    .replace("__CTX__", inContextDirective(context))
    .replace("__MF_IDS__", HEATING_CARD_METAFIELD_LITERAL);
  const data = await client.query<AllProductsRaw>(
    gql,
    {
      first,
      after: options.after ?? null,
      sortKey: options.sortKey ?? "BEST_SELLING",
      reverse: options.reverse ?? false,
    },
    context,
  );
  return {
    products: data.products.nodes.map(parseHeatingProduct),
    pageInfo: data.products.pageInfo,
  };
}
