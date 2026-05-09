import type {I18nBase} from '@shopify/hydrogen';
import {localeToInContext, normalizeLocale} from './gberg/i18n';

export interface I18nLocale extends I18nBase {
  pathPrefix: string;
}

/**
 * Map the first URL path segment (`/de/...`, `/nl/...`, `/fr/...`, or
 * unprefixed `/`) to the i18n context Hydrogen feeds into every Storefront
 * API call's `@inContext` directive.
 *
 * Was previously matching only `EN-DE`-style prefixes and falling back to
 * `EN-US` for everything else — silently breaking translations for `/de`,
 * `/nl`, `/fr` (Shopify returned the EN/US copy regardless of toggle) and
 * misrouting Markets pricing. Routing through `localeToInContext` keeps
 * the auto-injected header/footer/cart queries aligned with the explicit
 * `localeToContext` map used by PDP/PLP loaders.
 */
export function getLocaleFromRequest(request: Request): I18nLocale {
  const url = new URL(request.url);
  const firstPart = url.pathname.split('/')[1] ?? '';
  const locale = normalizeLocale(firstPart);
  const hint = localeToInContext(locale);
  const pathPrefix = locale === 'en' ? '' : `/${locale}`;
  return {
    language: hint.language as I18nLocale['language'],
    country: hint.country as I18nLocale['country'],
    pathPrefix,
  };
}
