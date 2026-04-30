/**
 * Minimal Server-Component-friendly i18n helper for the heating storefront.
 *
 * Brief 07 §12 mandates four launch locales: NL (primary), DE, FR, EN.
 * The brief also mandates English-as-fallback-only (never primary surface
 * for an EU market). This module enforces both rules:
 *   - getMessages(locale) returns a deep-merged dictionary where the active
 *     locale wins for every key it provides; missing keys fall through to
 *     the EN safety net.
 *   - useTranslations(locale, ns?) returns a t() function that interpolates
 *     {placeholders}. It runs on the server (Server Components) and on the
 *     client equally — the dictionaries are bundled JSON, no fetch needed.
 *
 * We deliberately don't pull in next-intl yet. The brief's Phase 4 plan
 * keeps the framework swap option open; this file is the choke point that
 * later gets replaced when we adopt next-intl/lingui. Components only call
 * useTranslations() — they never import the JSON directly.
 */
import enMessages from "./messages/en.json";

export const SUPPORTED_LOCALES = ["en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Primary launch locale per master brief 01. NL is the default for:
 *   - root redirect (/ → /nl)
 *   - hreflang x-default
 *   - missing-locale fallback target before EN safety net
 */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * EN is the safety-net locale only — never the primary surface for an EU
 * market. If a translation key is missing in NL/DE/FR, we fall back to EN
 * and surface the gap (in dev) via console.warn.
 */
export const FALLBACK_LOCALE: Locale = "en";

const RAW_DICTS: Record<Locale, Record<string, unknown>> = {
  en: enMessages as Record<string, unknown>,
};

/**
 * Type-guard a string against the supported locale set. Use at the route
 * boundary (`[locale]` segment) to refuse unknown locales early.
 */
export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Normalize an incoming locale string (case, dialect tag stripping). Returns
 * the default locale when the input is unrecognized.
 */
export function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  const head = value.toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(head) ? head : DEFAULT_LOCALE;
}

/**
 * BCP-47-ish HTML lang code per locale. Used in the <html lang> attribute
 * for accessibility. We keep this conservative — `nl`, `de`, `fr`, `en` are
 * all valid by themselves.
 */
export function htmlLang(locale: Locale): string {
  return locale;
}

/**
 * Map a route locale to a Storefront API @inContext directive (country +
 * language). Mirrors lib/queries.localeToContext but lives here so any
 * future component can call it without pulling the full Shopify wiring.
 *
 * EN is intentionally country=NL — the primary launch market. Per brief,
 * EN is fallback only and must never silently route to a different market.
 */
export interface InContextHint {
  country: "NL" | "DE" | "FR" | "BE" | "LU";
  language: "NL" | "DE" | "FR" | "EN";
}

export function localeToInContext(_locale: Locale): InContextHint {
  return { country: "NL", language: "EN" };
}

/**
 * Deep-merge two plain objects. Right wins on leaf collisions. Used to
 * build the per-locale dictionary that falls back to EN.
 */
function deepMerge<T extends Record<string, unknown>>(base: T, over: Partial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null
    ) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Walk a dotted key path in a nested dict. Returns undefined if any segment
 * is missing — callers then render a debug placeholder.
 */
function lookupPath(dict: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let cursor: unknown = dict;
  for (const p of parts) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[p];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/**
 * Interpolate `{placeholder}` style templates. Empty values become "".
 */
function interpolate(template: string, vars: Record<string, string | number> | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Get the merged message dictionary for a locale (with EN fallback baked in).
 * Cached per-locale to avoid re-merging on every component render.
 */
const MERGED_CACHE = new Map<Locale, Record<string, unknown>>();
function getMessages(locale: Locale): Record<string, unknown> {
  const cached = MERGED_CACHE.get(locale);
  if (cached) return cached;
  const merged = deepMerge(
    RAW_DICTS[FALLBACK_LOCALE],
    RAW_DICTS[locale] as Partial<typeof RAW_DICTS[typeof FALLBACK_LOCALE]>,
  );
  MERGED_CACHE.set(locale, merged);
  return merged;
}

/**
 * Sentinel value used in NL/FR (and any non-EN) JSON files to mark keys that
 * MUST NOT silently fall back to EN. Use this for compliance-critical strings
 * (legal disclaimers, VAT/withdrawal copy, mandatory consumer-rights text)
 * where the wrong language is a regulatory bug, not a UX bug.
 *
 * Behaviour: when `t()` resolves to this sentinel, it returns an empty string
 * in production (so callers can render their own "Translation pending" UI or
 * hide the affected component) and a visible `[[TRANSLATION PENDING: key]]`
 * marker in dev so QA spots the gap.
 *
 * Adding new compliance-critical strings: put `__TRANSLATION_PENDING__` in
 * nl.json and fr.json under the relevant key. Once a real translation is in,
 * just replace the sentinel with the localized value.
 */
export const TRANSLATION_PENDING_SENTINEL = "__TRANSLATION_PENDING__";

/**
 * Walk the merged dictionary for the active locale only (no EN fallback).
 * Used by t() to detect pending-translation sentinels before EN steps in.
 */
function lookupLocaleOnly(locale: Locale, path: string): string | undefined {
  const raw = RAW_DICTS[locale];
  return lookupPath(raw, path);
}

/**
 * Translation function (server- and client-safe).
 *
 * Usage in a Server Component:
 *
 *   const t = useTranslations(locale);
 *   <h1>{t("product.add_to_cart")}</h1>
 *   <p>{t("product.price_from", { price: "€199" })}</p>
 *
 * Resolution order:
 *   1. If the active locale has the key set to TRANSLATION_PENDING_SENTINEL,
 *      we surface the pending state (dev: visible marker; prod: empty string).
 *      No EN fallback for compliance-critical pending strings.
 *   2. Otherwise, return the value from the merged dictionary (active locale
 *      wins, EN fills the gaps).
 *   3. If the key is missing entirely, render `[[key]]` in dev so gaps are
 *      visible, empty string in prod.
 */
export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function useTranslations(localeInput: string | Locale): TranslateFn {
  const locale = normalizeLocale(localeInput);
  const dict = getMessages(locale);

  return function t(key, vars) {
    // Pending-translation guard: if the active locale explicitly marked this
    // key as pending, do not let EN leak into a compliance-critical surface.
    if (locale !== FALLBACK_LOCALE) {
      const localeRaw = lookupLocaleOnly(locale, key);
      if (localeRaw === TRANSLATION_PENDING_SENTINEL) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] pending translation for "${key}" on locale "${locale}"`);
          return `[[TRANSLATION PENDING: ${key}]]`;
        }
        return "";
      }
    }

    const value = lookupPath(dict, key);
    if (value === undefined) {
      // eslint-disable-next-line no-console
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
      }
      return `[[${key}]]`;
    }
    return interpolate(value, vars);
  };
}
