/**
 * Build a NormalizedProduct catalog from local scraper output + owner-licensed
 * photography, joined via data/catalog-scraper-join.json.
 *
 * Inputs:
 *   - scrapper/output/<Category>/<handle>/info.json                  (DE source — full 55-product set)
 *   - catalog/<series>/<files>.{jpg,jpeg,png}                        (owner photos)
 *   - data/catalog-scraper-join.json                                 (hand-curated join)
 *
 * The loader (`loadScraperInfo` → `normalizeScraperInfo`) tolerates both the
 * `output/` and the older `output_shopify_clean/` schemas, so swapping
 * `--scraper-root` between them works without further changes.
 *
 * Output:
 *   - data/catalog/gberg-catalog.json  ({ _generated, _source, _count, products: NormalizedProduct[] })
 *
 * The output is consumed verbatim by `loadLocalCatalog()` in agent/sync/index.ts
 * (see lines ~95-141). EN fields are intentionally left empty; translate.ts
 * fills them on first sync. Image regeneration is skipped because we set
 * `sourceImageUrls = []` — see `regenerateImagesForProduct` in images.ts:350.
 *
 * Helpers reused via type-only imports (we don't run xxl normalize() on this
 * path — the scraper data is already category-tagged and shape-flat enough
 * to write directly):
 *   - NormalizedProduct, ProductMetafield → ./types.js
 *   - mapXxlCollectionHandle              → ./collection-map.js
 *
 * CLI:
 *   npx tsx agent/sync/build-from-scraper.ts \
 *     --scraper-root scrapper/output \
 *     --catalog-root catalog \
 *     --join data/catalog-scraper-join.json \
 *     --output data/catalog/gberg-catalog.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapXxlCollectionHandle } from './collection-map.js';
import { normalizeOptionValue } from './normalize-option-value.js';
import type { NormalizedProduct, ProductMetafield } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** Base directory containing the scraper output_shopify_clean tree */
  scraperRoot: string;
  /** Base directory containing owner-licensed photography */
  catalogRoot: string;
  /** Path to the catalog↔scraper join JSON */
  joinPath: string;
  /** Where to write the resulting gberg-catalog.json */
  outputPath: string;
  /** Vendor string for all products (default "G-Berg") */
  vendor?: string;
  /**
   * If true, emit a stub PDP for catalog/ orphans (Multiblock, Premium Elanor,
   * Premium Elanor Elektrisch, Typ 20). Default false — handled in a later pass.
   */
  includeManualOrphans?: boolean;
}

export interface BuildReport {
  productsEmitted: number;
  productsWithLocalImages: number;
  productsWithPlaceholderImages: number;
  totalLocalImagesReferenced: number;
  collectionDistribution: Record<string, number>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal types — only what we read out of scraper info.json / join.
// ---------------------------------------------------------------------------

interface JoinEntry {
  handle: string;
  title_de: string;
  series: string;
  color: string | null;
  electric: boolean;
  catalog_folder: string | null;
  image_filter: string;
  notes?: string;
}

interface JoinFile {
  products: JoinEntry[];
  _orphan_catalog_folders?: Array<{ folder: string; reason: string }>;
}

interface ScraperVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  /** xxl-heizung's original price when a sale is running. Used to recover the
   *  pre-discount value — G-Berg has no discounts, so we list the original. */
  compare_at_price: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  weight: number | null;
  weight_unit: string | null;
  available: boolean | null;
}

/**
 * Pick the regular (non-discounted) price from an xxl variant.
 * If xxl is running a promotion, `compare_at_price` holds the original
 * higher value — return that. Otherwise fall back to `price`.
 */
// Use xxl's current selling price; the inflated compare_at is ignored.
// See agent/sync/normalize.ts pickSellingPrice for the rationale.
function pickSellingPrice(price: string): string {
  return price;
}

interface ScraperSection {
  title: string;
  text: string;
  html: string;
  source: string;
}

interface ScraperInfo {
  id: number;
  handle: string;
  title: string;
  vendor: string;
  product_type: string;
  categories: string[];
  tags: string[];
  description_text: string;
  description_html: string;
  specifications: Record<string, unknown>;
  sections: ScraperSection[];
  variants: ScraperVariant[];
  images: Array<{ index: number; url: string; local_file: string }>;
  pdfs: Array<{ index: number; url: string; local_file: string }>;
  /** Bullet-list selling points from the source PDP (output/ schema only). */
  feature_highlights?: string[];
}

// ---------------------------------------------------------------------------
// product_type derivation (ordered: first matching primary category wins)
// ---------------------------------------------------------------------------

const PRODUCT_TYPE_BY_CATEGORY: Array<[string, string]> = [
  ['badheizkorper-elektrisch', 'Electric bathroom radiator'],
  ['austauschheizkorper', 'Replacement radiator'],
  ['badheizkorper', 'Bathroom radiator'],
  ['wohnraumheizkorper', 'Living-room radiator'],
  ['fussbodenheizungsrohre', 'Underfloor pipe'],
  ['bad', 'Bathroom fixture'],
  ['zubehor', 'Accessory'],
];

function deriveProductType(categories: string[]): string {
  const lc = categories.map((c) => c.toLowerCase());
  for (const [key, label] of PRODUCT_TYPE_BY_CATEGORY) {
    if (lc.includes(key)) return label;
  }
  return 'Radiator';
}

// ---------------------------------------------------------------------------
// Shared / heating metafield derivation
// ---------------------------------------------------------------------------
//
// Best-effort emissions for fields the namespace-migration brief wants
// populated wherever derivable from scraper data. Every helper returns null
// (or empty) when the field cannot be computed, so the caller can drop it
// without writing a blank value (Shopify rejects "" on single_line_text_field).

const COLOR_TO_FAMILY: Record<string, string> = {
  anthrazit: 'anthracite',
  schwarz: 'black',
  weiss: 'white',
  weiß: 'white',
  chrom: 'chrome',
  silber: 'silver',
};

const PRODUCT_TYPE_TO_FILTER: Record<string, string> = {
  'electric bathroom radiator': 'towel_radiator',
  'replacement radiator': 'radiator',
  'bathroom radiator': 'towel_radiator',
  'living-room radiator': 'radiator',
  'underfloor pipe': 'underfloor_heating',
  'bathroom fixture': 'bathroom_fixture',
  accessory: 'accessory',
  radiator: 'radiator',
};

function firstSentence(text: string, maxLen: number): string {
  if (!text) return '';
  // German end-of-sentence: ". " / "! " / "? " / newline.
  const m = text.match(/^(.{10,}?[.!?])(\s|$)/s);
  const head = m ? m[1] : text;
  const trimmed = head.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  // Truncate at a word boundary <= maxLen to avoid orphan partial words.
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

function firstParagraph(text: string, maxLen: number): string {
  if (!text) return '';
  const para = text.split(/\n\s*\n/)[0] ?? text;
  const trimmed = para.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

interface DerivationJoin {
  series: string;
  color: string | null;
  electric: boolean;
}

interface DerivationInfo {
  description_text?: string;
  categories?: string[];
}

/**
 * Emit best-effort metafields under the brief-compliant namespaces. All
 * conditional — null/empty derivations are skipped so optional text fields
 * never write empty strings.
 */
function deriveSharedMetafields(info: DerivationInfo, entry: DerivationJoin): ProductMetafield[] {
  const out: ProductMetafield[] = [];
  const productType = deriveProductType(info.categories || []);
  const desc = info.description_text || '';

  // custom.subtitle — first sentence, ≤ 80 chars (matches single_line_text_field heuristic).
  const subtitle = firstSentence(desc, 80);
  if (subtitle) {
    out.push({ namespace: 'custom', key: 'subtitle', type: 'single_line_text_field', value: subtitle });
  }

  // custom.short_description — first paragraph, ≤ 240 chars.
  const shortDesc = firstParagraph(desc, 240);
  if (shortDesc) {
    out.push({ namespace: 'custom', key: 'short_description', type: 'multi_line_text_field', value: shortDesc });
  }

  // merchandising.badges — list. Bestseller marker + electric tag.
  const badges: string[] = [];
  const lcCats = (info.categories || []).map((c) => c.toLowerCase());
  if (lcCats.includes('bestseller')) badges.push('bestseller');
  if (entry.electric) badges.push('electric');
  if (badges.length > 0) {
    out.push({
      namespace: 'merchandising',
      key: 'badges',
      type: 'list.single_line_text_field',
      value: JSON.stringify(badges),
    });
  }

  // seo.primary_keyword — series + product type, e.g. "ELANOR towel radiator".
  if (entry.series) {
    const ptShort = (PRODUCT_TYPE_TO_FILTER[productType.toLowerCase()] || 'radiator').replace(/_/g, ' ');
    const kw = `${entry.series} ${ptShort}`.trim();
    if (kw) {
      out.push({ namespace: 'seo', key: 'primary_keyword', type: 'single_line_text_field', value: kw });
    }
  }

  // localization.market_visibility — default markets per the brief launch list.
  out.push({
    namespace: 'localization',
    key: 'market_visibility',
    type: 'list.single_line_text_field',
    value: JSON.stringify(['nl', 'be', 'de', 'fr']),
  });

  // specs.color — DE color string from the join (anthrazit/schwarz/weiss/...).
  if (entry.color) {
    out.push({ namespace: 'specs', key: 'color', type: 'single_line_text_field', value: entry.color });
  }

  // specs.heating_medium — electric vs hydronic. Brief allows hydronic|electric|dual_fuel.
  out.push({
    namespace: 'specs',
    key: 'heating_medium',
    type: 'single_line_text_field',
    value: entry.electric ? 'electric' : 'hydronic',
  });

  // filters.color_family — normalized English bucket.
  if (entry.color) {
    const family = COLOR_TO_FAMILY[entry.color.toLowerCase()];
    if (family) {
      out.push({ namespace: 'filters', key: 'color_family', type: 'single_line_text_field', value: family });
    }
  }

  // filters.product_type — normalized snake_case bucket.
  const filterType = PRODUCT_TYPE_TO_FILTER[productType.toLowerCase()];
  if (filterType) {
    out.push({ namespace: 'filters', key: 'product_type', type: 'single_line_text_field', value: filterType });
  }

  return out;
}

// ---------------------------------------------------------------------------
// FAQ extraction from sections[]
// ---------------------------------------------------------------------------

const GERMAN_QUESTION_WORDS = /^(was|wie|wann|wo|welche|warum|kann|sind|ist|haben|hat|gibt)\b/i;

function looksLikeQuestion(title: string): boolean {
  if (!title) return false;
  const t = title.trim();
  if (t.endsWith('?')) return true;
  return GERMAN_QUESTION_WORDS.test(t);
}

/**
 * Sections that the scraper picks up from xxl's footer / chrome — we never
 * want these as FAQs (they leak the upstream brand). Match by title prefix.
 */
const FAQ_BLOCKLIST = [
  'haben sie fragen zu diesem produkt',
  'expertenberatung',
  'sichere zahlungen',
  'schnelle lieferung',
  'deutsche qualität',
  'warum sie bei xxl heizung kaufen',
  'unser engagement für qualität',
  'customer reviews',
  'kontakt',
  'hauptmenü',
  'kundeninformationen',
  'funktionale effizienz', // generic marketing copy block
  'maximal flexibel',
  // Theme-chrome catch-alls — the scraper extracts these from sectioned
  // OS 2.0 widgets (custom content blocks, banners, etc.) and they contain
  // huge embedded HTML that bloats the catalog with no product value.
  'custom content',
  'untitled section',
];

function isBlockedFaqTitle(title: string): boolean {
  const t = title.toLowerCase();
  return FAQ_BLOCKLIST.some((p) => t.startsWith(p));
}

function extractFaqs(sections: ScraperSection[]): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  for (const s of sections) {
    if (!s || !s.title || !s.text) continue;
    if (isBlockedFaqTitle(s.title)) continue;
    if (!looksLikeQuestion(s.title)) continue;
    const question = s.title.trim();
    const answer = s.text.trim();
    if (!question || !answer) continue;
    out.push({ question, answer });
    if (out.length >= 12) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Variant + options conversion
// ---------------------------------------------------------------------------

interface NormVariant {
  sku: string;
  price: string;
  option1?: string;
  option2?: string;
  option3?: string;
  available: boolean;
  grams?: number;
}

function buildVariants(info: ScraperInfo): { variants: NormVariant[]; options: NormalizedProduct['options'] } {
  // Drop the bare default-only variant when the scraper picked up just a single
  // unconfigured row (option1==null AND title==product title).
  const candidates = info.variants.filter((v) => {
    const isPlaceholder =
      v.option1 == null &&
      v.option2 == null &&
      v.option3 == null &&
      (v.title || '').trim() === info.title.trim();
    return !isPlaceholder;
  });
  // If the placeholder filter swallowed everything, fall back to the raw list
  // so we always emit at least one variant.
  const rows = candidates.length > 0 ? candidates : info.variants;

  const variants: NormVariant[] = rows.map((v) => {
    const out: NormVariant = {
      sku: v.sku && v.sku.trim() ? `GB-${v.sku.trim()}` : `GB-${info.id}-${v.id}`,
      // Policy 2026-06: list xxl's current selling price; the inflated
      // compare_at (fake-discount) is ignored.
      price: pickSellingPrice((v.price ?? '0').toString()),
      available: true, // scraper data is always null; default to available
    };
    // Strip baked-in availability text and canonicalize the dimension
    // separator so "50 x 180 nicht Vorrätig" → "50 × 180" before it becomes a
    // Shopify option value. The unique() axis derivation below then collapses
    // any x/× duplicates correctly.
    if (v.option1 != null) out.option1 = normalizeOptionValue(v.option1);
    if (v.option2 != null) out.option2 = normalizeOptionValue(v.option2);
    if (v.option3 != null) out.option3 = normalizeOptionValue(v.option3);
    if (typeof v.weight === 'number' && v.weight > 0 && v.weight_unit === 'kg') {
      out.grams = Math.round(v.weight * 1000);
    }
    return out;
  });

  // Options: derive from variant axes that are actually populated.
  const has1 = variants.some((v) => v.option1 != null);
  const has2 = variants.some((v) => v.option2 != null);
  const has3 = variants.some((v) => v.option3 != null);
  const options: NormalizedProduct['options'] = [];
  if (has1) {
    const values = unique(variants.map((v) => v.option1!).filter(Boolean));
    options.push({ name: guessAxisName(values, 'Size'), position: 1, values });
  }
  if (has2) {
    const values = unique(variants.map((v) => v.option2!).filter(Boolean));
    options.push({ name: guessAxisName(values, 'Color'), position: 2, values });
  }
  if (has3) {
    const values = unique(variants.map((v) => v.option3!).filter(Boolean));
    options.push({ name: guessAxisName(values, 'Connection'), position: 3, values });
  }
  // Fallback: at least one option is required by Shopify when there are
  // multiple variants. If nothing was populated, synthesise a single default
  // axis so the catalog is well-formed.
  if (options.length === 0 && variants.length > 0) {
    options.push({ name: 'Title', position: 1, values: ['Default'] });
    for (const v of variants) v.option1 = 'Default';
  }
  return { variants, options };
}

function unique(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

/**
 * Heuristic: option values that look like "400 x 500 mm" → Size; values like
 * "Anthrazit"/"Weiß"/"Schwarz" → Color; "Mittelanschluss"/"Seitenanschluss" →
 * Connection. Otherwise fall back to the supplied default.
 */
function guessAxisName(values: string[], fallback: string): string {
  const lc = values.map((v) => v.toLowerCase()).join(' ');
  // Values are normalized to the "×" separator before this runs, so match both.
  if (/\d+\s*[x×]\s*\d+|\bmm\b|\bcm\b/.test(lc)) return 'Size';
  if (/anthrazit|wei[sß]+|schwarz|chrom|silber/.test(lc)) return 'Color';
  if (/anschluss|mittel|seite/.test(lc)) return 'Connection';
  return fallback;
}

// ---------------------------------------------------------------------------
// Image discovery
// ---------------------------------------------------------------------------

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png']);

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of IMG_EXT) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

/**
 * "weiß" should match files named "weiss" and vice-versa. We also lowercase
 * everything because filenames are inconsistent (Weiß / weiß / WEISS …).
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');
}

function imageFilterMatches(filename: string, filter: string): boolean {
  if (!filter) return true;
  const f = normalizeForMatch(filename);
  const needle = normalizeForMatch(filter);
  if (f.includes(needle)) return true;
  // Tolerance: catalog filenames sometimes truncate the German color name
  // (e.g. "Anthrazi matt …" instead of "Anthrazit matt …"). When the filter
  // is reasonably long, also accept matches against its leading 6 chars so
  // typo-prefix files still join. Stays strict enough to avoid false hits
  // ("weiss" → 6 chars is the whole word).
  if (needle.length >= 7) {
    return f.includes(needle.slice(0, 6));
  }
  return false;
}

interface ImageHit {
  /** Absolute path on disk (used only to verify file exists) */
  abs: string;
  /** Forward-slash path relative to projectRoot (this is what we store) */
  rel: string;
}

function listImagesIn(dir: string, projectRoot: string): ImageHit[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const entries = readdirSync(dir);
  const hits: ImageHit[] = [];
  for (const name of entries) {
    if (!isImageFile(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (!st.isFile()) continue;
    hits.push({ abs, rel: toForwardSlash(relative(projectRoot, abs)) });
  }
  hits.sort((a, b) => a.rel.localeCompare(b.rel, undefined, {numeric: true, sensitivity: 'base'}));
  return hits;
}

function toForwardSlash(p: string): string {
  return p.split(sep).join('/');
}

/**
 * For a catalog/Fotos 11.8.25/<group>/<series-folder>/... lifestyle tree, find
 * the series subfolder by case- and umlaut-insensitive name match, then walk
 * one level deeper (some series have nested per-variant subfolders) and grab
 * up to N images.
 */
function findLifestyleImages(
  catalogRoot: string,
  projectRoot: string,
  group: 'BANYO PETEKLERİ' | 'SALON PETEKLERİ',
  series: string,
  cap: number,
): ImageHit[] {
  const groupDir = join(catalogRoot, 'Fotos 11.8.25', group);
  if (!existsSync(groupDir)) return [];
  const seriesNeedle = normalizeForMatch(series.replace(/[İI]/g, 'I'));
  let seriesDir: string | null = null;
  for (const name of readdirSync(groupDir)) {
    const cleaned = normalizeForMatch(name.replace(/[İI]/g, 'I'));
    if (cleaned.startsWith(seriesNeedle) || seriesNeedle.startsWith(cleaned)) {
      const candidate = join(groupDir, name);
      if (statSync(candidate).isDirectory()) {
        seriesDir = candidate;
        break;
      }
    }
  }
  if (!seriesDir) return [];
  const out: ImageHit[] = [];
  // Direct children: either image files or per-variant subfolders.
  for (const name of readdirSync(seriesDir)) {
    if (out.length >= cap) break;
    const abs = join(seriesDir, name);
    const st = statSync(abs);
    if (st.isFile() && isImageFile(name)) {
      out.push({ abs, rel: toForwardSlash(relative(projectRoot, abs)) });
    } else if (st.isDirectory()) {
      for (const inner of readdirSync(abs)) {
        if (out.length >= cap) break;
        const innerAbs = join(abs, inner);
        if (!isImageFile(inner)) continue;
        if (!statSync(innerAbs).isFile()) continue;
        out.push({ abs: innerAbs, rel: toForwardSlash(relative(projectRoot, innerAbs)) });
      }
    }
  }
  out.sort((a, b) => a.rel.localeCompare(b.rel, undefined, {numeric: true, sensitivity: 'base'}));
  return out.slice(0, cap);
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

const HANDLE_RE = /^[a-z0-9-]+$/;

/**
 * FNV-1a 32-bit hash, mapped to the 8e11..9e11 range. Used to synthesise a
 * stable positive `xxlId` for products read from the `output/` scraper tree
 * (which lacks the top-level Shopify product id). Hash is deterministic over
 * the handle so re-runs produce the same id, which keeps downstream upserts
 * idempotent.
 */
function deriveSyntheticId(handle: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 800_000_000_000 + (h % 1_000_000_000);
}

/**
 * Strip German diacritics + lowercase, used to map output/ category names
 * (`"Wohnraumheizkörper"`) to the ASCII slug form (`"wohnraumheizkorper"`)
 * that mapXxlCollectionHandle() expects.
 */
function asciiSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Adapter: convert the raw scraper JSON (which may be either the
 * `output_shopify_clean/` schema or the richer `output/` schema) into the
 * canonical `ScraperInfo` shape the rest of build-from-scraper expects.
 *
 * Differences handled:
 *   - `output/` lacks top-level `id` → synthesise via deriveSyntheticId(handle).
 *   - `output/` uses `description` (not `description_text`).
 *   - `output/` keeps untouched German category names with umlauts; we slug
 *     them to ASCII so collection-map.ts can resolve them.
 *   - `output/` has no flat `sections[]`; we synthesise it from
 *     `named_sections` (Q&A dict), `collapsible_sections` (FAQ list), and the
 *     subset of `custom_sections` that carry editorial content
 *     (`section_type ∈ {collapsible_content, custom_content}`).
 *   - `output/` variants expose `grams` instead of `weight` + `weight_unit`;
 *     we map back to weight (kg) so buildVariants() can keep its single
 *     code path.
 *   - `output/` images use `original_url` instead of `url`; we copy across.
 *   - `output/` carries `feature_highlights[]`; we forward verbatim.
 */
function normalizeScraperInfo(parsed: unknown, handle: string): ScraperInfo {
  const p = parsed as Record<string, unknown>;
  const categoriesRaw = (p.categories as string[]) || [];
  const categories = categoriesRaw.map(asciiSlug).filter(Boolean);

  const description_text =
    (typeof p.description_text === 'string' && p.description_text) ||
    (typeof p.description === 'string' && p.description) ||
    '';

  // Sections: prefer flat sections[] when present; otherwise synthesise from
  // the output/ schema's three section buckets.
  let sections: ScraperSection[];
  if (Array.isArray(p.sections) && p.sections.length > 0) {
    sections = p.sections as ScraperSection[];
  } else {
    sections = [];
    // named_sections is a { question: answer } dict.
    const named = (p.named_sections as Record<string, string> | undefined) || {};
    if (named && typeof named === 'object' && !Array.isArray(named)) {
      for (const [q, a] of Object.entries(named)) {
        if (!q || !a) continue;
        sections.push({
          title: q,
          text: String(a),
          html: `<p>${String(a)}</p>`,
          source: 'named_section',
        });
      }
    }
    // collapsible_sections: [{ heading, content }]
    const collapsible = (p.collapsible_sections as Array<{ heading?: string; content?: string }> | undefined) || [];
    for (const c of collapsible) {
      if (!c || !c.heading || !c.content) continue;
      sections.push({
        title: c.heading,
        text: c.content,
        html: `<p>${c.content}</p>`,
        source: 'collapsible',
      });
    }
    // custom_sections: keep only editorial blocks (collapsible_content,
    // custom_content), drop chrome (custom_section). Each has heading +
    // content_text.
    const custom = (p.custom_sections as Array<{ section_type?: string; heading?: string; content_text?: string }> | undefined) || [];
    for (const c of custom) {
      if (!c || !c.heading || !c.content_text) continue;
      const type = c.section_type || '';
      if (type !== 'collapsible_content' && type !== 'custom_content') continue;
      sections.push({
        title: c.heading,
        text: c.content_text,
        html: `<p>${c.content_text}</p>`,
        source: 'custom_section',
      });
    }
  }

  // Variants: fold `grams` back into weight/weight_unit so buildVariants stays
  // unchanged. `output_shopify_clean` already supplies weight + weight_unit.
  const variantsRaw = (p.variants as Array<Record<string, unknown>>) || [];
  const variants: ScraperVariant[] = variantsRaw.map((v) => {
    const grams = typeof v.grams === 'number' ? (v.grams as number) : null;
    const weight =
      typeof v.weight === 'number'
        ? (v.weight as number)
        : grams !== null && grams > 0
          ? grams / 1000
          : null;
    const weight_unit =
      typeof v.weight_unit === 'string'
        ? (v.weight_unit as string)
        : weight !== null
          ? 'kg'
          : null;
    return {
      id: typeof v.id === 'number' ? (v.id as number) : 0,
      title: typeof v.title === 'string' ? (v.title as string) : '',
      sku: typeof v.sku === 'string' ? (v.sku as string) : null,
      price: typeof v.price === 'string' ? (v.price as string) : '0',
      compare_at_price: typeof v.compare_at_price === 'string' ? (v.compare_at_price as string) : null,
      option1: (v.option1 as string | null) ?? null,
      option2: (v.option2 as string | null) ?? null,
      option3: (v.option3 as string | null) ?? null,
      weight,
      weight_unit,
      available: (v.available as boolean | null) ?? null,
    };
  });

  // Images / PDFs: output/ uses `original_url`; clean uses `url`. Either way,
  // the buildOneProduct() flow ignores both URLs (sets sourceImageUrls = [])
  // and uses the catalog/ owner-licensed photos instead. We still copy the
  // urls through so downstream auditing has the source reference.
  const imagesRaw = (p.images as Array<Record<string, unknown>>) || [];
  const images = imagesRaw.map((im, i) => ({
    index: typeof im.index === 'number' ? (im.index as number) : i + 1,
    url: (typeof im.url === 'string' && im.url) || (typeof im.original_url === 'string' && im.original_url) || '',
    local_file: (im.local_file as string) || '',
  }));
  const pdfsRaw = (p.pdfs as Array<Record<string, unknown>>) || [];
  const pdfs = pdfsRaw.map((pf, i) => ({
    index: typeof pf.index === 'number' ? (pf.index as number) : i + 1,
    url: (typeof pf.url === 'string' && pf.url) || (typeof pf.original_url === 'string' && pf.original_url) || '',
    local_file: (pf.local_file as string) || '',
  }));

  const feature_highlights = Array.isArray(p.feature_highlights)
    ? (p.feature_highlights as string[]).filter((x) => typeof x === 'string' && x.trim().length > 0)
    : undefined;

  return {
    id: typeof p.id === 'number' && (p.id as number) > 0 ? (p.id as number) : deriveSyntheticId(handle),
    handle: (p.handle as string) || handle,
    title: (p.title as string) || '',
    vendor: (p.vendor as string) || '',
    product_type: (p.product_type as string) || '',
    categories,
    tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    description_text,
    description_html: (p.description_html as string) || '',
    specifications: (p.specifications as Record<string, unknown>) || {},
    sections,
    variants,
    images,
    pdfs,
    ...(feature_highlights && feature_highlights.length > 0 ? { feature_highlights } : {}),
  };
}

function loadScraperInfo(scraperRoot: string, handle: string): { info: ScraperInfo; relDir: string } | null {
  // Walk all category subdirs to find <handle>/info.json — the scraper
  // organises by primary category, but we don't know which one.
  const categories = readdirSync(scraperRoot).filter((c) =>
    statSync(join(scraperRoot, c)).isDirectory(),
  );
  for (const cat of categories) {
    const dir = join(scraperRoot, cat, handle);
    const file = join(dir, 'info.json');
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8');
      const info = normalizeScraperInfo(JSON.parse(raw), handle);
      return { info, relDir: `${cat}/${handle}` };
    }
  }
  return null;
}

interface BuildContext {
  projectRoot: string;
  scraperRoot: string;
  catalogRoot: string;
  vendor: string;
  warnings: string[];
}

function buildOneProduct(entry: JoinEntry, ctx: BuildContext): {
  product: NormalizedProduct;
  hasLocalImages: boolean;
  imageCount: number;
} | null {
  const loaded = loadScraperInfo(ctx.scraperRoot, entry.handle);
  if (!loaded) {
    ctx.warnings.push(`scraper_info_missing: ${entry.handle}`);
    return null;
  }
  const { info } = loaded;

  // Title: trust the join when it explicitly differs (hand-corrected).
  const titleDe = (entry.title_de && entry.title_de.trim()) || info.title;

  // Tags: scraper tags + series + color + electric + bestseller marker.
  const tagSet = new Set<string>(info.tags || []);
  if (entry.series) tagSet.add(entry.series.toLowerCase());
  if (entry.color) tagSet.add(entry.color.toLowerCase());
  if (entry.electric) tagSet.add('electric');
  if ((info.categories || []).map((c) => c.toLowerCase()).includes('bestseller')) {
    tagSet.add('bestseller');
  }
  const tags = Array.from(tagSet).sort();

  // Variants + options.
  const { variants, options } = buildVariants(info);

  // Collections: map each scraper category through the existing translator.
  const collectionHandles = unique(
    (info.categories || [])
      .map((c) => mapXxlCollectionHandle(c))
      .filter((c): c is string => c !== null),
  );

  // Images: catalog folder + lifestyle.
  const imageRels: string[] = [];
  if (entry.catalog_folder) {
    const folder = join(ctx.catalogRoot, entry.catalog_folder);
    const all = listImagesIn(folder, ctx.projectRoot);
    const matched = all.filter((h) => imageFilterMatches(h.abs.split(sep).pop()!, entry.image_filter));
    if (matched.length === 0) {
      ctx.warnings.push(
        `no_images_match_filter: ${entry.handle} (folder="${entry.catalog_folder}", filter="${entry.image_filter}")`,
      );
    }
    for (const h of matched.slice(0, 8)) imageRels.push(h.rel);
  } else {
    ctx.warnings.push(`no_catalog_folder: ${entry.handle}`);
  }

  // Lifestyle (only for bath/living-room series).
  const productTypeLower = deriveProductType(info.categories || []).toLowerCase();
  const isBath = productTypeLower.includes('bathroom');
  const isLiving = productTypeLower.includes('living-room');
  if (isBath && entry.series) {
    const life = findLifestyleImages(ctx.catalogRoot, ctx.projectRoot, 'BANYO PETEKLERİ', entry.series, 3);
    for (const h of life) imageRels.push(h.rel);
  } else if (isLiving && entry.series) {
    const life = findLifestyleImages(ctx.catalogRoot, ctx.projectRoot, 'SALON PETEKLERİ', entry.series, 3);
    for (const h of life) imageRels.push(h.rel);
  }

  const dedupedImages = unique(imageRels);
  const imageStatus = dedupedImages.length > 0 ? 'owner_licensed' : 'placeholder_needed';

  // PDF (only if the catalog folder has a PDF.pdf).
  let localPdfPath = '';
  if (entry.catalog_folder) {
    const candidate = join(ctx.catalogRoot, entry.catalog_folder, 'PDF.pdf');
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      localPdfPath = toForwardSlash(relative(ctx.projectRoot, candidate));
    }
  }

  // Custom metafields — emitted under the brief-compliant namespaces from
  // for-claude/shop/08_shopify_metafields_metaobjects_definitions.md. The
  // legacy `gberg.*` namespace was retired in the namespace migration; see
  // agent/scripts/install-metafield-definitions.mjs for the schema and
  // agent/scripts/migrate-metafield-namespaces.mjs for the data migration.
  //
  // Shopify rejects single_line_text_field metafields with empty-string
  // values ("Value can't be blank"), so optional text fields are pushed
  // conditionally rather than declared inline. JSON fields tolerate empty
  // arrays/objects so they go inline.
  const customMetafields: ProductMetafield[] = [
    // media.local_images — list of repo-relative paths to owner-licensed photos.
    {
      namespace: 'media',
      key: 'local_images',
      type: 'json',
      value: JSON.stringify(dedupedImages),
    },
    // media.image_status — image-pipeline state ("owner_licensed" | "placeholder_needed").
    {
      namespace: 'media',
      key: 'image_status',
      type: 'single_line_text_field',
      value: imageStatus,
    },
    // custom.copy_status — content provenance ("scraper_de" | "manual_stub").
    {
      namespace: 'custom',
      key: 'copy_status',
      type: 'single_line_text_field',
      value: 'scraper_de',
    },
  ];

  if (localPdfPath) {
    // media.primary_pdf_url — repo-relative path; uploaded to Shopify Files in a
    // later pass and replaced with the canonical CDN URL.
    customMetafields.push({
      namespace: 'media',
      key: 'primary_pdf_url',
      type: 'single_line_text_field',
      value: localPdfPath,
    });
  }

  if (info.specifications && Object.keys(info.specifications).length > 0) {
    // specs.raw_source — verbatim scraper specifications blob (audit trail).
    customMetafields.push({
      namespace: 'specs',
      key: 'raw_source',
      type: 'json',
      value: JSON.stringify(info.specifications),
    });
  }

  // Drop xxl chrome (footer, contact block, review widget, marketing splash,
  // theme custom-content widgets) before persisting content.sections_de. The
  // scraper picks those up on every page and they balloon the catalog file
  // from ~1 MB to ~8 MB. The same FAQ_BLOCKLIST drives the filter. We also
  // cap any single section's html at 8 KB and drop sections whose html
  // exceeds 50 KB outright (always chrome).
  const SECTION_HTML_CAP = 8_000;
  const SECTION_HTML_DROP = 50_000;
  const productSections = (info.sections || [])
    .filter((s) => s && s.title && !isBlockedFaqTitle(s.title))
    .filter((s) => (s.html ?? '').length < SECTION_HTML_DROP)
    .map((s) => ({
      title: s.title,
      text: (s.text ?? '').slice(0, SECTION_HTML_CAP),
      html: (s.html ?? '').slice(0, SECTION_HTML_CAP),
      source: s.source,
    }));
  if (productSections.length > 0) {
    // content.sections_de — DE-source sections for editorial review.
    customMetafields.push({
      namespace: 'content',
      key: 'sections_de',
      type: 'json',
      value: JSON.stringify(productSections),
    });
  }

  // content.feature_highlights_de — bullet-list selling points (DE source).
  // Only present in the richer `output/` schema; cleaned scraper omits it.
  if (info.feature_highlights && info.feature_highlights.length > 0) {
    customMetafields.push({
      namespace: 'content',
      key: 'feature_highlights_de',
      type: 'json',
      value: JSON.stringify(info.feature_highlights),
    });
  }

  // Best-effort derived fields per the namespace migration brief.
  // Each emission is conditional — empty/undefined values are dropped to avoid
  // Shopify's "Value can't be blank" rejection on single_line_text_field.
  const derived = deriveSharedMetafields(info, entry);
  for (const mf of derived) customMetafields.push(mf);

  const faqs = extractFaqs(info.sections || []);

  const product: NormalizedProduct = {
    xxlId: info.id,
    xxlHandle: info.handle,
    handle: info.handle,
    titleDe,
    titleEn: '',
    bodyHtmlDe: info.description_html || '',
    bodyHtmlEn: '',
    vendor: ctx.vendor,
    productType: deriveProductType(info.categories || []),
    tags,
    options,
    variants,
    sourceImageUrls: [], // skip image-regen pipeline (see images.ts:350)
    collectionHandles,
    customMetafields,
    faqs,
  };

  return {
    product,
    hasLocalImages: dedupedImages.length > 0,
    imageCount: dedupedImages.length,
  };
}

// ---------------------------------------------------------------------------
// Manual orphan stubs
// ---------------------------------------------------------------------------

const MANUAL_ORPHAN_FOLDERS = [
  'Multiblock',
  'Premium Elanor',
  'Premium Elanor Elektrisch',
  'Typ 20',
];

function buildOrphanStub(folder: string, ctx: BuildContext, syntheticId: number): {
  product: NormalizedProduct;
  hasLocalImages: boolean;
  imageCount: number;
} {
  const handle = folder
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dir = join(ctx.catalogRoot, folder);
  const images = listImagesIn(dir, ctx.projectRoot).slice(0, 8);
  let localPdfPath = '';
  const pdfAbs = join(dir, 'PDF.pdf');
  if (existsSync(pdfAbs)) localPdfPath = toForwardSlash(relative(ctx.projectRoot, pdfAbs));

  // Brief-compliant namespaces (see header comment in buildOneProduct).
  const customMetafields: ProductMetafield[] = [
    {
      namespace: 'media',
      key: 'local_images',
      type: 'json',
      value: JSON.stringify(images.map((i) => i.rel)),
    },
    {
      namespace: 'media',
      key: 'image_status',
      type: 'single_line_text_field',
      value: images.length > 0 ? 'owner_licensed' : 'placeholder_needed',
    },
    {
      namespace: 'custom',
      key: 'copy_status',
      type: 'single_line_text_field',
      value: 'manual_stub',
    },
  ];

  // single_line_text_field rejects empty strings; only emit primary_pdf_url
  // when we actually located a PDF in the catalog folder.
  if (localPdfPath) {
    customMetafields.push({
      namespace: 'media',
      key: 'primary_pdf_url',
      type: 'single_line_text_field',
      value: localPdfPath,
    });
  }

  const product: NormalizedProduct = {
    xxlId: syntheticId,
    xxlHandle: handle,
    handle,
    titleDe: folder,
    titleEn: '',
    bodyHtmlDe: '<p>Produktbeschreibung folgt</p>',
    bodyHtmlEn: '',
    vendor: ctx.vendor,
    productType: 'Radiator',
    tags: ['manual-stub'],
    options: [{ name: 'Title', position: 1, values: ['Default'] }],
    variants: [
      {
        sku: `GB-STUB-${handle}`,
        price: '0.00',
        option1: 'Default',
        available: false,
      },
    ],
    sourceImageUrls: [],
    collectionHandles: [],
    customMetafields,
    faqs: [],
  };
  return { product, hasLocalImages: images.length > 0, imageCount: images.length };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(product: NormalizedProduct, warnings: string[]): void {
  // Hard requirements — throw.
  if (!Number.isFinite(product.xxlId) || product.xxlId <= 0) {
    throw new Error(`invalid xxlId for handle "${product.handle}": ${product.xxlId}`);
  }
  if (!HANDLE_RE.test(product.handle)) {
    throw new Error(`invalid handle "${product.handle}" (must match ${HANDLE_RE})`);
  }
  if (!product.titleDe || !product.titleDe.trim()) {
    throw new Error(`empty titleDe for handle "${product.handle}"`);
  }

  // Soft — warn only.
  if (product.variants.length === 0) {
    warnings.push(`empty_variants: ${product.handle}`);
  }
  if (product.collectionHandles.length === 0) {
    warnings.push(`empty_collections: ${product.handle}`);
  }
  for (const v of product.variants) {
    const n = Number(v.price);
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(`invalid_price: ${product.handle} sku=${v.sku} price="${v.price}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export async function buildFromScraper(opts: BuildOptions): Promise<BuildReport> {
  const projectRoot = process.cwd();
  const scraperRoot = resolve(projectRoot, opts.scraperRoot);
  const catalogRoot = resolve(projectRoot, opts.catalogRoot);
  const joinPath = resolve(projectRoot, opts.joinPath);
  const outputPath = resolve(projectRoot, opts.outputPath);
  const vendor = opts.vendor ?? 'G-Berg';

  if (!existsSync(scraperRoot)) throw new Error(`scraperRoot not found: ${scraperRoot}`);
  if (!existsSync(catalogRoot)) throw new Error(`catalogRoot not found: ${catalogRoot}`);
  if (!existsSync(joinPath)) throw new Error(`join file not found: ${joinPath}`);

  const join_: JoinFile = JSON.parse(readFileSync(joinPath, 'utf8'));

  const ctx: BuildContext = {
    projectRoot,
    scraperRoot,
    catalogRoot,
    vendor,
    warnings: [],
  };

  const products: NormalizedProduct[] = [];
  let withLocalImages = 0;
  let withPlaceholder = 0;
  let totalImages = 0;
  const collectionDistribution: Record<string, number> = {};

  for (const entry of join_.products) {
    const result = buildOneProduct(entry, ctx);
    if (!result) continue;
    validate(result.product, ctx.warnings);
    products.push(result.product);
    if (result.hasLocalImages) {
      withLocalImages++;
      totalImages += result.imageCount;
    } else {
      withPlaceholder++;
    }
    for (const ch of result.product.collectionHandles) {
      collectionDistribution[ch] = (collectionDistribution[ch] ?? 0) + 1;
    }
  }

  // Manual orphans.
  if (opts.includeManualOrphans) {
    let synthetic = 90_000_000;
    for (const folder of MANUAL_ORPHAN_FOLDERS) {
      const dir = join(catalogRoot, folder);
      if (!existsSync(dir)) {
        ctx.warnings.push(`manual_orphan_folder_missing: ${folder}`);
        continue;
      }
      const stub = buildOrphanStub(folder, ctx, synthetic++);
      validate(stub.product, ctx.warnings);
      products.push(stub.product);
      if (stub.hasLocalImages) {
        withLocalImages++;
        totalImages += stub.imageCount;
      } else {
        withPlaceholder++;
      }
    }
  } else {
    for (const folder of MANUAL_ORPHAN_FOLDERS) {
      ctx.warnings.push(`manual_entry_needed: ${folder}`);
    }
  }

  // Write output.
  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const payload = {
    _generated: new Date().toISOString(),
    _source: 'build-from-scraper',
    _count: products.length,
    products,
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  return {
    productsEmitted: products.length,
    productsWithLocalImages: withLocalImages,
    productsWithPlaceholderImages: withPlaceholder,
    totalLocalImagesReferenced: totalImages,
    collectionDistribution,
    warnings: ctx.warnings,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): BuildOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i < 0) return undefined;
    return argv[i + 1];
  };
  const scraperRoot = get('--scraper-root');
  const catalogRoot = get('--catalog-root');
  const joinPath = get('--join');
  const outputPath = get('--output');
  if (!scraperRoot || !catalogRoot || !joinPath || !outputPath) {
    throw new Error(
      'Usage: build-from-scraper.ts --scraper-root <dir> --catalog-root <dir> --join <file> --output <file> [--include-manual-orphans] [--vendor <name>]',
    );
  }
  const vendor = get('--vendor');
  const includeManualOrphans = argv.includes('--include-manual-orphans');
  const opts: BuildOptions = {
    scraperRoot,
    catalogRoot,
    joinPath,
    outputPath,
    includeManualOrphans,
  };
  if (vendor) opts.vendor = vendor;
  return opts;
}

function isMainModule(): boolean {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    const here = fileURLToPath(import.meta.url);
    return resolve(here) === resolve(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const opts = parseArgs(process.argv.slice(2));
  buildFromScraper(opts)
    .then((report) => {
      console.log('=== build-from-scraper report ===');
      console.log(JSON.stringify(report, null, 2));
      console.log(`wrote ${opts.outputPath}`);
    })
    .catch((err) => {
      console.error('[build-from-scraper] FAILED:', err.message);
      process.exit(1);
    });
}
