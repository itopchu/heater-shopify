/**
 * Edge middleware. Runs on the root path (and any non-locale-prefixed
 * request) before Next's static-route handler hits app/page.tsx.
 *
 * Responsibilities (i18n-only — keep this file Edge-runtime-safe, no
 * Node APIs):
 *   1. On `/`: redirect to `/{preferred_locale}` where preferred_locale
 *      comes from the `gberg_locale` cookie if it points at a supported
 *      locale, else falls back to the default (NL per master brief 01).
 *   2. On any other URL: pass through. The `[locale]` route handler under
 *      `app/(storefront)/[locale]/layout.tsx` already calls notFound() for
 *      unknown locales, so we don't duplicate that here.
 *
 * This intentionally does NOT do geo-IP routing. The brief is explicit:
 * the user picks the locale via the explicit switcher; we never silently
 * route to a non-NL locale on a fresh visit.
 */

import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";
const COOKIE_NAME = "gberg_locale";

function isSupported(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Only intercept the bare root. /nl, /de, /products/* etc. flow through.
  if (pathname !== "/") {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  const target: Locale = isSupported(cookieValue) ? cookieValue : DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = `/${target}`;
  url.search = search;
  return NextResponse.redirect(url, 307);
}

/**
 * Match only the exact root. We deliberately don't run on every request —
 * Next's per-segment layouts already enforce the locale boundary, and
 * adding /(.*) here would force the middleware to evaluate on every static
 * asset request which is wasted work at Edge.
 */
export const config = {
  matcher: ["/"],
};
