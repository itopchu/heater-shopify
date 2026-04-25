/**
 * Pure parsers that extract structured data from xxl-heizung body_html.
 * Pure: input → output, no I/O, no Shopify API calls. Easy to unit-test.
 *
 * The xxl body_html uses a small set of conventions:
 *   - <table> with header + key/value rows  → spec table
 *   - <dl><dt>question</dt><dd>answer</dd>  → FAQ entries
 *   - <h2|h3>Lieferumfang</h2> followed by <ul><li>...</li></ul>  → delivery contents
 *   - Plain <p> when the rest is empty (most thin products)
 *
 * Variant dimensions come from the xxl variants array, NOT from body_html.
 * `parseVariantDimensions` lives here for symmetry.
 */

import type { XxlVariant } from './types.js';

// ---------------------------------------------------------------------------
// HTML helpers (no DOM lib — small focused regex set)
// ---------------------------------------------------------------------------

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function findAll(html: string, openTag: string, closeTag: string): string[] {
  const re = new RegExp(`<${openTag}\\b[^>]*>([\\s\\S]*?)</${closeTag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]!);
  return out;
}

// ---------------------------------------------------------------------------
// 1. Spec table
// ---------------------------------------------------------------------------

export interface ParsedSpecs {
  color?: string;
  material?: string;
  thread_size?: string;
  connection_options?: string;
  certifications?: string[];
  /** Anything not recognised — preserved key/value for the merchant to see in Admin */
  extra: Record<string, string>;
}

const SPEC_KEY_MAP: Record<string, keyof ParsedSpecs> = {
  farbe: 'color',
  color: 'color',
  material: 'material',
  werkstoff: 'material',
  gewinde: 'thread_size',
  'gewinde anschluss': 'thread_size',
  anschluss: 'connection_options',
  anschlussart: 'connection_options',
  zertifizierung: 'certifications',
  zertifikat: 'certifications',
  norm: 'certifications',
  'din norm': 'certifications',
};

function normalizeKey(s: string): string {
  return stripTags(s).toLowerCase().replace(/[^a-zäöüß ]/g, '').trim();
}

export function parseSpecTable(html: string): ParsedSpecs | null {
  if (!html) return null;
  const tables = findAll(html, 'table', 'table');
  if (tables.length === 0) return null;

  const out: ParsedSpecs = { extra: {} };
  let foundAny = false;

  for (const table of tables) {
    const rows = findAll(table, 'tr', 'tr');
    for (const row of rows) {
      const cells: string[] = [];
      const cellRe = /<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(row)) !== null) cells.push(stripTags(cm[2]!));
      if (cells.length < 2) continue;
      // Skip header rows: ['Merkmal','Wert'] etc.
      const k = normalizeKey(cells[0]!);
      const v = cells[1]!.trim();
      if (!v || k === 'merkmal' || k === 'feature' || k === 'wert' || k === 'value') continue;

      const mapped = SPEC_KEY_MAP[k];
      if (mapped === 'certifications') {
        out.certifications ??= [];
        out.certifications.push(v);
      } else if (mapped) {
        (out as Record<string, unknown>)[mapped] = v;
      } else {
        out.extra[cells[0]!.trim()] = v;
      }
      foundAny = true;
    }
  }
  return foundAny ? out : null;
}

// ---------------------------------------------------------------------------
// 2. FAQ pairs
// ---------------------------------------------------------------------------

export interface ParsedFaq {
  question: string;
  answer: string;
}

export function parseFaqs(html: string): ParsedFaq[] {
  if (!html) return [];
  const out: ParsedFaq[] = [];
  for (const dl of findAll(html, 'dl', 'dl')) {
    const re = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(dl)) !== null) {
      const q = stripTags(m[1]!);
      const a = stripTags(m[2]!);
      if (q && a) out.push({ question: q, answer: a });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Delivery contents (Lieferumfang)
// ---------------------------------------------------------------------------

// Sprint 3: extended to cover all German label variants. Previously only ~10/55
// products parsed because xxl uses heterogeneous wording across categories.
// Patterns now covered:
//   "Lieferumfang"
//   "Im Lieferumfang"
//   "Im Lieferumfang enthalten"
//   "Inklusive" / "Inkl."
//   "Mitgeliefert"
//   "Im Karton"
//   "Im Set enthalten"
//   "Delivery contents" / "What is included" (EN fallback)
const DELIVERY_HEADINGS =
  /(im\s*lieferumfang(\s+enthalten)?|lieferumfang|inklusive|inkl\.|mitgeliefert|im\s*karton|im\s*set(\s+enthalten)?|delivery\s*contents|what\s+is\s+included)/i;

function extractListItems(ulInner: string): string[] {
  const items: string[] = [];
  const li = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = li.exec(ulInner)) !== null) {
    const text = stripTags(lm[1]!);
    if (text) items.push(text);
  }
  return items;
}

/** Split a comma / semicolon / "und" separated inline list into items. */
function splitInlineList(s: string): string[] {
  return s
    .split(/\s*(?:,|;|·|•|\bund\b|\bund\s+je\b|\sand\s)\s*/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length < 200);
}

export function parseDeliveryContents(html: string): string[] {
  if (!html) return [];

  // Strategy 1 — heading (<h1>..<h6>) followed by a <ul>.
  // Allow up to ~3000 chars of intervening markup (xxl wraps in deeply nested
  // Elementor divs). Iterate all heading→ul pairs and pick the first whose
  // heading matches one of our German/English label patterns.
  {
    const re = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]{0,3000}?)<ul\b[^>]*>([\s\S]*?)<\/ul>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const heading = stripTags(m[1]!);
      if (!DELIVERY_HEADINGS.test(heading)) continue;
      const items = extractListItems(m[3]!);
      if (items.length > 0) return items;
    }
  }

  // Strategy 2 — bold-prefixed inline label followed by a <ul>:
  //   <p><strong>Lieferumfang:</strong></p><ul>...</ul>
  //   <p><b>Im Lieferumfang enthalten</b></p><ul>...</ul>
  {
    const re = /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>([\s\S]{0,2000}?)<ul\b[^>]*>([\s\S]*?)<\/ul>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const label = stripTags(m[1]!);
      if (!DELIVERY_HEADINGS.test(label)) continue;
      const items = extractListItems(m[3]!);
      if (items.length > 0) return items;
    }
  }

  // Strategy 3 — bold-prefixed inline list (no <ul>):
  //   <p><strong>Lieferumfang:</strong> Heizkörper, Halterungen, Schrauben, Entlüftungsventil</p>
  //   <p><b>Im Karton:</b> 1x Thermostatkopf, 2x Adapter, Bedienungsanleitung</p>
  {
    const re = /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*:?\s*([^<]{8,800})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const label = stripTags(m[1]!);
      if (!DELIVERY_HEADINGS.test(label)) continue;
      const tail = stripTags(m[2]!).replace(/^[:\-–—\s]+/, '');
      const items = splitInlineList(tail);
      if (items.length >= 2) return items;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// 4. Grundpreis (price-per-unit) — German legal requirement for some categories
// ---------------------------------------------------------------------------

export interface Grundpreis {
  value: number;
  unit: string;
}

const GRUNDPREIS_RE = /(\d+[,.]\d+)\s*€?\s*\/\s*(m²|m2|m|kg|stück|stueck|w|kwh)/i;

export function extractGrundpreis(html: string): Grundpreis | null {
  if (!html) return null;
  const m = html.match(GRUNDPREIS_RE);
  if (!m) return null;
  const value = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = m[2]!.toLowerCase().replace(/m2/, 'm²').replace(/stueck/, 'Stück').replace(/^w$/, 'W');
  return { value, unit };
}

// ---------------------------------------------------------------------------
// 5. Variant dimensions (from xxl variants array, not body_html)
// ---------------------------------------------------------------------------

export interface ParsedDimension {
  watts?: number;
  width_cm?: number;
  height_cm?: number;
  center_distance_mm?: number;
  price: string;
  sku?: string;
  variantTitle: string;
}

const DIM_RE = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i;
const WATT_RE = /(\d+(?:[.,]\d+)?)\s*W(?:att)?\b/i;
const NABEN_RE = /(\d+)\s*mm/i;

function asNumber(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function parseVariantDimensions(
  variants: ReadonlyArray<XxlVariant>,
  options: ReadonlyArray<{ name: string; position: number }>,
): ParsedDimension[] {
  const out: ParsedDimension[] = [];
  // skip products whose only option is the placeholder "Title"
  if (options.length === 1 && options[0]!.name.toLowerCase() === 'title') return out;

  for (const v of variants) {
    const dim: ParsedDimension = { price: v.price, variantTitle: v.title };
    if (v.sku) dim.sku = v.sku;

    for (const opt of [v.option1, v.option2, v.option3]) {
      if (!opt) continue;
      const dimMatch = opt.match(DIM_RE);
      if (dimMatch) {
        dim.width_cm = asNumber(dimMatch[1]);
        dim.height_cm = asNumber(dimMatch[2]);
      }
      const wattMatch = opt.match(WATT_RE);
      if (wattMatch) dim.watts = asNumber(wattMatch[1]);
      const nabenMatch = opt.match(NABEN_RE);
      if (nabenMatch) {
        const nb = Number(nabenMatch[1]);
        if (Number.isFinite(nb)) dim.center_distance_mm = nb;
      }
    }
    if (dim.watts !== undefined || dim.width_cm !== undefined || dim.center_distance_mm !== undefined) {
      out.push(dim);
    }
  }
  return out;
}
