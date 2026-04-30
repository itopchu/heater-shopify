/**
 * Pure helpers that turn raw HeatingProduct data into UI-ready chunks.
 * Used by both PDP and PLP. No React, no fetch — just data shaping.
 *
 * Ported verbatim from apps/store-heating/lib/heating-derived.ts.
 */

import type {ReactNode} from 'react';
import type {
  AiKeyFact,
  ContentSection,
  HeatingProduct,
  Image as ImageType,
  ProductVariant,
} from '@gberg/product-schema';

/* ------------------------------------------------------------------ */
/* Series eyebrow.                                                     */
/* ------------------------------------------------------------------ */

const KNOWN_SERIES = [
  'ASTORIA',
  'ELANOR',
  'FLORA',
  'PULLMAN',
  'TWISTER',
  'KONRAD',
  'PLATIS',
  'LAVINNO',
] as const;

export type Series = (typeof KNOWN_SERIES)[number];

export function resolveSeries(tags: readonly string[]): Series | null {
  const normalised = new Set(tags.map((t) => t.toUpperCase()));
  for (const s of KNOWN_SERIES) {
    if (normalised.has(s)) return s;
  }
  return null;
}

export function seriesLabel(series: Series): string {
  return series.charAt(0) + series.slice(1).toLowerCase();
}

/**
 * Resolve the series eyebrow string for a heating product.
 * Prefers the merchant-controlled `custom.series` metafield (Design Refresh
 * April 2026) over the legacy tag-derived series; falls back to `null` when
 * neither is present so the caller can drop the eyebrow gracefully.
 */
export function resolveSeriesLabel(p: HeatingProduct): string | null {
  const explicit = p.editorial?.series?.trim();
  if (explicit) {
    // Merchant-supplied — title-case the all-caps storage form for display
    // (KNOWN_SERIES tags are uppercase, but a merchant might type "Astoria").
    const upper = explicit.toUpperCase();
    if ((KNOWN_SERIES as readonly string[]).includes(upper)) {
      return seriesLabel(upper as Series);
    }
    return explicit;
  }
  const fromTags = resolveSeries(p.tags);
  return fromTags ? seriesLabel(fromTags) : null;
}

/* ------------------------------------------------------------------ */
/* Color swatches.                                                     */
/* ------------------------------------------------------------------ */

const COLOR_FAMILY_HEX: Record<string, string> = {
  anthracite: '#3a3d40',
  black: '#111111',
  white: '#f5f5f5',
  chrome: '#cfd2d6',
  silver: '#bfc1c4',
  grey: '#7d8186',
  gray: '#7d8186',
  red: '#c8102e',
};

const RAW_COLOR_HEX: Record<string, string> = {
  anthrazit: '#3a3d40',
  schwarz: '#111111',
  weiss: '#f5f5f5',
  weiß: '#f5f5f5',
};

export function colorFamilyHex(value: string | undefined): string | null {
  if (!value) return null;
  const k = value.trim().toLowerCase();
  return COLOR_FAMILY_HEX[k] ?? RAW_COLOR_HEX[k] ?? null;
}

/* ------------------------------------------------------------------ */
/* Quick facts.                                                        */
/* ------------------------------------------------------------------ */

export interface QuickFact {
  label: string;
  value: string;
}

export function parseWattage(text: string | null | undefined): number | null {
  if (!text) return null;
  const kw = /(\d+(?:[.,]\d+)?)\s*kW/i.exec(text);
  if (kw) {
    const n = Number(kw[1]!.replace(',', '.'));
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }
  const w = /(\d{2,5})\s*W\b/i.exec(text);
  if (w) {
    const n = Number(w[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Editorial structured-spec row consumed by the PDP `<SpecsTable>` block.
 * Each row maps 1:1 onto a `SpecsTableRow` shape (`{icon, label, value, unit}`)
 * but with the icon supplied as a JSX node by the caller — this file stays
 * presentation-free so it can be unit-tested without a React renderer.
 *
 * Intentionally tolerant of missing fields: a row with no value is dropped
 * by `<SpecsTable>` automatically, but we filter here too for clarity.
 */
export interface StructuredSpecRowInput {
  /** Stable key — drives the icon lookup table on the call site. */
  kind:
    | 'wattage'
    | 'energy_class'
    | 'room_coverage'
    | 'dimensions'
    | 'installation'
    | 'connection'
    | 'warranty'
    | 'heat_pump'
    | 'mounting_kit'
    | 'material'
    | 'color';
  label: string;
  value: string;
  unit?: string;
  helpText?: string;
}

const INSTALL_LABEL: Record<string, string> = {
  easy: 'Easy — DIY',
  standard: 'Standard',
  professional: 'Professional installer',
};

/**
 * Distill a HeatingProduct into the ordered editorial spec block. Filters out
 * rows whose value is missing — the PDP renders a consistent "spec sheet
 * coming soon" empty state when the array is fully empty.
 *
 * Order: wattage → energy → room coverage → dimensions → installation →
 * connection → warranty → heat-pump compatibility → mounting kit → material
 * → color. Mirrors the `docs/design-refresh-data-model.md` § PDP table.
 */
export function buildStructuredSpecRows(p: HeatingProduct): StructuredSpecRowInput[] {
  const rows: StructuredSpecRowInput[] = [];

  // Wattage — prefer canonical specs.wattage_w, fall back to legacy heat_output.
  const wattage =
    p.specs.wattage_w != null && p.specs.wattage_w > 0
      ? p.specs.wattage_w
      : p.specs.heat_output_75_65_20 != null && p.specs.heat_output_75_65_20 > 0
        ? p.specs.heat_output_75_65_20
        : undefined;
  if (wattage != null) {
    // Display in kW when ≥ 1000W to keep the chip readable.
    const display =
      wattage >= 1000 ? `${(wattage / 1000).toFixed(1).replace(/\.0$/, '')}` : `${wattage}`;
    const unit = wattage >= 1000 ? 'kW' : 'W';
    rows.push({
      kind: 'wattage',
      label: 'Heat output',
      value: display,
      unit,
    });
  }

  if (p.specs.energy_class) {
    rows.push({
      kind: 'energy_class',
      label: 'Energy class',
      value: p.specs.energy_class,
    });
  }

  if (p.specs.room_coverage_m2 != null && p.specs.room_coverage_m2 > 0) {
    rows.push({
      kind: 'room_coverage',
      label: 'Room coverage',
      value: `Up to ${p.specs.room_coverage_m2}`,
      unit: 'm²',
    });
  }

  // Dimensions — prefer the merchant display string; fall back to numeric.
  const dimDisplay = p.specs.dimensions_w_h_d_mm?.trim();
  if (dimDisplay) {
    rows.push({kind: 'dimensions', label: 'Dimensions', value: dimDisplay, unit: 'mm'});
  } else if (p.specs.width_mm != null && p.specs.height_mm != null) {
    const depth = p.specs.depth_mm != null ? ` × ${p.specs.depth_mm}` : '';
    rows.push({
      kind: 'dimensions',
      label: 'Dimensions',
      value: `${p.specs.width_mm} × ${p.specs.height_mm}${depth}`,
      unit: 'mm',
    });
  }

  if (p.specs.installation_difficulty) {
    const k = p.specs.installation_difficulty.toLowerCase();
    rows.push({
      kind: 'installation',
      label: 'Installation',
      value: INSTALL_LABEL[k] ?? titleCase(p.specs.installation_difficulty),
    });
  }

  if (p.specs.connection_type) {
    rows.push({
      kind: 'connection',
      label: 'Connection',
      value: titleCase(p.specs.connection_type),
    });
  }

  // Warranty is intentionally NOT pushed here. The buy-box <TrustStrip>
  // already surfaces "{N}-year warranty" as a prominent icon-driven trust
  // mark directly above this spec table; adding a "Warranty | 10 years"
  // row here put the same signal in two formats inches apart on the PDP.
  // The trust strip is the canonical home for it. If detailed warranty
  // copy (terms PDF, transferability, etc.) ever needs to live in the
  // table, surface it as a richer row — not as a redundant N-years line.

  if (p.specs.heat_pump_compatible === true) {
    rows.push({
      kind: 'heat_pump',
      label: 'Heat-pump ready',
      value: 'Yes',
    });
  }

  if (p.specs.mounting_kit_included === true) {
    rows.push({
      kind: 'mounting_kit',
      label: 'Mounting kit',
      value: 'Included',
    });
  }

  if (p.specs.material) {
    rows.push({kind: 'material', label: 'Material', value: titleCase(p.specs.material)});
  }

  if (p.specs.color) {
    rows.push({kind: 'color', label: 'Colour', value: titleCase(p.specs.color)});
  }

  return rows.filter((r) => r.value !== '' && r.value != null);
}

/**
 * Convert the structured rows into `<SpecsTable>` rows by attaching the
 * caller-provided icon-by-kind map. The PDP route owns the JSX so we don't
 * import React/icons here.
 */
export function withSpecRowIcons(
  rows: StructuredSpecRowInput[],
  icons: Partial<Record<StructuredSpecRowInput['kind'], ReactNode>>,
): Array<{label: string; value: string; unit?: string; icon?: ReactNode}> {
  return rows.map((r) => ({
    label: r.label,
    value: r.value,
    unit: r.unit,
    icon: icons[r.kind],
  }));
}

export function buildQuickFacts(
  p: HeatingProduct,
  currentVariant: ProductVariant | null,
): QuickFact[] {
  const out: QuickFact[] = [];
  if (p.filters.product_type) {
    out.push({label: 'Type', value: prettyProductType(p.filters.product_type)});
  } else if (p.productType) {
    out.push({label: 'Type', value: p.productType});
  }
  if (p.specs.heating_medium) {
    out.push({
      label: 'Heating',
      value: prettyHeatingMedium(p.specs.heating_medium),
    });
  }
  if (p.specs.color) {
    out.push({label: 'Colour', value: titleCase(p.specs.color)});
  } else if (p.filters.color_family) {
    out.push({label: 'Colour', value: titleCase(p.filters.color_family)});
  }
  if (p.specs.connection_type) {
    out.push({label: 'Connection', value: p.specs.connection_type});
  }
  const wattage =
    parseWattage(currentVariant?.title) ??
    parseWattage(p.variants[0]?.title) ??
    parseWattage(p.title);
  if (wattage != null) out.push({label: 'Output', value: `${wattage} W`});
  if (p.specs.width_mm != null && p.specs.height_mm != null) {
    out.push({
      label: 'Dimensions',
      value: `${p.specs.width_mm} × ${p.specs.height_mm} mm`,
    });
  }
  return out.slice(0, 6);
}

function prettyProductType(value: string): string {
  switch (value) {
    case 'radiator':
      return 'Radiator';
    case 'towel_radiator':
      return 'Towel radiator';
    case 'underfloor_heating':
      return 'Underfloor heating';
    case 'bathroom_fixture':
      return 'Bathroom fixture';
    case 'accessory':
      return 'Accessory';
    default:
      return titleCase(value.replace(/_/g, ' '));
  }
}

function prettyHeatingMedium(value: string): string {
  switch (value) {
    case 'hydronic':
      return 'Hydronic';
    case 'electric':
      return 'Electric';
    case 'dual_fuel':
      return 'Dual fuel';
    default:
      return titleCase(value.replace(/_/g, ' '));
  }
}

function titleCase(s: string): string {
  if (!s) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Sections.                                                           */
/* ------------------------------------------------------------------ */

export function isFaqShapedSection(s: ContentSection): boolean {
  const t = s.title.trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  return /^(what|how|why|when|where|can|do|does|is|are|will)\b/i.test(t);
}

export function pickSections(p: HeatingProduct): {
  sections: ContentSection[];
  source: 'en' | 'de' | null;
} {
  const en = p.common.content?.sections_en ?? [];
  if (en.length > 0) return {sections: en, source: 'en'};
  const de = p.common.content?.sections_de ?? [];
  if (de.length > 0) return {sections: de, source: 'de'};
  return {sections: [], source: null};
}

/* ------------------------------------------------------------------ */
/* Media → Image[] adapter.                                            */
/* ------------------------------------------------------------------ */

export function galleryImages(p: HeatingProduct): ImageType[] {
  const fromMedia: ImageType[] = [];
  for (const node of p.media ?? []) {
    if (node.__typename === 'MediaImage') {
      const mi = node as {image?: ImageType | null};
      if (mi.image) fromMedia.push(mi.image);
    }
  }
  if (fromMedia.length > 0) return fromMedia;
  return p.images ?? [];
}

/* ------------------------------------------------------------------ */
/* Breadcrumb (Track B — April 2026).                                  */
/* ------------------------------------------------------------------ */

/**
 * Per-collection landing-page label. Mirrors the German taxonomy used by
 * `product-catalog/products/*.json#breadcrumb[]`. The keys are the
 * Shopify collection handles we ship.
 */
// Source code is English-only. Shopify Translate & Adapt handles any
// non-English rendering at the platform layer.
const COLLECTION_LABELS: Record<string, string> = {
  badheizkorper: 'Bathroom radiators',
  'badheizkorper-elektrisch': 'Electric bathroom radiators',
  wohnraumheizkorper: 'Living-room radiators',
  austauschheizkorper: 'Replacement radiators',
  zubehor: 'Accessories',
  bad: 'Bathroom',
  fussbodenheizungsrohre: 'Underfloor heating',
};

export interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

/**
 * Build the PDP breadcrumb trail.
 *
 * Preference order:
 *  1. `seo.breadcrumb_override` metafield (merchant-tuned)
 *  2. Derived from `collectionHandles[0]` + product title
 *
 * The pre-derived `breadcrumb[]` array on each `product-catalog/products/*.json`
 * record uses German labels (e.g. "Heim → Wohnraumheizkörper → <title>"). The
 * Storefront API doesn't expose that array directly — we mirror its shape by
 * mapping the primary collection handle to a localised label.
 *
 * "Heim"/"Home" is intentionally not a link to `/` since the brand link in
 * the header already covers that — the breadcrumb is purely a position
 * indicator.
 */
export function buildBreadcrumb(
  product: HeatingProduct,
  locale: string,
): BreadcrumbCrumb[] {
  const labels = COLLECTION_LABELS;
  const home = 'Home';

  const override = product.common.seo?.breadcrumb_override;
  if (override && override.length > 0) {
    // Merchant override is plain strings; only the last is the page label,
    // intermediates link back to nothing meaningful, so we keep them as text.
    return override.map((label, i) => ({
      label,
      href: i === 0 ? `/${locale}` : undefined,
    }));
  }

  const collectionHandle = product.collectionHandles?.[0];
  const crumbs: BreadcrumbCrumb[] = [{label: home, href: `/${locale}`}];
  if (collectionHandle && labels[collectionHandle]) {
    crumbs.push({
      label: labels[collectionHandle]!,
      href: `/${locale}/collections/${collectionHandle}`,
    });
  } else if (collectionHandle) {
    crumbs.push({
      label: collectionHandle.replace(/-/g, ' '),
      href: `/${locale}/collections/${collectionHandle}`,
    });
  }
  crumbs.push({label: product.title});
  return crumbs;
}

/* ------------------------------------------------------------------ */
/* Sibling-color cross-link (Track B — April 2026).                    */
/* ------------------------------------------------------------------ */

export interface SiblingColor {
  handle: string;
  title: string;
  /** Display-normalised colour ("Weiß", "Schwarz", …). */
  color: string;
  /** Raw color used to look up swatch hex. */
  rawColor: string;
}

/**
 * Resolve sibling-colour products by series. A "sibling" is any product
 * whose `editorial.series` (or tag-derived series) matches the current
 * product's series, but whose `color` differs.
 *
 * Source: pre-fetched product set (typically from a `getAllProducts` call
 * issued by the route loader). We dedupe by handle + colour so two
 * variants of the same colour (rare but possible) collapse to one card.
 */
export function findSiblingColors(
  product: HeatingProduct,
  candidates: readonly HeatingProduct[],
): SiblingColor[] {
  const ownSeries = resolveSeriesLabel(product);
  if (!ownSeries) return [];
  const ownColor = (product.specs.color ?? '').trim().toLowerCase();
  const seen = new Set<string>();
  const out: SiblingColor[] = [];
  for (const c of candidates) {
    if (c.handle === product.handle) continue;
    const series = resolveSeriesLabel(c);
    if (series !== ownSeries) continue;
    const raw = (c.specs.color ?? c.filters.color_family ?? '').trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (lower === ownColor) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({handle: c.handle, title: c.title, color: raw, rawColor: raw});
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* AI key facts fallback.                                              */
/* ------------------------------------------------------------------ */

export function fallbackKeyFacts(p: HeatingProduct): AiKeyFact[] | null {
  const out: AiKeyFact[] = [];
  if (p.filters.product_type) {
    out.push({label: 'Type', value: prettyProductType(p.filters.product_type)});
  }
  if (p.specs.heating_medium) {
    out.push({
      label: 'Heating',
      value: prettyHeatingMedium(p.specs.heating_medium),
    });
  }
  if (p.specs.material)
    out.push({label: 'Material', value: titleCase(p.specs.material)});
  if (p.specs.color) out.push({label: 'Colour', value: titleCase(p.specs.color)});
  if (p.specs.connection_type)
    out.push({label: 'Connection', value: p.specs.connection_type});
  return out.length > 0 ? out : null;
}
