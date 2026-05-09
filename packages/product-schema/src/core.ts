/**
 * Core Shopify Storefront API product/collection shapes — minimal, hand-typed.
 *
 * We intentionally do not pull in the full @shopify/storefront-api-client types;
 * we only model what we actually consume. Wider coverage can be added per route
 * as queries grow.
 *
 * Spec ref: shop/08_shopify_metafields_metaobjects_definitions.md (§2 shared metafields).
 */

export interface Money {
  amount: string;
  currencyCode: string;
}

export interface Image {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface SelectedOption {
  name: string;
  value: string;
}

export interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  quantityAvailable: number | null;
  selectedOptions: SelectedOption[];
  price: Money;
  compareAtPrice: Money | null;
  image: Image | null;
}

export interface MetafieldRaw {
  namespace: string;
  key: string;
  type: string;
  value: string;
  reference?: { __typename: string; [k: string]: unknown } | null;
  references?: { nodes: Array<{ __typename: string; [k: string]: unknown }> } | null;
}

export type MediaType =
  | "IMAGE"
  | "VIDEO"
  | "EXTERNAL_VIDEO"
  | "MODEL_3D"
  | string;

export interface MediaImageNode {
  __typename: "MediaImage";
  id: string;
  alt: string | null;
  mediaContentType: MediaType;
  image: Image | null;
}

/** Other media types we surface as raw nodes; storefront renders only images for now. */
export interface MediaOtherNode {
  __typename: string;
  id: string;
  alt: string | null;
  mediaContentType: MediaType;
}

export type MediaNode = MediaImageNode | MediaOtherNode;

export interface ShopifyProductRaw {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  description: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  availableForSale: boolean;
  totalInventory: number | null;
  priceRange: {
    minVariantPrice: Money;
    maxVariantPrice: Money;
  };
  compareAtPriceRange: {
    minVariantPrice: Money;
    maxVariantPrice: Money;
  } | null;
  options: ProductOption[];
  variants: { nodes: ProductVariant[] };
  images: { nodes: Image[] };
  /**
   * Shopify's standard `Product.media` connection. The catalog-sync image upload
   * pipeline writes here (MediaImage nodes), so this is the canonical source for
   * gallery rendering. `images.nodes` remains as a fallback for older products.
   */
  media?: { nodes: MediaNode[] };
  featuredImage: Image | null;
  metafields: Array<MetafieldRaw | null>;
  seo: {
    title: string | null;
    description: string | null;
  };
  collections?: {
    nodes: Array<{ id: string; handle: string; title: string }>;
  };
}

export interface ShopifyCollectionRaw {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  image: Image | null;
  products: { nodes: ShopifyProductRaw[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  seo: { title: string | null; description: string | null };
  metafields: Array<MetafieldRaw | null>;
}

/**
 * Shared metafield shape used across all stores. Per spec §2.
 *
 * NOTE: AI fields live under namespace `aix` (Shopify reserves `ai`); the parser
 * reads `aix.*` from the store but exposes them under the `aix` key here.
 */
export interface ContentSection {
  title: string;
  text: string;
  html: string;
  source?: string;
  /** When parsing sections_en, the original German title may travel along for QA. */
  titleDe?: string;
  textDe?: string;
}

export interface AiKeyFact {
  label: string;
  value: string;
}

export interface CommonProductMetafields {
  custom?: {
    subtitle?: string;
    short_description?: string;
    usp_1?: string;
    usp_2?: string;
    usp_3?: string;
    /** "scraper_de" | "manual_stub" — populated by the catalog-sync pipeline. */
    copy_status?: string;
  };
  merchandising?: {
    badges?: string[];
    compare_group?: string;
    manual_sort_score?: number;
  };
  shipping?: {
    dispatch_note?: string;
    delivery_note?: string;
    return_summary?: string;
    shipping_profile_label?: string;
  };
  seo?: {
    override_title?: string;
    override_description?: string;
    override_h1?: string;
    primary_keyword?: string;
    secondary_keywords?: string[];
    breadcrumb_override?: string[];
    schema_product_type?: string;
    /** Resolved metaobject reference id; resolution happens in the client. */
    faq_group_id?: string;
  };
  /**
   * AI-readable factual metadata. Populated by `agent/sync/generate-ai-summaries.ts`.
   * Stored under namespace `aix` in Shopify (the `ai` namespace is reserved).
   */
  aix?: {
    entity_summary?: string;
    /** Always normalised to `[{label, value}, ...]` even if raw shape differs. */
    key_facts?: AiKeyFact[];
    compatibility_summary?: string;
    customer_question_summary?: string;
    allowed_claims?: string[];
    restricted_claims?: string[];
    /**
     * Optional reference to an `ai_summary_block` metaobject. When the
     * product's `aix.summary_block` metafield resolves to a metaobject,
     * we surface its structured fields here for the PDP to render as a
     * clean factual paragraph. Unset when the product has no link.
     *
     * Metaobject definition lives in
     * `agent/scripts/install-metafield-definitions.mjs` § metaobjects:
     *   - title:           single_line_text_field (required)
     *   - summary_text:    multi_line_text_field   ← rendered by AiBlock
     *   - key_points_json: json
     *   - audience:        single_line_text_field
     *   - language_code:   single_line_text_field
     */
    summary_block?: {
      title?: string;
      summary_text?: string;
      audience?: string;
      language_code?: string;
    };
  };
  media?: {
    primary_asset_id?: string;
    gallery_asset_ids?: string[];
    asset_manifest?: Record<string, unknown>;
    image_style_template?: string;
    /**
     * Catalog-sync-supplied: relative path to a local datasheet PDF. Will be
     * replaced with a Shopify CDN URL once the upload pipeline ships. Until
     * then the PDP renders this as a disabled link with a "coming online" note.
     */
    primary_pdf_url?: string;
    /** "owner_licensed" | "placeholder_needed" */
    image_status?: string;
  };
  /**
   * Long-form, scraper-sourced product copy split into sections. EN is the
   * translation target for the local store; DE is the source. PDP renders EN
   * if present, otherwise falls back to DE with a "translation pending" note.
   */
  content?: {
    sections_en?: ContentSection[];
    sections_de?: ContentSection[];
    sections_nl?: ContentSection[];
    sections_fr?: ContentSection[];
  };
  localization?: {
    market_visibility?: string[];
    translation_group?: string;
  };
}

/** Discriminator added when we parse into a typed product. */
export type StoreCategory = "heating" | "underwear" | "furniture";

export interface ProductBase {
  category: StoreCategory;
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  description: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  availableForSale: boolean;
  priceRange: {
    minVariantPrice: Money;
    maxVariantPrice: Money;
  };
  compareAtPriceRange?: {
    minVariantPrice: Money;
    maxVariantPrice: Money;
  } | null;
  options: ProductOption[];
  variants: ProductVariant[];
  images: Image[];
  /** Shopify standard `Product.media` — preferred over `images` for galleries. */
  media: MediaNode[];
  featuredImage: Image | null;
  seo: {
    title: string | null;
    description: string | null;
  };
  common: CommonProductMetafields;
  /** Collection memberships, used for "related products" rails on PDP. */
  collectionHandles: string[];
  /**
   * Same memberships as `collectionHandles` but with the locale-resolved
   * collection title preserved (Storefront API returns the translated
   * title under @inContext). The breadcrumb and any "back to category"
   * surface should read from here so they stay in the active locale.
   */
  collections: Array<{handle: string; title: string}>;
}

/* ------------------------------------------------------------------ */
/* Metafield parsing helpers                                          */
/* ------------------------------------------------------------------ */

const isMf = (mf: MetafieldRaw | null | undefined): mf is MetafieldRaw =>
  !!mf && typeof mf.value === "string";

export function indexMetafields(
  metafields: Array<MetafieldRaw | null>,
): Map<string, MetafieldRaw> {
  const out = new Map<string, MetafieldRaw>();
  for (const mf of metafields) {
    if (!isMf(mf)) continue;
    out.set(`${mf.namespace}.${mf.key}`, mf);
  }
  return out;
}

export function readString(
  index: Map<string, MetafieldRaw>,
  key: string,
): string | undefined {
  const mf = index.get(key);
  return mf?.value || undefined;
}

export function readNumber(
  index: Map<string, MetafieldRaw>,
  key: string,
): number | undefined {
  const v = readString(index, key);
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function readBoolean(
  index: Map<string, MetafieldRaw>,
  key: string,
): boolean | undefined {
  const v = readString(index, key);
  if (v == null) return undefined;
  return v === "true";
}

export function readJSON<T = unknown>(
  index: Map<string, MetafieldRaw>,
  key: string,
): T | undefined {
  const v = readString(index, key);
  if (!v) return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
}

export function readStringList(
  index: Map<string, MetafieldRaw>,
  key: string,
): string[] | undefined {
  const v = readString(index, key);
  if (!v) return undefined;
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    /* not JSON; fall through */
  }
  return undefined;
}

/**
 * Read a metaobject_reference metafield and return a flat `{key: value}`
 * map of the metaobject's fields. Returns `undefined` when the metafield
 * is missing, has no resolved reference, or the reference has no usable
 * fields. The product-by-handle GraphQL query expands `reference.fields`
 * for every metafield, so the data is already on the wire.
 *
 * Pass an explicit `whitelist` of keys you expect — anything outside the
 * list is dropped. Keeps callers honest and the resulting object compact.
 */
function readMetaobjectFields<K extends string>(
  index: Map<string, MetafieldRaw>,
  key: string,
  whitelist: readonly K[],
): Partial<Record<K, string>> | undefined {
  const mf = index.get(key);
  const ref = mf?.reference;
  if (!ref || ref.__typename !== "Metaobject") return undefined;
  const fields = (ref as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return undefined;
  const out: Partial<Record<K, string>> = {};
  let hadAny = false;
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const k = (f as { key?: unknown }).key;
    const v = (f as { value?: unknown }).value;
    if (typeof k !== "string" || typeof v !== "string" || !v) continue;
    if ((whitelist as readonly string[]).includes(k)) {
      out[k as K] = v;
      hadAny = true;
    }
  }
  return hadAny ? out : undefined;
}

/**
 * Coerce arbitrary `aix.key_facts` JSON into our normalised `[{label, value}]`
 * shape. The Claude generator prompt asks for that shape, but historic data may
 * arrive as `{ "Type": "Towel radiator" }` (object map). We accept both.
 */
function normaliseKeyFacts(raw: unknown): AiKeyFact[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    const out: AiKeyFact[] = [];
    for (const entry of raw) {
      if (
        entry &&
        typeof entry === "object" &&
        "label" in entry &&
        "value" in entry &&
        typeof (entry as { label: unknown }).label === "string" &&
        typeof (entry as { value: unknown }).value === "string"
      ) {
        out.push({
          label: String((entry as { label: string }).label).trim(),
          value: String((entry as { value: string }).value).trim(),
        });
      }
    }
    return out.length ? out : undefined;
  }
  if (typeof raw === "object") {
    const out: AiKeyFact[] = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out.push({ label: k, value: String(v) });
      }
    }
    return out.length ? out : undefined;
  }
  return undefined;
}

/** Parse a sections JSON metafield into `ContentSection[]`. Tolerant of partial data. */
function parseSectionsJson(raw: unknown): ContentSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ContentSection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title : "";
    const text = typeof obj.text === "string" ? obj.text : "";
    const html = typeof obj.html === "string" ? obj.html : "";
    if (!title && !text && !html) continue;
    out.push({
      title,
      text,
      html,
      source: typeof obj.source === "string" ? obj.source : undefined,
      titleDe: typeof obj.titleDe === "string" ? obj.titleDe : undefined,
      textDe: typeof obj.textDe === "string" ? obj.textDe : undefined,
    });
  }
  return out.length ? out : undefined;
}

export function parseCommonMetafields(
  index: Map<string, MetafieldRaw>,
): CommonProductMetafields {
  return {
    custom: {
      subtitle: readString(index, "custom.subtitle"),
      short_description: readString(index, "custom.short_description"),
      usp_1: readString(index, "custom.usp_1"),
      usp_2: readString(index, "custom.usp_2"),
      usp_3: readString(index, "custom.usp_3"),
      copy_status: readString(index, "custom.copy_status"),
    },
    merchandising: {
      badges: readStringList(index, "merchandising.badges"),
      compare_group: readString(index, "merchandising.compare_group"),
      manual_sort_score: readNumber(index, "merchandising.manual_sort_score"),
    },
    shipping: {
      dispatch_note: readString(index, "shipping.dispatch_note"),
      delivery_note: readString(index, "shipping.delivery_note"),
      return_summary: readString(index, "shipping.return_summary"),
      shipping_profile_label: readString(index, "shipping.shipping_profile_label"),
    },
    seo: {
      override_title: readString(index, "seo.override_title"),
      override_description: readString(index, "seo.override_description"),
      override_h1: readString(index, "seo.override_h1"),
      primary_keyword: readString(index, "seo.primary_keyword"),
      secondary_keywords: readStringList(index, "seo.secondary_keywords"),
      breadcrumb_override: readStringList(index, "seo.breadcrumb_override"),
      schema_product_type: readString(index, "seo.schema_product_type"),
    },
    aix: {
      entity_summary: readString(index, "aix.entity_summary"),
      key_facts: normaliseKeyFacts(readJSON(index, "aix.key_facts")),
      compatibility_summary: readString(index, "aix.compatibility_summary"),
      customer_question_summary: readString(index, "aix.customer_question_summary"),
      allowed_claims: readStringList(index, "aix.allowed_claims"),
      restricted_claims: readStringList(index, "aix.restricted_claims"),
      summary_block: readMetaobjectFields(index, "aix.summary_block", [
        "title",
        "summary_text",
        "audience",
        "language_code",
      ]),
    },
    media: {
      primary_asset_id: readString(index, "media.primary_asset_id"),
      gallery_asset_ids: readStringList(index, "media.gallery_asset_ids"),
      asset_manifest: readJSON<Record<string, unknown>>(index, "media.asset_manifest"),
      image_style_template: readString(index, "media.image_style_template"),
      primary_pdf_url: readString(index, "media.primary_pdf_url"),
      image_status: readString(index, "media.image_status"),
    },
    content: {
      sections_en: parseSectionsJson(readJSON(index, "content.sections_en")),
      sections_de: parseSectionsJson(readJSON(index, "content.sections_de")),
      sections_nl: parseSectionsJson(readJSON(index, "content.sections_nl")),
      sections_fr: parseSectionsJson(readJSON(index, "content.sections_fr")),
    },
    localization: {
      market_visibility: readStringList(index, "localization.market_visibility"),
      translation_group: readString(index, "localization.translation_group"),
    },
  };
}
