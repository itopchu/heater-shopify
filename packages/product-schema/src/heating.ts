/**
 * Heating-specific product schema.
 * Spec ref: shop/08_shopify_metafields_metaobjects_definitions.md §3.
 */

import {
  type MetafieldRaw,
  type ProductBase,
  type ShopifyProductRaw,
  indexMetafields,
  parseCommonMetafields,
  readBoolean,
  readNumber,
  readString,
} from "./core";

export interface HeatingProductSpecs {
  width_mm?: number;
  height_mm?: number;
  depth_mm?: number;
  orientation?: "horizontal" | "vertical" | string;
  connection_type?: string;
  pipe_spacing_mm?: number;
  heating_medium?: "hydronic" | "electric" | "dual_fuel" | string;
  heat_output_75_65_20?: number;
  heat_output_70_55_20?: number;
  heat_output_55_45_20?: number;
  color?: string;
  finish?: string;
  material?: string;
  voltage?: string;
  mounting_kit_included?: boolean;
  valve_included?: boolean;
  thermostat_included?: boolean;
  heat_pump_compatible?: boolean;
  bathroom_suitable?: boolean;
  max_pressure_bar?: number;
  max_temp_c?: number;
  /* ------------------------------------------------------------------ */
  /* Design Refresh — April 2026 (namespace: `specs`).                  */
  /* Merchant-editable display fields layered on top of the legacy      */
  /* width/height/etc. The PDP spec block + product card chip prefer    */
  /* these where set. Backfill is partial — guard with `?.`.            */
  /* ------------------------------------------------------------------ */
  /** Canonical wattage. Storefront card chip + PDP kW chip read this. */
  wattage_w?: number;
  /** EU energy class label, e.g. "A++" or "A". */
  energy_class?: string;
  /** Decimal m² coverage, rendered as "Heats rooms up to {N} m²". */
  room_coverage_m2?: number;
  /** Pre-formatted display string, e.g. "600 × 1800 × 90 mm". */
  dimensions_w_h_d_mm?: string;
  /** Enum: "easy" | "standard" | "professional". */
  installation_difficulty?: "easy" | "standard" | "professional" | string;
}

/** Editorial-only fields (namespace: `custom`). */
export interface HeatingProductEditorial {
  /** Series wordmark — e.g. "ASTORIA", "PULLMAN". Used by card eyebrow + PDP. */
  series?: string;
}

/** Warranty group (namespace: `custom`). */
export interface HeatingProductWarranty {
  /** Manufacturer warranty in years; defaults to 10 if absent. */
  years?: number;
}

export interface HeatingProductFilters {
  product_type?: string;
  room_type?: string;
  orientation?: string;
  color_family?: string;
  connection_type?: string;
  width_bucket?: string;
  height_bucket?: string;
  heat_pump_compatible?: boolean;
}

export interface HeatingProductCompatibility {
  installation_guide_id?: string;
  compatibility_guide_id?: string;
}

export interface HeatingProduct extends ProductBase {
  category: "heating";
  specs: HeatingProductSpecs;
  filters: HeatingProductFilters;
  compatibility: HeatingProductCompatibility;
  /** Editorial fields (series wordmark) — Design Refresh April 2026. */
  editorial?: HeatingProductEditorial;
  /** Warranty info — Design Refresh April 2026. */
  warranty?: HeatingProductWarranty;
}

function parseHeatingSpecs(idx: Map<string, MetafieldRaw>): HeatingProductSpecs {
  return {
    width_mm: readNumber(idx, "specs.width_mm"),
    height_mm: readNumber(idx, "specs.height_mm"),
    depth_mm: readNumber(idx, "specs.depth_mm"),
    orientation: readString(idx, "specs.orientation"),
    connection_type: readString(idx, "specs.connection_type"),
    pipe_spacing_mm: readNumber(idx, "specs.pipe_spacing_mm"),
    heating_medium: readString(idx, "specs.heating_medium"),
    heat_output_75_65_20: readNumber(idx, "specs.heat_output_75_65_20"),
    heat_output_70_55_20: readNumber(idx, "specs.heat_output_70_55_20"),
    heat_output_55_45_20: readNumber(idx, "specs.heat_output_55_45_20"),
    color: readString(idx, "specs.color"),
    finish: readString(idx, "specs.finish"),
    material: readString(idx, "specs.material"),
    voltage: readString(idx, "specs.voltage"),
    mounting_kit_included: readBoolean(idx, "specs.mounting_kit_included"),
    valve_included: readBoolean(idx, "specs.valve_included"),
    thermostat_included: readBoolean(idx, "specs.thermostat_included"),
    heat_pump_compatible: readBoolean(idx, "specs.heat_pump_compatible"),
    bathroom_suitable: readBoolean(idx, "specs.bathroom_suitable"),
    max_pressure_bar: readNumber(idx, "specs.max_pressure_bar"),
    max_temp_c: readNumber(idx, "specs.max_temp_c"),
    // Design Refresh — April 2026 (specs namespace).
    wattage_w: readNumber(idx, "specs.wattage_w"),
    energy_class: readString(idx, "specs.energy_class"),
    room_coverage_m2: readNumber(idx, "specs.room_coverage_m2"),
    dimensions_w_h_d_mm: readString(idx, "specs.dimensions_w_h_d_mm"),
    installation_difficulty: readString(idx, "specs.installation_difficulty"),
  };
}

/**
 * Parse editorial group (namespace `custom`). Returns `undefined` when none of
 * the editorial keys are populated — keeps the typed product clean.
 */
function parseHeatingEditorial(
  idx: Map<string, MetafieldRaw>,
): HeatingProductEditorial | undefined {
  const series = readString(idx, "custom.series");
  if (!series) return undefined;
  return {series};
}

/**
 * Parse warranty group (namespace `custom`). Returns `undefined` when nothing
 * is set — the storefront falls back to a "10-year warranty" default copy.
 */
function parseHeatingWarranty(
  idx: Map<string, MetafieldRaw>,
): HeatingProductWarranty | undefined {
  const years = readNumber(idx, "custom.warranty_years");
  if (years == null) return undefined;
  return {years};
}

function parseHeatingFilters(idx: Map<string, MetafieldRaw>): HeatingProductFilters {
  return {
    product_type: readString(idx, "filters.product_type"),
    room_type: readString(idx, "filters.room_type"),
    orientation: readString(idx, "filters.orientation"),
    color_family: readString(idx, "filters.color_family"),
    connection_type: readString(idx, "filters.connection_type"),
    width_bucket: readString(idx, "filters.width_bucket"),
    height_bucket: readString(idx, "filters.height_bucket"),
    heat_pump_compatible: readBoolean(idx, "filters.heat_pump_compatible"),
  };
}

/**
 * Parse a raw Storefront API product into a typed HeatingProduct.
 * Missing metafields → undefined (graceful, per spec §14 fallback rules).
 */
export function parseHeatingProduct(raw: ShopifyProductRaw): HeatingProduct {
  const idx = indexMetafields(raw.metafields);
  const compatibilityRef =
    idx.get("compatibility.installation_guide")?.reference?.id;
  const compatibilityGuideRef =
    idx.get("compatibility.compatibility_guide")?.reference?.id;

  return {
    category: "heating",
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    descriptionHtml: raw.descriptionHtml,
    description: raw.description,
    vendor: raw.vendor,
    productType: raw.productType,
    tags: raw.tags,
    availableForSale: raw.availableForSale,
    priceRange: raw.priceRange,
    compareAtPriceRange: raw.compareAtPriceRange,
    options: raw.options,
    variants: raw.variants.nodes,
    images: raw.images.nodes,
    media: raw.media?.nodes ?? [],
    featuredImage: raw.featuredImage,
    seo: raw.seo,
    common: parseCommonMetafields(idx),
    specs: parseHeatingSpecs(idx),
    filters: parseHeatingFilters(idx),
    compatibility: {
      installation_guide_id:
        typeof compatibilityRef === "string" ? compatibilityRef : undefined,
      compatibility_guide_id:
        typeof compatibilityGuideRef === "string" ? compatibilityGuideRef : undefined,
    },
    editorial: parseHeatingEditorial(idx),
    warranty: parseHeatingWarranty(idx),
    collectionHandles: raw.collections?.nodes.map((c) => c.handle) ?? [],
    collections:
      raw.collections?.nodes.map((c) => ({handle: c.handle, title: c.title})) ?? [],
  };
}

/** Stub types — real schema lands when those stores ship. */
export interface UnderwearProduct extends ProductBase {
  category: "underwear";
}

export interface FurnitureProduct extends ProductBase {
  category: "furniture";
}
