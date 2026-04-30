/**
 * Storefront search.
 *
 *   - getSearchResults: full Storefront API `search(query: $q, types: [PRODUCT, ARTICLE, PAGE])`.
 *     Returns hydrated heating products plus stub Page/Article entries (we
 *     don't have full schemas for those yet — keep the projection minimal so
 *     adding them later is additive).
 *   - getPredictiveSearch: `predictiveSearch(query: $q)` typeahead. Cheap,
 *     fast, used by the header overlay as the user types.
 *
 * Both surfaces tunnel through the same locale @inContext directive as PDP/PLP
 * so prices/inventory/translations match.
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
import {
  inContextDirective,
  type QueryContext,
  type StorefrontClient,
} from "../client";

const HEATING_CARD_METAFIELD_LITERAL = metafieldIdentifiersInline(
  HEATING_PRODUCT_CARD_METAFIELD_IDENTIFIERS,
);

/* ---------- Full search ---------- */

const SEARCH_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${PRODUCT_CARD_FRAGMENT}

  query Search($query: String!, $first: Int!) __CTX__ {
    search(query: $query, first: $first, types: [PRODUCT]) {
      totalCount
      productFilters { id label }
      edges {
        node {
          __typename
          ... on Product {
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
    }
  }
`;

interface SearchRaw {
  search: {
    totalCount: number;
    edges: Array<{ node: { __typename: string } & ShopifyProductRaw }>;
  } | null;
}

export interface SearchResult {
  totalCount: number;
  products: HeatingProduct[];
}

export async function getSearchResults(
  client: StorefrontClient,
  query: string,
  options: { first?: number } = {},
  context?: QueryContext,
): Promise<SearchResult> {
  const first = options.first ?? 24;
  const gql = SEARCH_QUERY
    .replace("__CTX__", inContextDirective(context))
    .replace("__MF_IDS__", HEATING_CARD_METAFIELD_LITERAL);

  const data = await client.query<SearchRaw>(gql, { query, first }, context);
  const search = data.search;
  if (!search) return { totalCount: 0, products: [] };
  const products: HeatingProduct[] = [];
  for (const edge of search.edges) {
    if (edge.node.__typename === "Product") {
      products.push(parseHeatingProduct(edge.node));
    }
  }
  return { totalCount: search.totalCount, products };
}

/* ---------- Predictive search (typeahead) ---------- */

const PREDICTIVE_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}

  query Predictive($query: String!, $limit: Int!) __CTX__ {
    predictiveSearch(query: $query, limit: $limit, types: [PRODUCT, QUERY, COLLECTION]) {
      products {
        id
        handle
        title
        featuredImage { ...ImageFields }
        priceRange { minVariantPrice { ...MoneyFields } }
      }
      collections {
        id
        handle
        title
      }
      queries {
        text
      }
    }
  }
`;

interface PredictiveRaw {
  predictiveSearch: {
    products: Array<{
      id: string;
      handle: string;
      title: string;
      featuredImage: { url: string; altText: string | null } | null;
      priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
    }>;
    collections: Array<{ id: string; handle: string; title: string }>;
    queries: Array<{ text: string }>;
  } | null;
}

export interface PredictiveProduct {
  id: string;
  handle: string;
  title: string;
  featuredImage: { url: string; altText: string | null } | null;
  price: { amount: string; currencyCode: string };
}

export interface PredictiveResult {
  products: PredictiveProduct[];
  collections: Array<{ id: string; handle: string; title: string }>;
  queries: string[];
}

export async function getPredictiveSearch(
  client: StorefrontClient,
  query: string,
  options: { limit?: number } = {},
  context?: QueryContext,
): Promise<PredictiveResult> {
  const limit = options.limit ?? 6;
  const gql = PREDICTIVE_QUERY.replace(
    "__CTX__",
    inContextDirective(context),
  );

  const data = await client.query<PredictiveRaw>(gql, { query, limit }, context);
  const ps = data.predictiveSearch;
  if (!ps) return { products: [], collections: [], queries: [] };
  return {
    products: ps.products.map((p) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      featuredImage: p.featuredImage ?? null,
      price: p.priceRange.minVariantPrice,
    })),
    collections: ps.collections,
    queries: ps.queries.map((q) => q.text),
  };
}
