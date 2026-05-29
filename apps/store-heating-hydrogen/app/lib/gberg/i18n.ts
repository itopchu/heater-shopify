/**
 * Minimal i18n primitives for the Hydrogen storefront. The Next.js port
 * carried a full `useTranslations` t() function backed by JSON dictionaries,
 * but the storefront is currently English-only and no component calls t().
 * We keep just the locale primitives here to drive `($locale)` route
 * normalization, hreflang emission, and Storefront-API context selection.
 *
 * If/when DE/NL/FR are restored, expose `useTranslations(locale)` again here.
 */

// Policy 2026-05: storefront ships to DE/NL/BE/LU only — those four markets
// share three native languages (DE, NL, FR) plus EN as the international
// default. Locales outside this set were retired so the language picker
// only offers what we can actually fulfil.
export const SUPPORTED_LOCALES = ['en', 'de', 'nl', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Two-letter code shown on the toggle button.
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'EN',
  de: 'DE',
  nl: 'NL',
  fr: 'FR',
};

// Endonym (the language's own name) shown in the dropdown so users
// self-identify their language without needing to know the code.
export const LOCALE_NAME: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  nl: 'Nederlands',
  fr: 'Français',
};

// Storefront default browsing language. The unprefixed root (`/`,
// `/products/…`) renders in this locale; every other locale is path-prefixed
// (`/en`, `/nl`, `/fr`). Flipped EN→DE 2026-05-29: Germany is the company's
// home market and the largest EU heating market, so German is the language a
// first-time visitor sees by default. English is still reachable at `/en`.
export const DEFAULT_LOCALE: Locale = 'de';
// Ultimate content fallback for missing translations. Stays EN because English
// remains the Shopify *source* language — catalog-sync writes EN, and DE/NL/FR
// are Translate & Adapt layers on top (see memory `project_translation_strategy`).
export const FALLBACK_LOCALE: Locale = 'en';

export function isSupportedLocale(
  value: string | undefined | null,
): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  const head = value.toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(head) ? head : DEFAULT_LOCALE;
}

export function htmlLang(locale: Locale): string {
  return locale;
}

export interface InContextHint {
  // Storefront ships to DE/NL/BE/LU. The Shopify Markets configuration is
  // the authoritative gate on checkout countries.
  country: 'DE' | 'NL' | 'BE' | 'LU';
  language: 'EN' | 'DE' | 'NL' | 'FR';
}

const LOCALE_TO_LANGUAGE: Record<Locale, InContextHint['language']> = {
  en: 'EN',
  de: 'DE',
  nl: 'NL',
  fr: 'FR',
};

/**
 * Locale → primary country mapping for Storefront API @inContext pricing.
 *
 * The storefront serves a single Shopify "Europe" market that covers
 * DE/NL/BE/LU/AT/FR/ES/IT/PL/DK. The country we send via @inContext drives
 * VAT rates and currency for every Storefront API query — so a German
 * shopper visiting `/de/...` MUST hit `country: DE` (19% VAT) and a Dutch
 * shopper `/nl/...` MUST hit `country: NL` (21% VAT). Previously we
 * hard-coded `country: NL` for every locale, which silently overcharged
 * non-Dutch shoppers by 2 percentage points. This map fixes that.
 *
 * `en` is our default home market and resolves to DE (largest EU heating
 * market and the company's home country). For locales that have no
 * dedicated country split (e.g. fr → could be FR or BE/LU), we pick the
 * largest single market for that language. A dedicated /be-fr or /be-nl
 * locale can be added later without changing this default.
 */
// Locale → primary country for @inContext pricing. We ship to DE/NL/BE/LU.
// French resolves to Belgium (Wallonia is the larger French-speaking market
// in our footprint than Luxembourg). EN defaults to DE as the largest market.
export const LOCALE_TO_COUNTRY: Record<Locale, InContextHint['country']> = {
  en: 'DE',
  de: 'DE',
  nl: 'NL',
  fr: 'BE',
};

export function localeToInContext(locale: Locale): InContextHint {
  return {
    country: LOCALE_TO_COUNTRY[locale] ?? 'DE',
    language: LOCALE_TO_LANGUAGE[locale] ?? 'EN',
  };
}

// ---------------------------------------------------------------------------
// t() / useT() — translation helpers
// ---------------------------------------------------------------------------
//
// Resolves a dotted key (e.g. `pdp.add_to_cart`) against the active locale's
// dictionary in `app/locales/<locale>.json`, with EN fallback and
// `{placeholder}` interpolation.
//
// Server contexts (loaders, meta() functions) call `tFor(locale)` directly
// with the locale extracted from `params.locale`. React components call the
// `useT()` hook, which derives the active locale from the route params.
// ---------------------------------------------------------------------------

import {useParams} from 'react-router';
import {LOCALE_DICT, FALLBACK_DICT} from '~/locales';

function resolveKey(dict: unknown, segments: string[]): string | undefined {
  let cursor: unknown = dict;
  for (const seg of segments) {
    if (cursor && typeof cursor === 'object' && seg in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

export function tFor(locale: Locale): TFunction {
  const dict = LOCALE_DICT[locale] ?? FALLBACK_DICT;
  return (key, vars) => {
    const segments = key.split('.');
    let resolved = resolveKey(dict, segments);
    if (resolved === undefined && dict !== FALLBACK_DICT) {
      resolved = resolveKey(FALLBACK_DICT, segments);
    }
    let out = resolved ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
    }
    return out;
  };
}

/**
 * React hook returning a `t()` bound to the active route locale.
 * Reads `params.locale` from the deepest matching route. Falls back to
 * `DEFAULT_LOCALE` if no `($locale)` param is present (e.g. on `/`).
 */
export function useT(): TFunction {
  const params = useParams();
  const raw = (params as {locale?: string}).locale;
  const locale: Locale = isSupportedLocale(raw) ? raw : DEFAULT_LOCALE;
  return tFor(locale);
}

/**
 * Locale-aware target for `<CartForm route={…}>`.
 *
 * Hydrogen's `CartForm` POSTs to the `route` URL and the cart action runs
 * under that URL's i18n context (via `getLocaleFromRequest`). The default
 * `route="/cart"` strips the locale prefix — so a customer on
 * `/de/products/...` would have their `cartCreate` fire at `/cart` under
 * `@inContext(language: EN)`, stamping the cart EN for life and producing
 * an English hosted-checkout regardless of the browsing locale.
 *
 * Routing the form to `/{locale}/cart` (e.g. `/de/cart`) keeps the cart's
 * stored language synchronised with the customer's chosen locale at
 * creation time, which Shopify reads when it stamps the
 * `/checkouts/cn/<token>/<lang>-<country>` path segment.
 */
export function useCartActionRoute(): string {
  const params = useParams();
  const raw = (params as {locale?: string}).locale;
  const locale: Locale = isSupportedLocale(raw) ? raw : DEFAULT_LOCALE;
  return locale === DEFAULT_LOCALE ? '/cart' : `/${locale}/cart`;
}
