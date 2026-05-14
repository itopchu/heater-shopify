import type {Route} from './+types/sitemap.$type.$page[.xml]';
import {getSitemap} from '@shopify/hydrogen';

/**
 * Locales emitted into Shopify's sitemap as hreflang alternates. Format
 * is `${language}-${country}` per Shopify's getSitemap() contract.
 *
 * Our URL prefix on the storefront is the bare 2-letter language code
 * (`/de/...`), which is what we re-emit in `getLink` below — the
 * `language-country` form here is only used to populate the
 * `<xhtml:link rel="alternate" hreflang>` entries inside the sitemap so
 * Google can correlate locale pairs.
 *
 * Only the locales with real Translate & Adapt content ship here — see
 * SUPPORTED_LOCALES in lib/gberg/i18n.ts (EN/DE/NL/FR). Advertising an
 * hreflang alternate that resolves to an untranslated (or 404) page is a
 * Search Console error, so this list must stay in lockstep with the
 * locales the storefront actually serves. Country pairs follow
 * LOCALE_TO_COUNTRY: en→DE, de→DE, nl→NL, fr→BE.
 */
const SITEMAP_LOCALES = ['EN-DE', 'DE-DE', 'NL-NL', 'FR-BE'];

export async function loader({
  request,
  params,
  context: {storefront},
}: Route.LoaderArgs) {
  const response = await getSitemap({
    storefront,
    request,
    params,
    locales: SITEMAP_LOCALES,
    getLink: ({type, baseUrl, handle, locale}) => {
      if (!locale) return `${baseUrl}/${type}/${handle}`;
      // Drop the `-COUNTRY` suffix and lowercase to match our route shape:
      // EN-DE → en, DE-DE → de, NL-NL → nl, etc.
      const lang = locale.split('-')[0]!.toLowerCase();
      return `${baseUrl}/${lang}/${type}/${handle}`;
    },
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return response;
}
