/**
 * Pure helpers that turn raw HeatingProduct data into UI-ready chunks.
 * Used by both PDP and PLP. No React, no fetch — just data shaping so it can be
 * unit-tested cheaply once tests land.
 */

import type {
  AiKeyFact,
  ContentSection,
  HeatingProduct,
  Image as ImageType,
  ProductVariant,
} from "@gberg/product-schema";

/* ------------------------------------------------------------------ */
/* Series eyebrow — mirrors the existing Liquid card logic.            */
/* ------------------------------------------------------------------ */

const KNOWN_SERIES = [
  "ASTORIA",
  "ELANOR",
  "FLORA",
  "PULLMAN",
  "TWISTER",
  "KONRAD",
  "PLATIS",
  "LAVINNO",
] as const;

export type Series = (typeof KNOWN_SERIES)[number];

/**
 * Resolve a product's series from its tags. Tag matching is case-insensitive.
 * Returns the first known series found, or `null` if none.
 */
export function resolveSeries(tags: readonly string[]): Series | null {
  const normalised = new Set(tags.map((t) => t.toUpperCase()));
  for (const s of KNOWN_SERIES) {
    if (normalised.has(s)) return s;
  }
  return null;
}

/** Capitalised, presentable series label (e.g. "Astoria"). */
export function seriesLabel(series: Series): string {
  return series.charAt(0) + series.slice(1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Color swatches.                                                     */
/* ------------------------------------------------------------------ */

const COLOR_FAMILY_HEX: Record<string, string> = {
  anthracite: "#3a3d40",
  black: "#111111",
  white: "#f5f5f5",
  chrome: "#cfd2d6",
  silver: "#bfc1c4",
  grey: "#7d8186",
  gray: "#7d8186",
  red: "#c8102e",
};

const RAW_COLOR_HEX: Record<string, string> = {
  anthrazit: "#3a3d40",
  schwarz: "#111111",
  weiss: "#f5f5f5",
  weiß: "#f5f5f5",
};

/** Map a `filters.color_family` or `specs.color` value to a hex swatch. */
export function colorFamilyHex(value: string | undefined): string | null {
  if (!value) return null;
  const k = value.trim().toLowerCase();
  return COLOR_FAMILY_HEX[k] ?? RAW_COLOR_HEX[k] ?? null;
}

/* ------------------------------------------------------------------ */
/* Quick facts — 4-6 chips of factual data for PDP above-the-fold.     */
/* ------------------------------------------------------------------ */

export interface QuickFact {
  label: string;
  value: string;
}

/**
 * Wattage parser — pulls a number followed by "W" from a variant title or SKU.
 * Returns `null` if no clean match. Catches strings like "1000 W", "750W",
 * "1.5kW" (converts kW → W).
 */
export function parseWattage(text: string | null | undefined): number | null {
  if (!text) return null;
  const kw = /(\d+(?:[.,]\d+)?)\s*kW/i.exec(text);
  if (kw) {
    const n = Number(kw[1]!.replace(",", "."));
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }
  const w = /(\d{2,5})\s*W\b/i.exec(text);
  if (w) {
    const n = Number(w[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function buildQuickFacts(p: HeatingProduct, currentVariant: ProductVariant | null): QuickFact[] {
  const out: QuickFact[] = [];
  const productType = p.filters.product_type ?? p.specs.color; // type beats raw color
  if (p.filters.product_type) {
    out.push({ label: "Type", value: prettyProductType(p.filters.product_type) });
  } else if (p.productType) {
    out.push({ label: "Type", value: p.productType });
  }
  if (p.specs.heating_medium) {
    out.push({ label: "Heating", value: prettyHeatingMedium(p.specs.heating_medium) });
  }
  if (p.specs.color) {
    out.push({ label: "Colour", value: titleCase(p.specs.color) });
  } else if (p.filters.color_family) {
    out.push({ label: "Colour", value: titleCase(p.filters.color_family) });
  }
  if (p.specs.connection_type) {
    out.push({ label: "Connection", value: p.specs.connection_type });
  }
  // Wattage from variant title (electric) — many products encode "1000 W" there.
  const wattage =
    parseWattage(currentVariant?.title) ??
    parseWattage(p.variants[0]?.title) ??
    parseWattage(p.title);
  if (wattage != null) out.push({ label: "Output", value: `${wattage} W` });
  if (p.specs.width_mm != null && p.specs.height_mm != null) {
    out.push({
      label: "Dimensions",
      value: `${p.specs.width_mm} × ${p.specs.height_mm} mm`,
    });
  }
  return out.slice(0, 6);
  // unused but keeps tsc honest if we later branch on productType
  void productType;
}

function prettyProductType(value: string): string {
  switch (value) {
    case "radiator":
      return "Radiator";
    case "towel_radiator":
      return "Towel radiator";
    case "underfloor_heating":
      return "Underfloor heating";
    case "bathroom_fixture":
      return "Bathroom fixture";
    case "accessory":
      return "Accessory";
    default:
      return titleCase(value.replace(/_/g, " "));
  }
}

function prettyHeatingMedium(value: string): string {
  switch (value) {
    case "hydronic":
      return "Hydronic";
    case "electric":
      return "Electric";
    case "dual_fuel":
      return "Dual fuel";
    default:
      return titleCase(value.replace(/_/g, " "));
  }
}

function titleCase(s: string): string {
  if (!s) return "";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Sections — split EN sections into "FAQ-shaped" and "narrative".     */
/* ------------------------------------------------------------------ */

/**
 * A section is "FAQ-shaped" if its title looks like a question (ends with `?`)
 * or starts with common interrogative words. Used as a stand-in for
 * `seo.faq_group` until those metaobject references get linked.
 */
export function isFaqShapedSection(s: ContentSection): boolean {
  const t = s.title.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  return /^(what|how|why|when|where|can|do|does|is|are|will)\b/i.test(t);
}

/**
 * Pick the EN sections to render, with a fallback to DE sections + a
 * "translation pending" note so the page is never blank.
 */
export function pickSections(p: HeatingProduct): {
  sections: ContentSection[];
  source: "en" | "de" | null;
} {
  const en = p.common.content?.sections_en ?? [];
  if (en.length > 0) return { sections: en, source: "en" };
  const de = p.common.content?.sections_de ?? [];
  if (de.length > 0) return { sections: de, source: "de" };
  return { sections: [], source: null };
}

/* ------------------------------------------------------------------ */
/* Media → Image[] adapter — prefers `product.media` MediaImage nodes.  */
/* ------------------------------------------------------------------ */

/**
 * Returns the best image list for the gallery. Prefers `product.media`
 * (where the catalog-sync pipeline uploads regenerated MediaImage nodes);
 * falls back to `product.images` for legacy products.
 */
export function galleryImages(p: HeatingProduct): ImageType[] {
  const fromMedia: ImageType[] = [];
  for (const node of p.media ?? []) {
    if (node.__typename === "MediaImage") {
      const mi = node as { image?: ImageType | null };
      if (mi.image) fromMedia.push(mi.image);
    }
  }
  if (fromMedia.length > 0) return fromMedia;
  return p.images ?? [];
}

/* ------------------------------------------------------------------ */
/* AI key facts fallback.                                              */
/* ------------------------------------------------------------------ */

/**
 * If the product has no `aix.key_facts` populated yet, derive a small fallback
 * from the spec metafields so the AI block isn't blank. Returns `null` to
 * signal the block should still be hidden if there's truly nothing to say.
 */
export function fallbackKeyFacts(p: HeatingProduct): AiKeyFact[] | null {
  const out: AiKeyFact[] = [];
  if (p.filters.product_type) {
    out.push({ label: "Type", value: prettyProductType(p.filters.product_type) });
  }
  if (p.specs.heating_medium) {
    out.push({ label: "Heating", value: prettyHeatingMedium(p.specs.heating_medium) });
  }
  if (p.specs.material) out.push({ label: "Material", value: titleCase(p.specs.material) });
  if (p.specs.color) out.push({ label: "Colour", value: titleCase(p.specs.color) });
  if (p.specs.connection_type) out.push({ label: "Connection", value: p.specs.connection_type });
  return out.length > 0 ? out : null;
}
