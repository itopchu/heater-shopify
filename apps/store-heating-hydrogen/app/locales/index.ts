/**
 * Locale dictionaries for the G-Berg Hydrogen storefront.
 *
 * This module is the single import surface the next-pass `t()` /
 * `useT()` helper in `app/lib/gberg/i18n.ts` will use to resolve
 * translation keys at render time. The dictionaries themselves are
 * hand-curated JSON (the user explicitly opted out of Shopify
 * Translate & Adapt for UI copy — see project memory
 * `project_translation_strategy.md` and the i18n integration sketch
 * in `docs/i18n/integration-sketch.md`).
 *
 * The `Dict` type is intentionally loose for now (`Record<string,
 * Record<string, string>>`); the wiring pass will replace it with a
 * generated keyof-union type so `t('pdp.add_to_cart')` is checked at
 * compile time. Loose typing here means the JSON files can land
 * before the helper, without TS complaining about untyped imports.
 */
import enJson from './en.json';
import deJson from './de.json';
import nlJson from './nl.json';
import frJson from './fr.json';

import type {Locale} from '~/lib/gberg/i18n';

/**
 * Loose dict shape — every locale is a 2-level nested object of
 * namespace → key → English/translated string. The wiring pass will
 * tighten this to a generated `keyof typeof enJson` union type.
 */
export type Dict = Record<string, Record<string, string>>;

export const LOCALE_DICT: Record<Locale, Dict> = {
  en: enJson as Dict,
  de: deJson as Dict,
  nl: nlJson as Dict,
  fr: frJson as Dict,
};

/**
 * The English dictionary, exposed separately so the fallback chain
 * (`active locale → en → key string`) can resolve missing keys at
 * runtime without re-loading the JSON.
 */
export const FALLBACK_DICT: Dict = enJson as Dict;
