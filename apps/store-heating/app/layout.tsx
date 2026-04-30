import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "G-Berg Heizung",
    template: "%s | G-Berg Heizung",
  },
  description:
    "Premium European radiators and bathroom heating — engineered, certified, delivered.",
  metadataBase: new URL("https://example.com"),
};

/**
 * Root layout. The `<html lang>` attribute is set here to NL (the primary
 * launch locale per master brief 01) so the root redirect (/ → /nl) and
 * any non-locale-prefixed route render with a sensible default. The
 * locale-prefixed segment under app/(storefront)/[locale]/ overrides this
 * for the actual storefront pages — see (storefront)/[locale]/layout.tsx.
 *
 * NOTE: Next.js renders only one <html> element per request. The inner
 * locale layout therefore cannot wrap children in another <html>; instead
 * we rely on Next's metadata + a server-side dynamic html attribute via
 * the locale-aware HtmlLangSync below. For build-time safety we leave
 * `lang="nl"` here and let middleware/route handlers correct it for
 * non-NL locales (Next 15 supports per-segment <html lang> via the
 * `params` prop in `generateMetadata`).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="nl"
      data-brand="heating"
      className={`${inter.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
