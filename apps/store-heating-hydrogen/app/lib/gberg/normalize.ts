/**
 * Display-time normalisation helpers.
 *
 * Track B (April 2026): the catalog's `color` field is inconsistent —
 *   `weiss`, `weiß`, `Weiß`, `white` all mean the same thing. Same for
 *   the various forms of black, anthracite, and chrome.
 *
 * Source code is English-only. Shopify Translate & Adapt provides any
 * non-English rendering at the platform layer.
 */

const COLOR_ALIASES: Record<string, string> = {
  weiss: 'White',
  'weiß': 'White',
  white: 'White',
  schwarz: 'Black',
  black: 'Black',
  anthrazit: 'Anthracite',
  anthracite: 'Anthracite',
  anthrazi: 'Anthracite', // catalog typo (Twister Elektrisch folder)
  chrom: 'Chrome',
  chrome: 'Chrome',
  silber: 'Silver',
  silver: 'Silver',
  grau: 'Grey',
  grey: 'Grey',
  gray: 'Grey',
  rot: 'Red',
  red: 'Red',
};

/**
 * Normalize any of the variant casings (`weiss`, `weiß`, `Weiß`, `white`,
 * `WHITE`, etc.) to the canonical English display form.
 *
 * Returns the input title-cased if no alias matches — keeps unknown colors
 * (custom finishes, exotic colorways) renderable.
 */
export function normalizeColor(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const alias = COLOR_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Kept for source-compatibility with existing call sites. Always returns
 * the English label — locale arg is ignored.
 */
export function normalizeColorForLocale(
  raw: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _locale: string,
): string {
  return normalizeColor(raw);
}
