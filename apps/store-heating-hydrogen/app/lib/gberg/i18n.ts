/**
 * Minimal i18n primitives for the Hydrogen storefront. The Next.js port
 * carried a full `useTranslations` t() function backed by JSON dictionaries,
 * but the storefront is currently English-only and no component calls t().
 * We keep just the locale primitives here to drive `($locale)` route
 * normalization, hreflang emission, and Storefront-API context selection.
 *
 * If/when DE/NL/FR are restored, expose `useTranslations(locale)` again here.
 */

export const SUPPORTED_LOCALES = ['en', 'de', 'nl', 'fr', 'es', 'it', 'pl', 'da'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Two-letter code shown on the toggle button.
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'EN',
  de: 'DE',
  nl: 'NL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
  da: 'DA',
};

// Endonym (the language's own name) shown in the dropdown so users
// self-identify their language without needing to know the code.
export const LOCALE_NAME: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  nl: 'Nederlands',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pl: 'Polski',
  da: 'Dansk',
};

export const DEFAULT_LOCALE: Locale = 'en';
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
  country: 'DE' | 'NL' | 'BE' | 'LU' | 'AT' | 'FR' | 'ES' | 'IT' | 'PL' | 'DK';
  language: 'EN' | 'DE' | 'NL' | 'FR' | 'ES' | 'IT' | 'PL' | 'DA';
}

const LOCALE_TO_LANGUAGE: Record<Locale, InContextHint['language']> = {
  en: 'EN',
  de: 'DE',
  nl: 'NL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
  da: 'DA',
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
export const LOCALE_TO_COUNTRY: Record<Locale, InContextHint['country']> = {
  en: 'DE',
  de: 'DE',
  nl: 'NL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
  da: 'DK',
};

export function localeToInContext(locale: Locale): InContextHint {
  return {
    country: LOCALE_TO_COUNTRY[locale] ?? 'DE',
    language: LOCALE_TO_LANGUAGE[locale] ?? 'EN',
  };
}
