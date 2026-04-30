/**
 * Server component. Desktop mega-menu used inside the header.
 *
 * Source of truth:
 *   1. If the Shopify Admin "main-menu" exists with at least one nested
 *      column, we render that.
 *   2. Otherwise we fall back to the hand-curated MEGA_MENU_FALLBACK below
 *      (verified collection handles on heater-dev.myshopify.com).
 *
 * Visual: the mega panel is full-bleed (CSS class `megamenu-panel` extends
 * to viewport edges), revealed on hover/focus-within of the trigger column.
 * Dense — column-headings + sub-link lists, no airy padding.
 *
 * The reveal itself is pure CSS (see globals.css `.megamenu-trigger` /
 * `.megamenu-panel`). We don't need React state for the hover behaviour.
 */
import Link from "next/link";
import type { MenuItem } from "@gberg/shopify-client";
import { localeHref } from "@/lib/href";

interface MegaColumn {
  label: string;
  href: string;
  sub?: { label: string; href: string }[];
}

const MEGA_MENU_FALLBACK: MegaColumn[] = [
  {
    label: "Living rooms",
    href: "/collections/wohnraumheizkoerper",
    sub: [
      { label: "Vertical", href: "/collections/wohnraumheizkoerper?filter=vertical" },
      { label: "Horizontal", href: "/collections/wohnraumheizkoerper?filter=horizontal" },
      { label: "Panel", href: "/collections/wohnraumheizkoerper?filter=panel" },
    ],
  },
  {
    label: "Bathroom",
    href: "/collections/badheizkoerper",
    sub: [
      { label: "Towel radiators", href: "/collections/badheizkoerper" },
      { label: "Electric", href: "/collections/badheizkoerper-elektrisch" },
      { label: "Mid-connection", href: "/collections/badheizkoerper?filter=mid_connection" },
    ],
  },
  {
    label: "Electric",
    href: "/collections/badheizkoerper-elektrisch",
  },
  {
    label: "Replacement",
    href: "/collections/austauschheizkoerper",
  },
  {
    label: "Underfloor",
    href: "/collections/fussbodenheizung",
    sub: [
      { label: "PE-RT pipes", href: "/collections/pe-rt-rohre" },
      { label: "Pipes", href: "/collections/fussbodenheizungsrohre" },
      { label: "Systems", href: "/collections/fussbodenheizung" },
    ],
  },
  {
    label: "Bathroom fixtures",
    href: "/collections/bad",
    sub: [
      { label: "All bathroom", href: "/collections/bad" },
      { label: "Toilets", href: "/collections/toiletten" },
    ],
  },
  {
    label: "Accessories",
    href: "/collections/zubehoer",
  },
  {
    label: "Shop all",
    href: "/products",
  },
];

function rewriteUrl(absoluteOrPath: string | null, locale: string): string {
  if (!absoluteOrPath) return localeHref(locale, "/");
  try {
    const u = new URL(absoluteOrPath);
    return localeHref(locale, u.pathname);
  } catch {
    return localeHref(locale, absoluteOrPath);
  }
}

function shopifyMenuToColumns(menu: MenuItem[], locale: string): MegaColumn[] {
  // Each top-level menu item becomes a column; its children become sub-links.
  return menu.map((m) => ({
    label: m.title,
    href: rewriteUrl(m.url, locale),
    sub:
      m.items.length > 0
        ? m.items.map((c) => ({ label: c.title, href: rewriteUrl(c.url, locale) }))
        : undefined,
  }));
}

export interface MegaMenuProps {
  locale: string;
  menu?: MenuItem[];
}

export function MegaMenu({ locale, menu }: MegaMenuProps) {
  const columns: MegaColumn[] =
    menu && menu.length > 0
      ? shopifyMenuToColumns(menu, locale)
      : MEGA_MENU_FALLBACK.map((c) => ({
          ...c,
          href: localeHref(locale, c.href),
          sub: c.sub?.map((s) => ({ ...s, href: localeHref(locale, s.href) })),
        }));

  return (
    <nav aria-label="Main" className="hidden flex-1 lg:block">
      <ul className="flex items-center justify-center gap-7">
        {columns.map((col) => {
          const hasSub = col.sub && col.sub.length > 0;
          return (
            <li
              key={col.label}
              className={hasSub ? "megamenu-trigger" : undefined}
            >
              <Link href={col.href} className="nav-link">
                {col.label}
              </Link>
              {hasSub ? (
                <div className="megamenu-panel" role="menu">
                  <div className="container-x grid grid-cols-2 gap-x-12 gap-y-2 py-8 md:grid-cols-4">
                    <div className="md:col-span-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                        {col.label}
                      </p>
                      <ul className="mt-4 space-y-2">
                        <li>
                          <Link
                            href={col.href}
                            className="link-accent text-[15px] text-[var(--color-text)]"
                          >
                            Browse all
                          </Link>
                        </li>
                        {col.sub!.map((s) => (
                          <li key={s.href}>
                            <Link
                              href={s.href}
                              className="link-accent text-[15px] text-[var(--color-text)]"
                            >
                              {s.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="md:col-span-3 self-end justify-self-end text-right">
                      <p className="font-[var(--font-display)] text-2xl italic leading-tight text-[var(--color-text-muted)]">
                        Engineered, certified,
                        <br />
                        delivered across Europe.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { MEGA_MENU_FALLBACK };
export type { MegaColumn };
