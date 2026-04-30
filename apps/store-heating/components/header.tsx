/**
 * Server component. Sticky top header with logo, mega-nav, search overlay,
 * account/cart icons. Composes:
 *
 *   - <MegaMenu>      (desktop, ≥lg) — full-bleed hover panels.
 *   - <SearchOverlay> (desktop, md+) — magnifying-glass icon → full-bleed
 *                                       overlay with predictive search.
 *   - <MobileDrawer>  (<lg)         — hamburger → right-side slide drawer
 *                                       with nav, search, account, locale.
 *
 * Spec ref: shop/02_wireframes_page_blueprints.md "Header".
 *
 * Brand voice: charcoal logo, uppercase tracked-out nav links, animated red
 * underline on hover, 1px red rule at the bottom of the header.
 *
 * The nav structure pulls from the Shopify Admin "main-menu" when present
 * (passed in as `menu`); falls back to MEGA_MENU_FALLBACK so the storefront
 * is never empty during initial seeding.
 */
import Link from "next/link";
import type { MenuItem } from "@gberg/shopify-client";
import { localeHref } from "@/lib/href";
import { MegaMenu, MEGA_MENU_FALLBACK, type MegaColumn } from "./nav/mega-menu";
import { MobileDrawer } from "./nav/mobile-drawer";
import { SearchOverlay } from "./search/search-overlay";

export interface HeaderProps {
  locale: string;
  menu?: MenuItem[];
}

function rewriteUrl(absoluteOrPath: string | null, locale: string): string {
  if (!absoluteOrPath) return localeHref(locale, "/");
  try {
    const u = new URL(absoluteOrPath);
    return localeHref(locale, u.pathname);
  } catch {
    return localeHref(locale, absoluteOrPath);
  }
}

function resolveColumns(menu: MenuItem[] | undefined, locale: string): MegaColumn[] {
  if (menu && menu.length > 0) {
    return menu.map((m) => ({
      label: m.title,
      href: rewriteUrl(m.url, locale),
      sub:
        m.items.length > 0
          ? m.items.map((c) => ({ label: c.title, href: rewriteUrl(c.url, locale) }))
          : undefined,
    }));
  }
  return MEGA_MENU_FALLBACK.map((c) => ({
    ...c,
    href: localeHref(locale, c.href),
    sub: c.sub?.map((s) => ({ ...s, href: localeHref(locale, s.href) })),
  }));
}

export function Header({ locale, menu }: HeaderProps) {
  const columns = resolveColumns(menu, locale);

  return (
    <header className="sticky top-0 z-30 bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="container-x flex items-center gap-6 py-5">
        <Link
          href={localeHref(locale, "/")}
          className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--color-text)]"
        >
          G-Berg
        </Link>

        <MegaMenu locale={locale} menu={menu} />

        <div className="ml-auto flex items-center gap-5 text-[12px] uppercase tracking-[0.12em] font-semibold">
          <SearchOverlay locale={locale} />
          <Link
            href={localeHref(locale, "/account")}
            aria-label="Account"
            className="hidden md:inline link-accent text-[var(--color-text)]"
          >
            Account
          </Link>
          <Link
            href={localeHref(locale, "/cart")}
            aria-label="Cart"
            className="link-accent text-[var(--color-text)]"
          >
            Cart (0)
          </Link>
          <MobileDrawer locale={locale} columns={columns} />
        </div>
      </div>
      <div className="rule-accent" aria-hidden />
    </header>
  );
}
