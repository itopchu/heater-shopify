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
  country: 'NL' | 'DE' | 'FR' | 'BE' | 'LU' | 'ES' | 'IT' | 'PL' | 'DK';
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

export function localeToInContext(locale: Locale): InContextHint {
  // Single Europe market for now (country=NL); language hint flips by locale
  // so Shopify's Translate & Adapt layer serves translated strings via
  // @inContext directives in Storefront API queries.
  return {country: 'NL', language: LOCALE_TO_LANGUAGE[locale] ?? 'EN'};
}
