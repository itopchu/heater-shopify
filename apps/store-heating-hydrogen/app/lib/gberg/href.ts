/**
 * Locale-aware href helper. Mirrors apps/store-heating/lib/href.ts.
 *
 * The default locale (DEFAULT_LOCALE = German) is served unprefixed — the
 * homepage is `/`, not `/de/`. Other locales are prefixed: `/en`, `/nl/cart`,
 * … . This helper centralises that so individual links don't special-case it.
 *
 *   localeHref('de', '/')        → '/'
 *   localeHref('de', '/cart')    → '/cart'
 *   localeHref('en', '/')        → '/en'        (no trailing slash)
 *   localeHref('en', '/cart')    → '/en/cart'
 *   localeHref('en', '/en/cart') → '/en/cart'   (not double-prefixed)
 *   localeHref('en', 'https://…')→ 'https://…'  (passthrough)
 */
import {DEFAULT_LOCALE} from '~/lib/gberg/i18n';

export function localeHref(locale: string, path: string): string {
  const isDefault = locale === DEFAULT_LOCALE;

  if (!path || path === '/') return isDefault ? '/' : `/${locale}`;

  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('mailto:') ||
    path.startsWith('tel:') ||
    path.startsWith('#')
  ) {
    return path;
  }

  const cleaned = path.startsWith('/') ? path : `/${path}`;
  if (isDefault) return cleaned;

  const localePrefix = `/${locale}/`;
  if (cleaned === `/${locale}` || cleaned.startsWith(localePrefix)) return cleaned;
  return `/${locale}${cleaned}`;
}
