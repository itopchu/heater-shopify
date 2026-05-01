/**
 * JSON-LD structured-data builders.
 *
 * STRICT VISIBLE-CONTENT PARITY RULE
 * ----------------------------------
 * Every claim emitted by these builders must already be visible somewhere
 * on the rendered page. JSON-LD is **not** a place to invent metadata that
 * doesn't exist in the user-facing HTML. If you reach for a builder field
 * and the corresponding text isn't already rendered, either:
 *   1. Add the visible content first, then mirror it in JSON-LD, or
 *   2. Drop the field. There is no third option.
 *
 * Concretely:
 *   - `additionalProperty` rows mirror the PDP <SpecsTable> / <QuickFacts>
 *     blocks. If the spec table doesn't show "Width: 600 mm", we don't emit
 *     a width property. Skipping null/empty metafields is therefore not
 *     just a nicety — it's the parity contract.
 *   - `Offer.price` mirrors the visible <BuyBox> price; both come from the
 *     same priceRange field, so they're guaranteed identical.
 *   - `BreadcrumbList` mirrors the rendered <Breadcrumb> exactly (same
 *     items, same order, same labels).
 *   - `FAQPage` mirrors the rendered <FaqAccordion>.
 *
 * Google's structured-data quality guidelines explicitly disqualify pages
 * whose JSON-LD describes hidden or absent content; AI answer engines
 * downrank similarly. The parity rule is enforced by the test in
 * `app/lib/gberg/__tests__/jsonld-parity.test.ts`.
 *
 * Deferred:
 *   - `aggregateRating`: gated on real review data. We ship native Shopify
 *     Product Reviews when ≥1 review exists per product.
 *   - `LocalBusiness`: gated on imprint + address validation pass.
 *
 * Output shape: each builder returns a React Router 7 meta descriptor with
 *   `{tagName: 'script', type: 'application/ld+json', children: <json>}`
 * — Hydrogen 2026.4 routes spread these into the array returned by their
 * `meta()` export, alongside the existing `<title>` / `<meta>` tags.
 */

import type {
  HeatingProduct,
  Image as ImageType,
  Money,
} from '@gberg/product-schema';
import type {BreadcrumbCrumb} from './heating-derived';

/* ------------------------------------------------------------------ */
/* Constants — must stay in lockstep with seo.ts.                      */
/* ------------------------------------------------------------------ */

/** Production canonical host. Mirrors `seo.ts#PRIMARY_HOST`. */
const PRIMARY_HOST = 'https://www.gberg-heizung.de';

/** Brand display name. Mirrors `seo.ts#BRAND_NAME`. */
const BRAND_NAME = 'G-Berg Heizung';

/** Legal entity name (Impressum). */
const LEGAL_ENTITY = 'G-Berg GmbH';

/* ------------------------------------------------------------------ */
/* Public meta-descriptor shape.                                       */
/* ------------------------------------------------------------------ */

/**
 * A React Router 7 meta descriptor for a `<script type="application/ld+json">`
 * tag. Spread into `meta()` returns alongside other descriptors; RR7 wires
 * `children` into the script body.
 */
export interface JsonLdScriptDescriptor {
  tagName: 'script';
  type: 'application/ld+json';
  /** Stringified JSON payload — RR7 inlines verbatim into the script tag. */
  children: string;
}

/**
 * Wrap a schema.org payload into the RR7 meta-descriptor shape.
 * Centralises the `@context` injection so callers never forget it.
 */
function asScript(payload: Record<string, unknown>): JsonLdScriptDescriptor {
  return {
    tagName: 'script',
    type: 'application/ld+json',
    children: JSON.stringify({'@context': 'https://schema.org', ...payload}),
  };
}

/* ------------------------------------------------------------------ */
/* Organization.                                                       */
/* ------------------------------------------------------------------ */

export interface OrganizationOpts {
  /** sameAs URLs (social profiles). Empty array OK — none populated yet. */
  sameAs?: string[];
}

/**
 * Build an `Organization` JSON-LD block. Emitted on every page via root.tsx.
 *
 * Visible parity: address + email are visible in the footer / impressum /
 * contact page; brand name is visible in the header; logo is visible on
 * every page. The `Organization` block does not introduce any claim that
 * isn't already on the rendered page.
 */
export function buildOrganizationJsonLd(
  opts: OrganizationOpts = {},
): JsonLdScriptDescriptor {
  return asScript({
    '@type': 'Organization',
    name: LEGAL_ENTITY,
    alternateName: BRAND_NAME,
    url: PRIMARY_HOST,
    logo: `${PRIMARY_HOST}/favicon.svg`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Hagenerstrasse 33',
      postalCode: '58642',
      addressLocality: 'Iserlohn',
      addressCountry: 'DE',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'online@g-berg-gmbh.de',
        availableLanguage: ['en', 'de'],
      },
    ],
    // sameAs is required by schema.org Organization for social linking;
    // emit only when we actually have URLs to avoid "[]" noise in markup.
    ...(opts.sameAs && opts.sameAs.length > 0 ? {sameAs: opts.sameAs} : {}),
  });
}

/* ------------------------------------------------------------------ */
/* WebSite + SearchAction.                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a `WebSite` JSON-LD block exposing a sitelinks search box via
 * `SearchAction`. The `target` URL template must point at a real route —
 * our `/search?q=...` route exists and renders results in HTML, so this
 * satisfies the parity rule (search is reachable from the header).
 */
export function buildWebSiteJsonLd(): JsonLdScriptDescriptor {
  return asScript({
    '@type': 'WebSite',
    name: BRAND_NAME,
    url: PRIMARY_HOST,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${PRIMARY_HOST}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  });
}

/* ------------------------------------------------------------------ */
/* BreadcrumbList.                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build a `BreadcrumbList` JSON-LD block from the same `BreadcrumbCrumb[]`
 * the visible <Breadcrumb> component renders.
 *
 * Visible parity: the rendered breadcrumb component receives the identical
 * array — labels and order are byte-for-byte equal.
 *
 * @param items - The crumb trail; each crumb has a label and optional href.
 *                The last crumb (current page) typically has no href.
 * @param origin - Origin to prefix relative `href` values. Defaults to
 *                 PRIMARY_HOST. Pass a different host if you ever render
 *                 breadcrumbs under a preview domain.
 */
export function buildBreadcrumbJsonLd(
  items: readonly BreadcrumbCrumb[],
  origin: string = PRIMARY_HOST,
): JsonLdScriptDescriptor | null {
  if (items.length === 0) return null;
  const itemListElement = items.map((crumb, i) => {
    const node: Record<string, unknown> = {
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
    };
    if (crumb.href) {
      // Resolve relative paths to the canonical origin so the URL matches
      // the canonical link tag emitted by seo.ts.
      const url = crumb.href.startsWith('http')
        ? crumb.href
        : `${origin}${crumb.href.startsWith('/') ? '' : '/'}${crumb.href}`;
      node.item = url;
    }
    return node;
  });
  return asScript({
    '@type': 'BreadcrumbList',
    itemListElement,
  });
}

/* ------------------------------------------------------------------ */
/* Product + Offer.                                                    */
/* ------------------------------------------------------------------ */

/**
 * Spec metafield → `additionalProperty` row. The shape mirrors what's
 * rendered in the visible <SpecsTable> on the PDP.
 *
 * Each row carries:
 *  - `key`: stable schema-friendly identifier (used for QA, not emitted).
 *  - `name`: human label that matches the visible spec table label.
 *  - `value`: stringified value, identical to what's visible.
 *  - `unitText`: optional unit suffix ("mm", "W", "kW") matching the table.
 */
interface AdditionalPropertyInput {
  key: string;
  name: string;
  value: string | number;
  unitText?: string;
}

/**
 * Distill a HeatingProduct's heating-specific metafields into
 * `additionalProperty` rows. Mirrors `buildSpecRows()` in
 * `($locale).products.$handle.tsx` — same fields, same order, same units.
 *
 * **Skip rule:** a metafield with a null/undefined/empty value is dropped
 * entirely. This is the parity contract: if `<SpecsTable>` doesn't render
 * the row (because `width_mm` is undefined), JSON-LD must not claim it.
 */
function deriveAdditionalProperties(
  p: HeatingProduct,
): AdditionalPropertyInput[] {
  const rows: AdditionalPropertyInput[] = [];
  const s = p.specs;

  if (s.width_mm != null) {
    rows.push({key: 'width_mm', name: 'Width', value: s.width_mm, unitText: 'mm'});
  }
  if (s.height_mm != null) {
    rows.push({key: 'height_mm', name: 'Height', value: s.height_mm, unitText: 'mm'});
  }
  if (s.depth_mm != null) {
    rows.push({key: 'depth_mm', name: 'Depth', value: s.depth_mm, unitText: 'mm'});
  }
  if (s.orientation) {
    rows.push({key: 'orientation', name: 'Orientation', value: s.orientation});
  }
  if (s.connection_type) {
    rows.push({
      key: 'connection_type',
      name: 'Connection type',
      value: s.connection_type,
    });
  }
  if (s.pipe_spacing_mm != null) {
    rows.push({
      key: 'pipe_spacing_mm',
      name: 'Pipe spacing',
      value: s.pipe_spacing_mm,
      unitText: 'mm',
    });
  }
  if (s.heating_medium) {
    rows.push({key: 'heating_medium', name: 'Heating medium', value: s.heating_medium});
  }
  if (s.wattage_w != null) {
    rows.push({key: 'wattage_w', name: 'Wattage', value: s.wattage_w, unitText: 'W'});
  }
  if (s.heat_output_75_65_20 != null) {
    rows.push({
      key: 'heat_output_75_65_20',
      name: 'Heat output (75/65/20)',
      value: s.heat_output_75_65_20,
      unitText: 'W',
    });
  }
  if (s.heat_output_70_55_20 != null) {
    rows.push({
      key: 'heat_output_70_55_20',
      name: 'Heat output (70/55/20)',
      value: s.heat_output_70_55_20,
      unitText: 'W',
    });
  }
  if (s.heat_output_55_45_20 != null) {
    rows.push({
      key: 'heat_output_55_45_20',
      name: 'Heat output (55/45/20)',
      value: s.heat_output_55_45_20,
      unitText: 'W',
    });
  }
  if (s.energy_class) {
    rows.push({key: 'energy_class', name: 'Energy class', value: s.energy_class});
  }
  if (s.room_coverage_m2 != null) {
    rows.push({
      key: 'room_coverage_m2',
      name: 'Room coverage',
      value: s.room_coverage_m2,
      unitText: 'm²',
    });
  }
  if (s.color) {
    rows.push({key: 'color', name: 'Colour', value: s.color});
  }
  if (s.finish) {
    rows.push({key: 'finish', name: 'Finish', value: s.finish});
  }
  if (s.material) {
    rows.push({key: 'material', name: 'Material', value: s.material});
  }
  if (s.voltage) {
    rows.push({key: 'voltage', name: 'Voltage', value: s.voltage});
  }
  if (s.heat_pump_compatible != null) {
    rows.push({
      key: 'heat_pump_compatible',
      name: 'Heat-pump compatible',
      value: s.heat_pump_compatible ? 'Yes' : 'No',
    });
  }
  if (s.bathroom_suitable != null) {
    rows.push({
      key: 'bathroom_suitable',
      name: 'Bathroom suitable',
      value: s.bathroom_suitable ? 'Yes' : 'No',
    });
  }
  if (s.max_pressure_bar != null) {
    rows.push({
      key: 'max_pressure_bar',
      name: 'Max pressure',
      value: s.max_pressure_bar,
      unitText: 'bar',
    });
  }
  if (s.max_temp_c != null) {
    rows.push({
      key: 'max_temp_c',
      name: 'Max temperature',
      value: s.max_temp_c,
      unitText: '°C',
    });
  }

  return rows;
}

/**
 * Resolve the `Offer.availability` schema.org enum from the product's
 * Storefront availability flag. We don't track partial-stock or pre-order
 * states yet — anything truthy maps to InStock, falsy to OutOfStock.
 */
function resolveAvailability(p: HeatingProduct): string {
  return p.availableForSale
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
}

/**
 * Pick the canonical price for the Offer. The visible <BuyBox> renders
 * `priceRange.minVariantPrice`, so we mirror that exactly.
 */
function resolveOfferPrice(p: HeatingProduct): Money {
  return p.priceRange.minVariantPrice;
}

/**
 * Build a `Product` JSON-LD block, including a single `Offer` mirroring
 * the visible buy-box price + currency + availability.
 *
 * Visible parity:
 *  - `name` ← visible <h1>
 *  - `image[]` ← visible <Gallery>
 *  - `offers.price` / `priceCurrency` ← visible <BuyBox>
 *  - `offers.availability` ← visible buy/out-of-stock state
 *  - `additionalProperty[]` ← visible <SpecsTable> rows
 *  - `brand` ← visible vendor / fallback to G-Berg
 *  - `description` ← visible short description / SEO description
 *
 * Skipped (until visible UI exists):
 *  - `aggregateRating` — no reviews shipped yet.
 *  - `gtin*`, `mpn` — no SKU-level GTIN/MPN data parsed yet.
 *  - `weight`, `material` (offer-level) — not visible on PDP.
 */
export function buildProductJsonLd(
  product: HeatingProduct,
  pathname: string,
): JsonLdScriptDescriptor {
  const images = imageUrls(product);
  const offerPrice = resolveOfferPrice(product);
  const description =
    product.common.seo?.override_description ??
    product.seo.description ??
    product.common.custom?.short_description ??
    product.common.custom?.subtitle ??
    product.description ??
    '';

  const additionalProperty = deriveAdditionalProperties(product).map((row) => {
    const node: Record<string, unknown> = {
      '@type': 'PropertyValue',
      name: row.name,
      value: row.value,
    };
    if (row.unitText) node.unitText = row.unitText;
    return node;
  });

  const url = canonicalUrlFor(pathname);

  const payload: Record<string, unknown> = {
    '@type': 'Product',
    name: product.title,
    url,
    sku: product.variants[0]?.sku ?? undefined,
    brand: {
      '@type': 'Brand',
      name: product.vendor || BRAND_NAME,
    },
    offers: {
      '@type': 'Offer',
      url,
      price: offerPrice.amount,
      priceCurrency: offerPrice.currencyCode,
      availability: resolveAvailability(product),
      seller: {
        '@type': 'Organization',
        name: LEGAL_ENTITY,
      },
    },
  };
  if (description) payload.description = description;
  if (images.length > 0) payload.image = images;
  if (additionalProperty.length > 0) {
    payload.additionalProperty = additionalProperty;
  }
  // Drop sku field if unset to avoid emitting `"sku":null`.
  if (payload.sku == null) delete payload.sku;

  return asScript(payload);
}

/* ------------------------------------------------------------------ */
/* FAQPage.                                                            */
/* ------------------------------------------------------------------ */

export interface FaqEntry {
  question: string;
  /** Plain-text answer. HTML entities should be decoded by the caller. */
  answer: string;
}

/**
 * Build an `FAQPage` JSON-LD block from the visible <FaqAccordion> entries.
 * Returns `null` when the input is empty so the route can drop the meta
 * descriptor entirely instead of emitting an empty FAQ block.
 *
 * Visible parity: every Q/A in this output must be visibly rendered on
 * the page. Pass the same array your accordion is rendering.
 */
export function buildFaqPageJsonLd(
  faqs: readonly FaqEntry[],
): JsonLdScriptDescriptor | null {
  if (faqs.length === 0) return null;
  return asScript({
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  });
}

/* ------------------------------------------------------------------ */
/* ItemList (collection PLPs).                                         */
/* ------------------------------------------------------------------ */

export interface ItemListProductInput {
  handle: string;
  title: string;
}

/**
 * Build an `ItemList` JSON-LD block listing the products visible on a
 * collection PLP. Each list item mirrors a visible product card.
 *
 * The list is intentionally URL-only (no embedded `Product` payload per
 * item) — Google recommends this when the items are linked pages rather
 * than self-contained snippets, and it keeps the markup small.
 *
 * @param locale - Used to build per-locale product URLs that match the
 *                 visible product card links.
 */
export function buildItemListJsonLd(
  products: readonly ItemListProductInput[],
  locale: string,
): JsonLdScriptDescriptor | null {
  if (products.length === 0) return null;
  return asScript({
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${PRIMARY_HOST}/${locale}/products/${p.handle}`,
      name: p.title,
    })),
  });
}

/* ------------------------------------------------------------------ */
/* Article (blog posts).                                               */
/* ------------------------------------------------------------------ */

export interface ArticleJsonLdInput {
  title: string;
  /** ISO 8601 timestamp from the Storefront API. */
  publishedAt: string;
  authorName?: string;
  imageUrl?: string;
  description?: string;
  pathname: string;
}

/**
 * Build an `Article` JSON-LD block.
 *
 * TODO(phase-3): the storefront's blog route currently has no real
 * articles wired up — when content lands, verify each visible field
 * (headline, image, byline, publish date, body) matches what's emitted
 * here, and delete this TODO. Until then the builder is correct but
 * unexercised.
 */
export function buildArticleJsonLd(
  input: ArticleJsonLdInput,
): JsonLdScriptDescriptor {
  const url = canonicalUrlFor(input.pathname);
  const payload: Record<string, unknown> = {
    '@type': 'Article',
    headline: input.title,
    datePublished: input.publishedAt,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    publisher: {
      '@type': 'Organization',
      name: LEGAL_ENTITY,
      logo: {
        '@type': 'ImageObject',
        url: `${PRIMARY_HOST}/favicon.svg`,
      },
    },
  };
  if (input.authorName) {
    payload.author = {'@type': 'Person', name: input.authorName};
  }
  if (input.imageUrl) payload.image = input.imageUrl;
  if (input.description) payload.description = input.description;
  return asScript(payload);
}

/* ------------------------------------------------------------------ */
/* Helpers.                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract usable image URLs from the product. Mirrors `galleryImages()`
 * in heating-derived (preferring `media[]` MediaImage nodes, falling
 * back to legacy `images[]`). We inline a smaller version here to keep
 * jsonld.ts self-contained and free of React types.
 */
// Mirror the floor used by heating-derived#galleryImages so that the
// JSON-LD image[] never references a thumbnail that the visible gallery
// has already filtered out — preserves the structured-data ↔ visible-DOM
// parity invariant.
const JSONLD_MIN_LONG_EDGE_PX = 800;

function isCrispEnough(img: ImageType): boolean {
  if (img.width == null && img.height == null) return true;
  return Math.max(img.width ?? 0, img.height ?? 0) >= JSONLD_MIN_LONG_EDGE_PX;
}

function imageUrls(p: HeatingProduct): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const node of p.media ?? []) {
    if (node.__typename === 'MediaImage') {
      const mi = node as {image?: ImageType | null};
      if (mi.image?.url && !seen.has(mi.image.url) && isCrispEnough(mi.image)) {
        out.push(mi.image.url);
        seen.add(mi.image.url);
      }
    }
  }
  if (out.length > 0) return out;
  for (const img of p.images ?? []) {
    if (img.url && !seen.has(img.url) && isCrispEnough(img)) {
      out.push(img.url);
      seen.add(img.url);
    }
  }
  return out;
}

/**
 * Build a canonical absolute URL for an arbitrary pathname. Mirrors the
 * trim/strip behaviour of `seo.ts#buildCanonical` so JSON-LD URLs match
 * the `<link rel=canonical>` byte-for-byte.
 */
function canonicalUrlFor(pathname: string): string {
  const cleaned = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const noQuery = cleaned.split(/[?#]/)[0]!;
  const trimmed =
    noQuery.length > 1 && noQuery.endsWith('/')
      ? noQuery.slice(0, -1)
      : noQuery;
  return `${PRIMARY_HOST}${trimmed}`;
}
