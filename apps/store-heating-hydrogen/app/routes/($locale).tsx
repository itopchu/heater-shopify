import type {LoaderFunctionArgs} from 'react-router';
import {isSupportedLocale} from '~/lib/gberg/i18n';

/**
 * Parent layout for the optional ($locale) segment.
 *
 * The skeleton's default rejects any locale that doesn't match
 * `${language}-${country}` (e.g. `EN-US`). G-Berg uses simple 2-letter
 * locale prefixes (`/en`, `/nl`, `/fr`) for hreflang continuity with the
 * prior Next.js storefront, so we accept either:
 *   - undefined (no prefix → /, which serves DEFAULT_LOCALE = German), or
 *   - a value in SUPPORTED_LOCALES (en, de, nl, fr)
 *
 * Anything else 404s.
 */
export async function loader({params}: LoaderFunctionArgs) {
  if (params.locale && !isSupportedLocale(params.locale)) {
    throw new Response(null, {status: 404});
  }
  return null;
}
