import {
  parseHeatingProduct,
  type HeatingProduct,
  type ShopifyCollectionRaw,
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

/**
 * Lightweight collection query — uses card-level product fields plus the heating
 * metafield set so PLP cards can render spec chips.
 */
const COLLECTION_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${PRODUCT_CARD_FRAGMENT}

  query CollectionByHandle($handle: String!, $first: Int!) __CTX__ {
    collection(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      image { ...ImageFields }
      seo { title description }
      products(first: $first) {
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
  }
`;

export interface CollectionResult {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  image: ShopifyCollectionRaw["image"];
  seo: ShopifyCollectionRaw["seo"];
  products: HeatingProduct[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface RawResponse {
  collection: (Omit<ShopifyCollectionRaw, "metafields"> & {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: ShopifyProductRaw[];
    };
  }) | null;
}

export async function getCollectionByHandle(
  client: StorefrontClient,
  handle: string,
  options: { first?: number } = {},
  context?: QueryContext,
): Promise<CollectionResult | null> {
  const first = options.first ?? 24;
  const gql = COLLECTION_QUERY
    .replace("__CTX__", inContextDirective(context))
    .replace("__MF_IDS__", HEATING_CARD_METAFIELD_LITERAL);

  const data = await client.query<RawResponse>(gql, { handle, first }, context);
  if (!data.collection) return null;
  const c = data.collection;
  return {
    id: c.id,
    handle: c.handle,
    title: c.title,
    description: c.description,
    descriptionHtml: c.descriptionHtml,
    image: c.image,
    seo: c.seo,
    pageInfo: c.products.pageInfo,
    products: c.products.nodes.map(parseHeatingProduct),
  };
}

/** Fetch first N products globally — used by Bestsellers fallback when no curated collection exists. */
const PRODUCTS_LIST_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${PRODUCT_CARD_FRAGMENT}

  query ProductsList($first: Int!, $query: String) __CTX__ {
    products(first: $first, query: $query, sortKey: BEST_SELLING) {
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

interface ProductsListRaw {
  products: { nodes: ShopifyProductRaw[] };
}

export async function getProductsList(
  client: StorefrontClient,
  options: { first?: number; query?: string } = {},
  context?: QueryContext,
): Promise<HeatingProduct[]> {
  const first = options.first ?? 8;
  const gql = PRODUCTS_LIST_QUERY
    .replace("__CTX__", inContextDirective(context))
    .replace("__MF_IDS__", HEATING_CARD_METAFIELD_LITERAL);

  const data = await client.query<ProductsListRaw>(
    gql,
    { first, query: options.query ?? null },
    context,
  );
  return data.products.nodes.map(parseHeatingProduct);
}
