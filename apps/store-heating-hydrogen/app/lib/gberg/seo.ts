/**
 * SEO helpers — canonical, hreflang, OG/Twitter card meta.
 *
 * The storefront serves the same content under `/`, `/en/...`, `/de/...`,
 * `/nl/...`, etc. Without canonical + hreflang every locale variant looks
 * like duplicate content to Google, and AI crawlers can't tell which URL
 * is the source of truth. These helpers emit:
 *
 *   - `<link rel="canonical">` — the primary URL for the current page in
 *     the current locale, always rooted at the production domain.
 *   - `<link rel="alternate" hreflang="...">` for every supported locale
 *     plus an `x-default` pointing at the EN version, which is also the
 *     fallback for unknown locales.
 *   - Standard OG + Twitter Card meta so SERP, social, Slack/WhatsApp
 *     unfurls and AI summary cards render with branded titles + images.
 *
 * All meta entries returned here use React Router's MetaDescriptor shape,
 * so they can be spread into the array returned by a route's `meta()`.
 */

import {SUPPORTED_LOCALES, type Locale} from './i18n';

/**
 * Minimal subset of React Router's `MetaArgs` we use across route
 * `meta()` exports. Project-wide we currently can't rely on the typed
 * `Route.MetaFunction` because the React Router typegen step stubs the
 * generated `+types/*` modules (see CI typecheck baseline). Routes
 * therefore type their meta function as `(args: MetaArgsLite<TLoader>)`
 * to keep `location` and `data` properly typed without depending on
 * the stubbed module.
 */
export interface MetaArgsLite<TLoaderData = unknown> {
  location: {pathname: string};
  data?: TLoaderData;
}

/**
 * Canonical primary domain. Phase 1 hardcodes the production domain; if
 * we ever serve preview URLs (e.g. *.workers.dev) we still want links and
 * social cards to point at the production canonical, not the preview.
 */
const PRIMARY_HOST = 'https://www.gberg-heizung.de';

/**
 * Brand suffix appended to all titles. This is the brand name itself,
 * not editable copy — see CLAUDE.md "merchant-editable" carve-out.
 */
export const BRAND_NAME = 'G-Berg Heizung';

/**
 * Default OG image. Phase 1 uses the favicon as a placeholder so unfurls
 * have *something* to render; Phase 4 will swap in a 1200×628 PNG
 * generated per-locale.
 */
// TODO(phase-4): replace with /og/default.png (1200×628 branded image).
const DEFAULT_OG_IMAGE = `${PRIMARY_HOST}/favicon.svg`;

/**
 * Strip the `/{locale}` prefix from a pathname and return the canonical
 * path that's identical across every locale. `/de/products/foo` → `/products/foo`.
 * `/products/foo` (already locale-less) → `/products/foo`. `/de` → `/`.
 *
 * The canonical pathname is what we re-prefix per locale to emit hreflang.
 */
function stripLocalePrefix(pathname: string): string {
  // Normalise: ensure leading slash, no trailing slash unless root.
  const cleaned = pathname.startsWith('/') ? pathname : `/${pathname}`;
  // Match `/xx` or `/xx/...` where xx is a supported locale.
  for (const loc of SUPPORTED_LOCALES) {
    if (cleaned === `/${loc}`) return '/';
    if (cleaned.startsWith(`/${loc}/`)) return cleaned.slice(loc.length + 1);
  }
  return cleaned;
}

/**
 * Detect which locale prefix the current pathname is using, if any.
 * Returns the locale string or null when the path has no locale prefix
 * (which the storefront treats as the default locale).
 */
export function detectLocaleFromPath(pathname: string): Locale | null {
  const cleaned = pathname.startsWith('/') ? pathname : `/${pathname}`;
  for (const loc of SUPPORTED_LOCALES) {
    if (cleaned === `/${loc}` || cleaned.startsWith(`/${loc}/`)) {
      return loc;
    }
  }
  return null;
}

/**
 * Build the canonical absolute URL for the current pathname. Always
 * uses the primary host, always preserves the locale segment so each
 * locale has its own canonical (Google treats each hreflang target as
 * its own indexed page).
 */
export function buildCanonical(pathname: string): string {
  const cleaned = pathname.startsWith('/') ? pathname : `/${pathname}`;
  // Drop trailing slash except for root, drop any query/hash.
  const noQuery = cleaned.split(/[?#]/)[0]!;
  const trimmed =
    noQuery.length > 1 && noQuery.endsWith('/')
      ? noQuery.slice(0, -1)
      : noQuery;
  return `${PRIMARY_HOST}${trimmed}`;
}

/**
 * Build the array of `<link rel="alternate" hreflang>` meta descriptors
 * for the current page, one per supported locale plus `x-default`.
 *
 * Pass the request pathname; the helper strips any existing locale
 * prefix and re-emits one canonical URL per locale.
 */
export function buildHreflangTags(
  pathname: string,
): Array<{tagName: 'link'; rel: 'alternate'; hreflang: string; href: string}> {
  const basePath = stripLocalePrefix(pathname);
  const tags: Array<{
    tagName: 'link';
    rel: 'alternate';
    hreflang: string;
    href: string;
  }> = [];

  for (const loc of SUPPORTED_LOCALES) {
    const localePath = basePath === '/' ? `/${loc}` : `/${loc}${basePath}`;
    tags.push({
      tagName: 'link',
      rel: 'alternate',
      hreflang: loc,
      href: `${PRIMARY_HOST}${localePath}`,
    });
  }
  // x-default → English version (our default).
  const defaultPath = basePath === '/' ? '/en' : `/en${basePath}`;
  tags.push({
    tagName: 'link',
    rel: 'alternate',
    hreflang: 'x-default',
    href: `${PRIMARY_HOST}${defaultPath}`,
  });
  return tags;
}

/**
 * Build a canonical link tag descriptor for the current pathname.
 */
export function buildCanonicalTag(
  pathname: string,
): {tagName: 'link'; rel: 'canonical'; href: string} {
  return {
    tagName: 'link',
    rel: 'canonical',
    href: buildCanonical(pathname),
  };
}

export interface SocialMetaInput {
  title: string;
  description?: string;
  ogImage?: string;
  pathname: string;
  type?: 'website' | 'article' | 'product';
}

/**
 * Build OG + Twitter Card meta descriptors. Always emits canonical URL
 * via `og:url` so social platforms attribute the share back to the
 * primary host even when shared from a preview URL.
 */
export function buildSocialMeta(
  input: SocialMetaInput,
): Array<{property?: string; name?: string; content: string}> {
  const {
    title,
    description = '',
    ogImage = DEFAULT_OG_IMAGE,
    pathname,
    type = 'website',
  } = input;
  const url = buildCanonical(pathname);
  return [
    // Open Graph
    {property: 'og:site_name', content: BRAND_NAME},
    {property: 'og:type', content: type},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {property: 'og:image', content: ogImage},
    // Twitter Card
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
    {name: 'twitter:image', content: ogImage},
  ];
}

/**
 * Convenience: build the full SEO meta block (canonical + hreflang + OG)
 * for a route in one call. Returns a flat MetaDescriptor[] you can spread
 * into the route's `meta()` return.
 */
export function buildSeoMeta(input: {
  title: string;
  description?: string;
  pathname: string;
  ogImage?: string;
  type?: 'website' | 'article' | 'product';
}): Array<Record<string, unknown>> {
  return [
    buildCanonicalTag(input.pathname),
    ...buildHreflangTags(input.pathname),
    ...buildSocialMeta(input),
  ];
}
