/**
 * Reusable GraphQL fragments. Spec ref: shop/09_storefront_api_query_plan.md §12.
 */

export const MONEY_FRAGMENT = /* GraphQL */ `
  fragment MoneyFields on MoneyV2 {
    amount
    currencyCode
  }
`;

export const IMAGE_FRAGMENT = /* GraphQL */ `
  fragment ImageFields on Image {
    url
    altText
    width
    height
  }
`;

export const VARIANT_FRAGMENT = /* GraphQL */ `
  fragment VariantFields on ProductVariant {
    id
    title
    sku
    availableForSale
    quantityAvailable
    selectedOptions {
      name
      value
    }
    price {
      ...MoneyFields
    }
    compareAtPrice {
      ...MoneyFields
    }
    image {
      ...ImageFields
    }
  }
`;

/**
 * Metafield identifiers we always pull for a heating product (PDP read).
 *
 * Use the `metafields(identifiers: $ids)` form (multiple targeted reads in one
 * field) rather than `metafield(namespace, key)` per field — the inline-list
 * form returns a positional array, so we can extend it freely without breaking
 * the parser (which keys by `${namespace}.${key}`).
 *
 * IMPORTANT: AI factual fields are stored under namespace `aix` (not `ai`) —
 * Shopify reserves `ai`. The product-schema parser exposes them under `common.aix`.
 */
/**
 * Design Refresh — April 2026. New product metafields surfaced by
 * `docs/metafields.md` § Design Refresh. Reused in both PDP and PLP card
 * fragments. DRY into one constant so adding a row never drifts between
 * the two query shapes.
 */
export const DESIGN_REFRESH_METAFIELD_IDENTIFIERS = [
  // Editorial (custom namespace)
  { namespace: "custom", key: "series" },
  { namespace: "custom", key: "warranty_years" },
  // Specs (specs namespace)
  { namespace: "specs", key: "wattage_w" },
  { namespace: "specs", key: "energy_class" },
  { namespace: "specs", key: "room_coverage_m2" },
  { namespace: "specs", key: "dimensions_w_h_d_mm" },
  { namespace: "specs", key: "installation_difficulty" },
] as const;

export const HEATING_PRODUCT_METAFIELD_IDENTIFIERS = [
  // Common (§2)
  { namespace: "custom", key: "subtitle" },
  { namespace: "custom", key: "short_description" },
  { namespace: "custom", key: "usp_1" },
  { namespace: "custom", key: "usp_2" },
  { namespace: "custom", key: "usp_3" },
  { namespace: "custom", key: "copy_status" },
  // Design Refresh — April 2026 editorial + warranty (custom namespace).
  { namespace: "custom", key: "series" },
  { namespace: "custom", key: "warranty_years" },
  { namespace: "merchandising", key: "badges" },
  { namespace: "merchandising", key: "compare_group" },
  { namespace: "shipping", key: "dispatch_note" },
  { namespace: "shipping", key: "delivery_note" },
  { namespace: "shipping", key: "return_summary" },
  { namespace: "seo", key: "override_title" },
  { namespace: "seo", key: "override_description" },
  { namespace: "seo", key: "override_h1" },
  { namespace: "seo", key: "primary_keyword" },
  { namespace: "seo", key: "secondary_keywords" },
  { namespace: "seo", key: "faq_group" },
  // AI-readable factual block — namespace is `aix`, not `ai` (Shopify-reserved).
  { namespace: "aix", key: "entity_summary" },
  { namespace: "aix", key: "key_facts" },
  { namespace: "aix", key: "compatibility_summary" },
  { namespace: "aix", key: "customer_question_summary" },
  { namespace: "aix", key: "allowed_claims" },
  { namespace: "aix", key: "restricted_claims" },
  // Optional `metaobject_reference` → `ai_summary_block` metaobject. When
  // set, the PDP renders the metaobject's `summary_text` inside <AiBlock>
  // as a clean factual paragraph for AI crawlers. The product-by-handle
  // query expands the metaobject's `fields` so the parser can extract
  // `summary_text` server-side.
  { namespace: "aix", key: "summary_block" },
  { namespace: "media", key: "primary_asset_id" },
  { namespace: "media", key: "gallery_asset_ids" },
  { namespace: "media", key: "primary_pdf_url" },
  { namespace: "media", key: "image_status" },
  // Long-form sections — EN preferred, DE fallback when EN translation pending.
  { namespace: "content", key: "sections_en" },
  { namespace: "content", key: "sections_de" },
  { namespace: "localization", key: "market_visibility" },
  // Heating specs (§3)
  { namespace: "specs", key: "width_mm" },
  { namespace: "specs", key: "height_mm" },
  { namespace: "specs", key: "depth_mm" },
  { namespace: "specs", key: "orientation" },
  { namespace: "specs", key: "connection_type" },
  { namespace: "specs", key: "pipe_spacing_mm" },
  { namespace: "specs", key: "heating_medium" },
  { namespace: "specs", key: "heat_output_75_65_20" },
  { namespace: "specs", key: "heat_output_70_55_20" },
  { namespace: "specs", key: "heat_output_55_45_20" },
  { namespace: "specs", key: "color" },
  { namespace: "specs", key: "finish" },
  { namespace: "specs", key: "material" },
  { namespace: "specs", key: "voltage" },
  { namespace: "specs", key: "mounting_kit_included" },
  { namespace: "specs", key: "valve_included" },
  { namespace: "specs", key: "thermostat_included" },
  { namespace: "specs", key: "heat_pump_compatible" },
  { namespace: "specs", key: "bathroom_suitable" },
  { namespace: "specs", key: "max_pressure_bar" },
  { namespace: "specs", key: "max_temp_c" },
  // Design Refresh — April 2026 specs (specs namespace).
  { namespace: "specs", key: "wattage_w" },
  { namespace: "specs", key: "energy_class" },
  { namespace: "specs", key: "room_coverage_m2" },
  { namespace: "specs", key: "dimensions_w_h_d_mm" },
  { namespace: "specs", key: "installation_difficulty" },
  // Heating filters
  { namespace: "filters", key: "product_type" },
  { namespace: "filters", key: "room_type" },
  { namespace: "filters", key: "orientation" },
  { namespace: "filters", key: "color_family" },
  { namespace: "filters", key: "connection_type" },
  { namespace: "filters", key: "width_bucket" },
  { namespace: "filters", key: "height_bucket" },
  { namespace: "filters", key: "heat_pump_compatible" },
  // Compatibility refs
  { namespace: "compatibility", key: "installation_guide" },
  { namespace: "compatibility", key: "compatibility_guide" },
] as const;

/**
 * Lighter-weight metafield set for PLP cards. We skip long-form sections,
 * AI summaries, and override-SEO fields — none of which the card renders.
 */
export const HEATING_PRODUCT_CARD_METAFIELD_IDENTIFIERS = [
  { namespace: "custom", key: "subtitle" },
  { namespace: "custom", key: "short_description" },
  // Design Refresh — series eyebrow on the card.
  { namespace: "custom", key: "series" },
  { namespace: "merchandising", key: "badges" },
  { namespace: "specs", key: "width_mm" },
  { namespace: "specs", key: "height_mm" },
  { namespace: "specs", key: "heating_medium" },
  { namespace: "specs", key: "heat_output_75_65_20" },
  { namespace: "specs", key: "color" },
  { namespace: "specs", key: "heat_pump_compatible" },
  { namespace: "specs", key: "bathroom_suitable" },
  // Design Refresh — wattage chip + dimensions chip on the card.
  { namespace: "specs", key: "wattage_w" },
  { namespace: "specs", key: "dimensions_w_h_d_mm" },
  { namespace: "filters", key: "product_type" },
  { namespace: "filters", key: "room_type" },
  { namespace: "filters", key: "color_family" },
  { namespace: "filters", key: "orientation" },
  { namespace: "localization", key: "market_visibility" },
] as const;

/** Convert identifier list to GraphQL `[{namespace, key}, ...]` literal. */
export function metafieldIdentifiersInline(
  ids: ReadonlyArray<{ namespace: string; key: string }>,
): string {
  return (
    "[" +
    ids
      .map(
        (i) => `{namespace: "${i.namespace}", key: "${i.key}"}`,
      )
      .join(", ") +
    "]"
  );
}

/**
 * Shopify standard `Product.media` connection. The catalog-sync image upload
 * pipeline writes here as `MediaImage` nodes (paid AI image regen) — using
 * `media` instead of `images` lets us future-proof for video/3D once those land.
 *
 * MediaImage is the only type we render today; non-image variants pass through
 * with their `__typename` so the gallery can skip them safely.
 */
export const MEDIA_FRAGMENT = /* GraphQL */ `
  fragment MediaFields on Media {
    __typename
    id: id
    alt
    mediaContentType
    ... on MediaImage {
      image {
        ...ImageFields
      }
    }
  }
`;

export const PRODUCT_CARD_FRAGMENT = /* GraphQL */ `
  fragment ProductCardFields on Product {
    id
    handle
    title
    vendor
    productType
    tags
    availableForSale
    priceRange {
      minVariantPrice { ...MoneyFields }
      maxVariantPrice { ...MoneyFields }
    }
    compareAtPriceRange {
      minVariantPrice { ...MoneyFields }
      maxVariantPrice { ...MoneyFields }
    }
    featuredImage {
      ...ImageFields
    }
    images(first: 2) {
      nodes { ...ImageFields }
    }
  }
`;
