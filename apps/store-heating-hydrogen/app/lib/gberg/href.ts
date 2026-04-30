/**
 * Locale-aware href helper. Mirrors apps/store-heating/lib/href.ts.
 * Centralises the `/${locale}/...` prefix so individual links don't have to
 * remember it.
 */
export function localeHref(locale: string, path: string): string {
  if (!path) return `/${locale}`;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('mailto:') ||
    path.startsWith('tel:') ||
    path.startsWith('#')
  ) {
    return path;
  }
  const localePrefix = `/${locale}/`;
  if (path === `/${locale}` || path.startsWith(localePrefix)) return path;
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${cleaned}`;
}
