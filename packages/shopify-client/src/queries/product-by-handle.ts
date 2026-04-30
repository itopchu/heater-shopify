import {
  parseHeatingProduct,
  type HeatingProduct,
  type ShopifyProductRaw,
} from "@gberg/product-schema";
import {
  HEATING_PRODUCT_METAFIELD_IDENTIFIERS,
  IMAGE_FRAGMENT,
  MEDIA_FRAGMENT,
  MONEY_FRAGMENT,
  VARIANT_FRAGMENT,
  metafieldIdentifiersInline,
} from "../fragments";
import {
  inContextDirective,
  type QueryContext,
  type StorefrontClient,
} from "../client";

const HEATING_METAFIELD_LITERAL = metafieldIdentifiersInline(
  HEATING_PRODUCT_METAFIELD_IDENTIFIERS,
);

const PRODUCT_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${VARIANT_FRAGMENT}
  ${MEDIA_FRAGMENT}

  query ProductByHandle($handle: String!) __CTX__ {
    product(handle: $handle) {
      id
      handle
      title
      descriptionHtml
      description
      vendor
      productType
      tags
      availableForSale
      totalInventory
      priceRange {
        minVariantPrice { ...MoneyFields }
        maxVariantPrice { ...MoneyFields }
      }
      compareAtPriceRange {
        minVariantPrice { ...MoneyFields }
        maxVariantPrice { ...MoneyFields }
      }
      options {
        id
        name
        values
      }
      featuredImage { ...ImageFields }
      images(first: 12) {
        nodes { ...ImageFields }
      }
      media(first: 12) {
        nodes { ...MediaFields }
      }
      variants(first: 50) {
        nodes { ...VariantFields }
      }
      collections(first: 8) {
        nodes { id handle title }
      }
      seo { title description }
      metafields(identifiers: __MF_IDS__) {
        namespace
        key
        type
        value
        reference {
          __typename
          ... on Metaobject { id type handle }
        }
      }
    }
  }
`;

interface RawResponse {
  product: ShopifyProductRaw | null;
}

/**
 * Fetch a heating product by handle. Returns `null` if not found.
 */
export async function getHeatingProductByHandle(
  client: StorefrontClient,
  handle: string,
  context?: QueryContext,
): Promise<HeatingProduct | null> {
  const gql = PRODUCT_QUERY
    .replace("__CTX__", inContextDirective(context))
    .replace("__MF_IDS__", HEATING_METAFIELD_LITERAL);

  const data = await client.query<RawResponse>(gql, { handle }, context);
  if (!data.product) return null;
  return parseHeatingProduct(data.product);
}
