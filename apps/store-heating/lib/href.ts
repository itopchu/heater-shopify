/**
 * Locale-aware href helper.
 *
 * Every internal link in the storefront must include the active `[locale]`
 * prefix. Centralising this in one helper means contributors don't have to
 * remember to interpolate `${locale}` everywhere — and the typecheck-able
 * call site catches forgotten prefixes during review.
 *
 * Rules:
 *   - Absolute URLs (`https://…`, `mailto:`, `tel:`, `#fragment`) pass through.
 *   - Paths already starting with `/${locale}/` pass through unchanged.
 *   - Otherwise the path is prefixed with `/${locale}`. A leading `/` is
 *     normalised so callers can pass either `collections/foo` or
 *     `/collections/foo`.
 */
export function localeHref(locale: string, path: string): string {
  if (!path) return `/${locale}`;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("mailto:") ||
    path.startsWith("tel:") ||
    path.startsWith("#")
  ) {
    return path;
  }
  // Already locale-prefixed.
  const localePrefix = `/${locale}/`;
  if (path === `/${locale}` || path.startsWith(localePrefix)) return path;
  // Normalise — accept "foo" or "/foo".
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${cleaned}`;
}
