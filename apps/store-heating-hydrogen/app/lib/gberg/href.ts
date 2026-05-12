/**
 * Locale-aware href helper. Mirrors apps/store-heating/lib/href.ts.
 *
 * The default locale (EN) is served unprefixed — the homepage is `/`, not
 * `/en/`. Other locales are prefixed: `/de`, `/nl/cart`, … . This helper
 * centralises that so individual links don't have to special-case it.
 *
 *   localeHref('en', '/')        → '/'
 *   localeHref('en', '/cart')    → '/cart'
 *   localeHref('de', '/')        → '/de'        (no trailing slash)
 *   localeHref('de', '/cart')    → '/de/cart'
 *   localeHref('de', '/de/cart') → '/de/cart'   (not double-prefixed)
 *   localeHref('de', 'https://…')→ 'https://…'  (passthrough)
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
