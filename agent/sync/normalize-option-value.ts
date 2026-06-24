/**
 * Shared option-value sanitizer for the catalog-sync pipeline.
 *
 * xxl-heizung bakes availability phrases straight into variant titles /
 * option values (e.g. "50 x 180 nicht Vorrätig"). Left untouched, those
 * strings become our Shopify option VALUES verbatim — and because the phrase
 * is part of the source value itself (not a translation), it then leaks in
 * EVERY storefront locale (DE/EN/NL/FR) regardless of @inContext. Real stock
 * state is carried by `availableForSale`, never by the value label, so the
 * phrase is dropped here, not translated.
 *
 * Also canonicalizes the numeric dimension separator so "50 x 180" and
 * "50 × 180" cannot survive as two distinct option values / variants.
 *
 * NOTE: the catalog-driven builder (agent/scripts/build-catalog-driven-products.mjs,
 * a plain .mjs that cannot import this .ts at runtime) keeps an inline copy of
 * the same rules in its normalizeSize(); keep the two in sync.
 */

// Trailing availability / free-text markers (DE + EN), optionally preceded by a
// separating "," "-" "–" "—" "/" or "(". Case-insensitive, umlaut-aware. Covers
// hard out-of-stock ("nicht Vorrätig") AND future-availability notes
// ("Lieferbar ab KW 21", "available from …") — both leak verbatim otherwise.
const AVAILABILITY_SUFFIX_RE =
  /\s*[-–—,(/]*\s*(?:nicht\s*vorr(?:ä|ae)tig|nicht\s*verf(?:ü|ue)gbar|nicht\s*lieferbar|lieferbar\s*(?:ab|in)[^,;)]*|lieferzeit[^,;)]*|ausverkauft|vergriffen|auf\s*anfrage|demn(?:ä|ae)chst|out\s*of\s*stock|sold\s*out|not\s*in\s*stock|available\s*from[^,;)]*)\s*\)?\s*$/i;

/** Canonicalize one option/variant value string. Safe for non-dimension values. */
export function normalizeOptionValue(raw: string): string {
  if (raw == null) return raw;
  let s = String(raw)
    // 1. Drop a baked-in availability marker — stock state lives in availableForSale.
    .replace(AVAILABILITY_SUFFIX_RE, '')
    // 2. Collapse whitespace and trim (before separator canonicalization).
    .replace(/\s+/g, ' ')
    .trim();
  // 3. Canonicalize the dimension separator: "50 x 180"/"50×180" → "50 × 180".
  //    Anchored on digits both sides so thread codes like "2x M22" are untouched.
  s = s.replace(/(\d)\s*[xX×]\s*(\d)/g, '$1 × $2');
  // 4. A comma between two multi-digit numbers is a stray dimension separator
  //    (live-data artifact, e.g. "60, 180"). Anchored + ≥2 digits each so true
  //    decimals like "1,5 m" are left alone.
  s = s.replace(/^(\d{2,4})\s*,\s*(\d{2,4})(\s*(?:mm|cm))?$/i, '$1 × $2$3');
  return s.trim();
}
