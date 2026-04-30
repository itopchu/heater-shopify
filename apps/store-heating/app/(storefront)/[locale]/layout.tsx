/**
 * Storefront shell layout. Wraps every locale-prefixed route with utility bar,
 * header, footer. Server component — fetches menus from Shopify.
 *
 * i18n responsibilities (brief 07 §12):
 *   - Refuse unknown locales at the boundary (notFound() if not in
 *     SUPPORTED_LOCALES). This stops /pt/, /xx/, etc. from rendering as NL.
 *   - Sync `<html lang>` to the active locale for accessibility. Next's
 *     App Router only allows one <html> per request, owned by the root
 *     layout. We bridge the gap with a tiny inline script that flips
 *     document.documentElement.lang on first paint — server-rendered, no
 *     hydration mismatch since the script runs before React hydrates.
 *   - Emit hreflang link tags in <head> via generateMetadata (one per
 *     locale + x-default), per brief 07 §12 + non-negotiable #3.
 */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { UtilityBar } from "@/components/utility-bar";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { fetchHeaderMenu } from "@/lib/queries";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  htmlLang,
  isSupportedLocale,
} from "@/lib/i18n";

export const dynamic = "force-static";
export const revalidate = 300;

/**
 * Pre-render every supported locale at build time. /xx/ etc. fall through
 * to the dynamic boundary which calls notFound().
 */
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/**
 * Per-locale metadata. Emits canonical + hreflang alternates (one per
 * supported locale + x-default → NL). Coordinated with the SEO/AI
 * readiness auditor's hreflang requirements.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safe = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const languages: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    languages[l] = `/${l}`;
  }
  // x-default points at the primary launch locale (NL). The brief is
  // explicit: NL is primary, EN is fallback only.
  languages["x-default"] = `/${DEFAULT_LOCALE}`;
  return {
    alternates: {
      canonical: `/${safe}`,
      languages,
    },
  };
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const menu = await fetchHeaderMenu(locale);
  const lang = htmlLang(locale);

  return (
    <>
      {/*
        Sync <html lang> to the active locale. Inlined as a Script with
        strategy=beforeInteractive so it runs before React hydration and
        accessibility tooling reads the correct language. We can't set
        the attribute server-side from a nested layout in App Router — the
        root layout owns <html>.
      */}
      <Script id="i18n-html-lang" strategy="beforeInteractive">
        {`document.documentElement.lang = ${JSON.stringify(lang)};`}
      </Script>
      <UtilityBar locale={locale} />
      <Header locale={locale} menu={menu} />
      <main id="main">{children}</main>
      <Footer locale={locale} />
    </>
  );
}
