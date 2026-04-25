/**
 * Shared types for the catalog-sync pipeline.
 */

export interface XxlImage {
  id: number;
  src: string;
  alt?: string | null;
  position: number;
  width?: number;
  height?: number;
}

export interface XxlVariant {
  id: number;
  title: string;
  price: string;
  sku?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  available?: boolean;
  grams?: number;
  compare_at_price?: string | null;
}

export interface XxlProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  published_at: string;
  created_at: string;
  updated_at: string;
  options: Array<{ name: string; position: number; values: string[] }>;
  variants: XxlVariant[];
  images: XxlImage[];
}

export interface XxlCollection {
  id: number;
  handle: string;
  title: string;
  description?: string;
  published_at?: string;
  updated_at?: string;
  products_count?: number;
}

/**
 * Our internal normalized product — ready to upsert to our Shopify store.
 */
export interface NormalizedProduct {
  /** xxl source id — becomes sync.xxl_source_id metafield */
  xxlId: number;
  /** xxl source handle — becomes sync.xxl_source_handle metafield */
  xxlHandle: string;
  /** Our handle (may differ if collision) */
  handle: string;
  /** DE title (source of truth in xxl) */
  titleDe: string;
  /** EN title (translated) */
  titleEn: string;
  /** DE body_html (source) */
  bodyHtmlDe: string;
  /** EN body_html (translated) */
  bodyHtmlEn: string;
  vendor: string;
  productType: string;
  tags: string[];
  options: Array<{ name: string; position: number; values: string[] }>;
  variants: Array<{
    sku: string;
    price: string;
    option1?: string;
    option2?: string;
    option3?: string;
    available: boolean;
    grams?: number;
  }>;
  /** Source image URLs (fed to image regen, never uploaded raw) */
  sourceImageUrls: string[];
  /** Collection handles to assign this product into */
  collectionHandles: string[];
  /** Custom metafields parsed from body_html / variants (Sprint 4). */
  customMetafields: ProductMetafield[];
  /** FAQs extracted from body_html <dl> entries (S4 — written via metaobject upsert + product reference). */
  faqs: Array<{ question: string; answer: string }>;
}

export interface ProductMetafield {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface CachedImage {
  fileGid: string;
  /** Shopify CDN URL — permanent, usable as originalSource for productCreateMedia */
  imageUrl: string;
  generatedAt: string;
  model: string;
}

export type DiffAction = 'CREATE' | 'UPDATE' | 'ARCHIVE' | 'UNCHANGED';

export interface DiffEntry {
  action: DiffAction;
  /** Our store product GID (null if CREATE) */
  ourGid: string | null;
  /** Normalized payload from xxl (null if ARCHIVE) */
  payload: NormalizedProduct | null;
  /** Human-readable summary of what changes */
  summary: string;
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  limit: number | null;
  totalsFromXxl: number;
  totalsInStore: number;
  actions: {
    CREATE: number;
    UPDATE: number;
    ARCHIVE: number;
    UNCHANGED: number;
  };
  imagesGenerated: number;
  imagesSkippedCached: number;
  imagesCapHit: boolean;
  errors: Array<{ handle: string; phase: string; message: string }>;
}
