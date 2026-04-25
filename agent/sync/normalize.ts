/**
 * Maps xxl-heizung's Shopify JSON product shape into our internal NormalizedProduct.
 * The output is the *source* going into translate.ts + images.ts + write.ts.
 *
 * Key decisions:
 *   - `vendor` is forced to "G-Berg" (we are the seller).
 *   - `handle` is "{xxlHandle}-gberg" when we detect a collision with an existing
 *     local handle; otherwise we keep the upstream handle for SEO continuity.
 *   - `sku` is prefixed "GB-" for disambiguation; falls back to a deterministic
 *     hash of xxlId + variantId if upstream has no SKU.
 *   - EN fields are LEFT EMPTY here — translate.ts populates them.
 */

import type { XxlProduct, NormalizedProduct, ProductMetafield } from './types.js';
import {
  parseSpecTable,
  parseFaqs,
  parseDeliveryContents,
  extractGrundpreis,
  parseVariantDimensions,
} from './parse-body.js';
import { specDefaultsFor, deriveWidthCmFallback, type SpecRow } from './spec-defaults.js';

export interface NormalizeOptions {
  /** Existing handles in our store — used to detect collisions. */
  existingHandles: Set<string>;
  /** xxl product id → collection handles (output of buildProductCollectionIndex). */
  productCollections: Map<number, string[]>;
}

function deriveHandle(xxlHandle: string, existing: Set<string>): string {
  if (!existing.has(xxlHandle)) return xxlHandle;
  return `${xxlHandle}-gberg`;
}

function deriveSku(xxl: XxlProduct, variantId: number, upstreamSku: string | null | undefined): string {
  if (upstreamSku && upstreamSku.trim()) return `GB-${upstreamSku.trim()}`;
  return `GB-${xxl.id}-${variantId}`;
}

export function normalize(xxl: XxlProduct, opts: NormalizeOptions): NormalizedProduct {
  const handle = deriveHandle(xxl.handle, opts.existingHandles);
  const tags = Array.from(new Set([...(xxl.tags || []), 'synced:xxl']));

  const variants = (xxl.variants || []).map((v) => {
    const out: NormalizedProduct['variants'][number] = {
      sku: deriveSku(xxl, v.id, v.sku),
      price: v.price,
      available: v.available !== false,
    };
    if (v.option1 != null) out.option1 = v.option1;
    if (v.option2 != null) out.option2 = v.option2;
    if (v.option3 != null) out.option3 = v.option3;
    if (typeof v.grams === 'number') out.grams = v.grams;
    return out;
  });

  // Sprint 4: parse structured PDP content from body_html + variants.
  const body = xxl.body_html || '';
  const options = (xxl.options || []).map((o) => ({ name: o.name, position: o.position, values: o.values }));
  const customMetafields: ProductMetafield[] = [];

  // Sprint 5.1: every product gets a canonical localised spec table.
  // - Always start with the per-product-type defaults (EN + DE, authored once).
  // - If xxl-heizung has an inline <table> with extra rows, append them as
  //   single-locale entries (DE source on both label_en and label_de — better
  //   to show DE everywhere than to drop the data).
  const specRows: SpecRow[] = [...specDefaultsFor(xxl.product_type || '', xxl.tags || [], xxl.handle || '')];
  const parsedSpecs = parseSpecTable(body);
  if (parsedSpecs) {
    if (parsedSpecs.color)               specRows.push({ label_en: 'Color',        label_de: 'Farbe',     value_en: parsedSpecs.color,              value_de: parsedSpecs.color });
    if (parsedSpecs.thread_size)         specRows.push({ label_en: 'Thread',       label_de: 'Gewinde',   value_en: parsedSpecs.thread_size,        value_de: parsedSpecs.thread_size });
    if (parsedSpecs.connection_options)  specRows.push({ label_en: 'Connection',   label_de: 'Anschluss', value_en: parsedSpecs.connection_options, value_de: parsedSpecs.connection_options });
    for (const c of parsedSpecs.certifications || []) {
      specRows.push({ label_en: 'Certification', label_de: 'Zertifizierung', value_en: c, value_de: c });
    }
    for (const [k, v] of Object.entries(parsedSpecs.extra)) {
      specRows.push({ label_en: k, label_de: k, value_en: v, value_de: v });
    }
  }
  customMetafields.push({ namespace: 'custom', key: 'specs', type: 'json', value: JSON.stringify(specRows) });

  const delivery = parseDeliveryContents(body);
  if (delivery.length > 0) {
    customMetafields.push({
      namespace: 'custom',
      key: 'delivery_contents',
      type: 'list.single_line_text_field',
      value: JSON.stringify(delivery),
    });
  }

  const grundpreis = extractGrundpreis(body);
  if (grundpreis) {
    customMetafields.push({ namespace: 'custom', key: 'grundpreis_value', type: 'number_decimal', value: String(grundpreis.value) });
    customMetafields.push({ namespace: 'custom', key: 'grundpreis_unit', type: 'single_line_text_field', value: grundpreis.unit });
  }

  const dimensions = parseVariantDimensions(xxl.variants || [], options);
  if (dimensions.length > 0) {
    customMetafields.push({ namespace: 'custom', key: 'dimensions', type: 'json', value: JSON.stringify(dimensions) });
  }

  // Hoist single-attribute scalars that the existing PDP filters / facets read directly.
  if (parsedSpecs?.color) customMetafields.push({ namespace: 'custom', key: 'ral_color', type: 'single_line_text_field', value: parsedSpecs.color });
  if (parsedSpecs?.connection_options) customMetafields.push({ namespace: 'custom', key: 'connection_type', type: 'single_line_text_field', value: parsedSpecs.connection_options });
  // First parsed dimension's width/height/wattage become the filterable scalars.
  const firstDim = dimensions[0];
  // Sprint 3 width fallback: when the structured variant parser found no width
  // (11/55 products), mine it from the title or body HTML. Defaults to null —
  // skip the metafield write rather than emitting `width_cm: 0`.
  const widthCm =
    firstDim?.width_cm != null ? firstDim.width_cm : deriveWidthCmFallback(xxl.title || '', body);
  if (widthCm != null) customMetafields.push({ namespace: 'custom', key: 'width_cm', type: 'number_decimal', value: String(widthCm) });
  if (firstDim?.height_cm != null) customMetafields.push({ namespace: 'custom', key: 'height_cm', type: 'number_decimal', value: String(firstDim.height_cm) });
  if (firstDim?.watts != null) customMetafields.push({ namespace: 'custom', key: 'wattage', type: 'number_integer', value: String(Math.round(firstDim.watts)) });

  const faqs = parseFaqs(body);

  return {
    xxlId: xxl.id,
    xxlHandle: xxl.handle,
    handle,
    titleDe: xxl.title,
    titleEn: '',
    bodyHtmlDe: body,
    bodyHtmlEn: '',
    vendor: 'G-Berg',
    productType: xxl.product_type || '',
    tags,
    options,
    variants,
    sourceImageUrls: (xxl.images || []).map((i) => i.src),
    collectionHandles: opts.productCollections.get(xxl.id) || [],
    customMetafields,
    faqs,
  };
}
