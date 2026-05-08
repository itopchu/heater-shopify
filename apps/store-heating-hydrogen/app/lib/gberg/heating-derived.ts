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
import type {TFunction} from './i18n';

/**
 * Localise a categorical spec value via i18n keys when we recognise it,
 * otherwise pass through the title-cased original. Keeps spec rows in
 * the active language even though the underlying metafield is English.
 *
 * `kind` narrows the lookup namespace so the same source word can map
 * differently per category if needed (none currently do, but the
 * structure leaves room).
 */
export function localizeSpecValue(
  kind: string,
  raw: string | null | undefined,
  t: TFunction,
): string {
  if (!raw) return '';
  const k = raw.trim().toLowerCase();
  // Direct lookups for well-known categorical values.
  if (kind === 'color') {
    if (k === 'white' || k === 'weiss' || k === 'weiß') return t('pdp.color_white');
    if (k === 'black' || k === 'schwarz') return t('pdp.color_black');
    if (k === 'anthracite' || k === 'anthrazit') return t('pdp.color_anthracite');
    if (k === 'chrome' || k === 'chrom') return t('pdp.color_chrome');
  }
  if (kind === 'heating') {
    if (k === 'hydronic') return t('pdp.heating_hydronic');
    if (k === 'electric') return t('pdp.heating_electric');
  }
  if (kind === 'material') {
    if (k === 'steel') return t('pdp.material_steel');
    if (k === 'stainless steel') return t('pdp.material_stainless_steel');
    if (k === 'plastic' || k === 'kunststoff') return t('pdp.material_plastic');
  }
  if (kind === 'installation') {
    if (k === 'easy') return t('pdp.install_easy');
    if (k === 'medium') return t('pdp.install_medium');
    if (k === 'hard') return t('pdp.install_hard');
  }
  if (kind === 'connection') {
    // Both German and English source tokens land in this field; normalise
    // to one of four buckets and let the locale dictionary handle display.
    if (k === 'mid_or_side' || k.includes('mittel-und-seiten') || k.includes('mittel und seiten') || k.includes('mittel oder seiten')) {
      return t('pdp.connection_either');
    }
    if (k === 'mid' || k === 'center' || k === 'centre' || k.includes('mittel')) {
      return t('pdp.connection_center');
    }
    if (k === 'side' || k.includes('seiten') || k.includes('seitlich') || k.includes('rechts oder links')) {
      return t('pdp.connection_side');
    }
    if (k === 'plug_in' || k === 'plug-in' || k === 'plugin' || k.includes('steckdose')) {
      return t('pdp.connection_plug_in');
    }
  }
  if (kind === 'boolean_yes') return t('pdp.value_yes');
  if (kind === 'boolean_included') return t('pdp.value_included');
  // Fallback: title-case the source word so display stays clean.
  return titleCase(raw);
}

/* ------------------------------------------------------------------ */
/* Series eyebrow.                                                     */
/* ------------------------------------------------------------------ */

const KNOWN_SERIES = [
  'ASTORIA',
  'ATLAS',
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
export function buildStructuredSpecRows(
  p: HeatingProduct,
  t: TFunction,
): StructuredSpecRowInput[] {
  const rows: StructuredSpecRowInput[] = [];

  // Wattage — prefer canonical specs.wattage_w, fall back to legacy heat_output.
  const wattage =
    p.specs.wattage_w != null && p.specs.wattage_w > 0
      ? p.specs.wattage_w
      : p.specs.heat_output_75_65_20 != null && p.specs.heat_output_75_65_20 > 0
        ? p.specs.heat_output_75_65_20
        : undefined;
  if (wattage != null) {
    const display =
      wattage >= 1000 ? `${(wattage / 1000).toFixed(1).replace(/\.0$/, '')}` : `${wattage}`;
    const unit = wattage >= 1000 ? 'kW' : 'W';
    rows.push({
      kind: 'wattage',
      label: t('pdp.fact_heat_output'),
      value: display,
      unit,
    });
  }

  if (p.specs.energy_class) {
    rows.push({
      kind: 'energy_class',
      label: t('pdp.fact_energy_class'),
      value: p.specs.energy_class,
    });
  }

  if (p.specs.room_coverage_m2 != null && p.specs.room_coverage_m2 > 0) {
    rows.push({
      kind: 'room_coverage',
      label: t('pdp.fact_room_coverage'),
      value: `${p.specs.room_coverage_m2}`,
      unit: 'm²',
    });
  }

  const dimDisplay = p.specs.dimensions_w_h_d_mm?.trim();
  if (dimDisplay) {
    rows.push({kind: 'dimensions', label: t('pdp.fact_dimensions'), value: dimDisplay, unit: 'mm'});
  } else if (p.specs.width_mm != null && p.specs.height_mm != null) {
    const depth = p.specs.depth_mm != null ? ` × ${p.specs.depth_mm}` : '';
    rows.push({
      kind: 'dimensions',
      label: t('pdp.fact_dimensions'),
      value: `${p.specs.width_mm} × ${p.specs.height_mm}${depth}`,
      unit: 'mm',
    });
  }

  if (p.specs.installation_difficulty) {
    rows.push({
      kind: 'installation',
      label: t('pdp.fact_installation'),
      value: localizeSpecValue('installation', p.specs.installation_difficulty, t),
    });
  }

  if (p.specs.connection_type) {
    rows.push({
      kind: 'connection',
      label: t('pdp.fact_connection'),
      value: localizeSpecValue('connection', p.specs.connection_type, t),
    });
  }

  if (p.specs.heat_pump_compatible === true) {
    rows.push({
      kind: 'heat_pump',
      label: t('pdp.fact_heat_pump'),
      value: t('pdp.value_yes'),
    });
  }

  if (p.specs.mounting_kit_included === true) {
    rows.push({
      kind: 'mounting_kit',
      label: t('pdp.fact_mounting_kit'),
      value: t('pdp.value_included'),
    });
  }

  if (p.specs.material) {
    rows.push({
      kind: 'material',
      label: t('pdp.fact_material'),
      value: localizeSpecValue('material', p.specs.material, t),
    });
  }

  if (p.specs.color) {
    rows.push({
      kind: 'color',
      label: t('pdp.fact_color'),
      value: localizeSpecValue('color', p.specs.color, t),
    });
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

export function pickSections(
  p: HeatingProduct,
  locale?: string,
): {
  sections: ContentSection[];
  source: 'en' | 'de' | null;
} {
  const en = p.common.content?.sections_en ?? [];
  const de = p.common.content?.sections_de ?? [];
  // DE locale should see the original scraped German source — no
  // back-translation EN→DE is happening anyway. Every other locale
  // currently falls through to EN; per-locale section translations
  // (sections_nl, sections_fr…) are a future task.
  if (locale === 'de' && de.length > 0) return {sections: de, source: 'de'};
  if (en.length > 0) return {sections: en, source: 'en'};
  if (de.length > 0) return {sections: de, source: 'de'};
  return {sections: [], source: null};
}

/* ------------------------------------------------------------------ */
/* Media → Image[] adapter.                                            */
/* ------------------------------------------------------------------ */

// Low-resolution previews (legacy thumbnails from the catalog import,
// undersized variant photos, etc.) read as "disturbing" against the rest
// of the storefront. Drop anything whose longest dimension is known to be
// below this floor. Only filter when both width and height are present —
// missing metadata never causes an image to be hidden.
const MIN_PREVIEW_LONG_EDGE_PX = 800;

function isHighEnoughRes(img: ImageType): boolean {
  if (img.width == null && img.height == null) return true;
  const longest = Math.max(img.width ?? 0, img.height ?? 0);
  return longest >= MIN_PREVIEW_LONG_EDGE_PX;
}

export function galleryImages(p: HeatingProduct): ImageType[] {
  const fromMedia: ImageType[] = [];
  for (const node of p.media ?? []) {
    if (node.__typename === 'MediaImage') {
      const mi = node as {image?: ImageType | null};
      if (mi.image) fromMedia.push(mi.image);
    }
  }
  const all = fromMedia.length > 0 ? fromMedia : p.images ?? [];
  const filtered = all.filter(isHighEnoughRes);
  // Never return an empty array purely because every image is small — fall
  // back to the unfiltered set so PDP/PLP at least show *something*.
  return filtered.length > 0 ? filtered : all;
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
  'bathroom-radiators': 'Bathroom radiators',
  'electric-bathroom-radiators': 'Electric bathroom radiators',
  'living-room-radiators': 'Living-room radiators',
  'replacement-radiators': 'Replacement radiators',
  accessories: 'Accessories',
  // Legacy German handles — kept for any cached/external links that hit
  // the storefront before the Shopify-side 301 redirects fire.
  badheizkorper: 'Bathroom radiators',
  bad: 'Bathroom',
  zubehor: 'Accessories',
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

export function fallbackKeyFacts(p: HeatingProduct, t: TFunction): AiKeyFact[] | null {
  const out: AiKeyFact[] = [];
  if (p.filters.product_type) {
    out.push({label: t('pdp.fact_type'), value: prettyProductType(p.filters.product_type)});
  }
  if (p.specs.heating_medium) {
    out.push({
      label: t('pdp.fact_heating_medium'),
      value: localizeSpecValue('heating', p.specs.heating_medium, t),
    });
  }
  if (p.specs.material)
    out.push({label: t('pdp.fact_material'), value: localizeSpecValue('material', p.specs.material, t)});
  if (p.specs.color)
    out.push({label: t('pdp.fact_color'), value: localizeSpecValue('color', p.specs.color, t)});
  if (p.specs.connection_type)
    out.push({label: t('pdp.fact_connection'), value: localizeSpecValue('connection', p.specs.connection_type, t)});
  return out.length > 0 ? out : null;
}
