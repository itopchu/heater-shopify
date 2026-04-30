import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {isSupportedLocale} from '~/lib/gberg/i18n';

/**
 * Parent layout for the optional ($locale) segment.
 *
 * The skeleton's default rejects any locale that doesn't match
 * `${language}-${country}` (e.g. `EN-US`). G-Berg uses simple 2-letter
 * locale prefixes (`/en`) for hreflang continuity with the prior Next.js
 * storefront, so we accept either:
 *   - undefined (no prefix → /), or
 *   - a value in SUPPORTED_LOCALES (currently just "en")
 *
 * Anything else 404s.
 */
export async function loader({params}: LoaderFunctionArgs) {
  if (params.locale && !isSupportedLocale(params.locale)) {
    throw new Response(null, {status: 404});
  }
  return null;
}
