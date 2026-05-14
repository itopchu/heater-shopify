/**
 * Desktop mega-menu. Hydrogen port.
 */
import {Link, NavLink} from 'react-router';
import type {MenuItem} from '@gberg/shopify-client';
import {localeHref} from '~/lib/gberg/href';
import {useT, type TFunction} from '~/lib/gberg/i18n';

interface MegaColumn {
  label: string;
  href: string;
  sub?: {label: string; href: string}[];
}

/**
 * Authoritative top-nav. Mirrors the catalog categories surfaced on the
 * homepage (CATEGORY_HANDLES in routes/($locale)._index.tsx) and the
 * collection seeds in agent/scripts/seed-collections.mjs. The live
 * Shopify Admin "Main menu" is intentionally NOT used — it's drifted from
 * the catalog and surfaced links to deprecated/empty collections.
 *
 * "Shop all" sits leftmost as the always-visible escape hatch into the
 * full catalog.
 *
 * Labels here are EN source strings. The mega-menu / mobile-drawer
 * translate them at render time via `navLabel(t, label)` (below). The
 * raw string acts as a stable key for the lookup map AND the EN fallback
 * if the i18n key isn't present (e.g. for Shopify-admin-driven entries).
 */
const MEGA_MENU_FALLBACK: MegaColumn[] = [
  {label: 'Shop all', href: '/products'},
  {label: 'Living rooms', href: '/collections/living-room-radiators'},
  {label: 'Bathroom', href: '/collections/bathroom-radiators'},
  {label: 'Electric', href: '/collections/electric-bathroom-radiators'},
  {label: 'Replacement', href: '/collections/replacement-radiators'},
  {label: 'Accessories', href: '/collections/accessories'},
];

/**
 * Maps each `MEGA_MENU_FALLBACK` EN label to its i18n key. Keeps the
 * exported `MEGA_MENU_FALLBACK` shape stable for header.tsx consumers.
 */
const NAV_LABEL_KEY: Record<string, string> = {
  'Shop all': 'nav.shop_all',
  'Living rooms': 'nav.living_rooms',
  Bathroom: 'nav.bathroom',
  Electric: 'nav.electric',
  Replacement: 'nav.replacement',
  Accessories: 'nav.accessories',
};

/**
 * Translate a nav column label via the lookup map, falling back to the
 * raw label (for Shopify-admin-driven entries that don't have a key).
 */
export function navLabel(t: TFunction, label: string): string {
  const key = NAV_LABEL_KEY[label];
  return key ? t(key) : label;
}

function rewriteUrl(absoluteOrPath: string | null, locale: string): string {
  if (!absoluteOrPath) return localeHref(locale, '/');
  try {
    const u = new URL(absoluteOrPath);
    return localeHref(locale, u.pathname);
  } catch {
    return localeHref(locale, absoluteOrPath);
  }
}

/**
 * Drop nav entries that no longer match the storefront:
 *  - "Buying guides" / `/pages/guides` — page is decommissioned.
 *  - Sub-items under any Floor heating / Underfloor / Fußbodenheizung
 *    parent — the catalog only has one underfloor product, so a mega-menu
 *    sub-list would be misleading. The parent link itself stays so SEO
 *    and direct entry to the category landing page still work.
 */
function isGuideEntry(label: string, href: string): boolean {
  return /\bguide(s)?\b/i.test(label) || /\/pages\/guide(s)?\b/i.test(href);
}

function isUnderfloorEntry(label: string, href: string): boolean {
  return (
    /fussboden|fußboden|underfloor|floor heating/i.test(label) ||
    /\/collections\/(fussbodenheizung|fussbodenheizungsrohre|pe-rt-rohre)\b/i.test(href)
  );
}

export function shopifyMenuToColumns(
  menu: MenuItem[],
  locale: string,
): MegaColumn[] {
  return menu
    .map((m) => {
      const href = rewriteUrl(m.url, locale);
      if (isGuideEntry(m.title, href)) return null;
      const flatten = isUnderfloorEntry(m.title, href);
      const sub = flatten
        ? undefined
        : m.items.length > 0
          ? m.items
              .map((c) => ({label: c.title, href: rewriteUrl(c.url, locale)}))
              .filter((c) => !isGuideEntry(c.label, c.href))
          : undefined;
      return {
        label: m.title,
        href,
        sub: sub && sub.length > 0 ? sub : undefined,
      };
    })
    .filter((c): c is MegaColumn => c != null);
}

export interface MegaMenuProps {
  locale: string;
  menu?: MenuItem[];
}

export function MegaMenu({locale, menu}: MegaMenuProps) {
  // Live Shopify Admin menu intentionally ignored. Catalog-driven nav
  // only — see MEGA_MENU_FALLBACK comment block.
  void menu;
  const t = useT();
  const columns: MegaColumn[] = MEGA_MENU_FALLBACK.map((c) => ({
    ...c,
    href: localeHref(locale, c.href),
    sub: c.sub?.map((s) => ({...s, href: localeHref(locale, s.href)})),
  }));

  return (
    <nav aria-label={t('header.main_nav')} className="hidden flex-1 lg:block">
      <ul className="flex items-center justify-center gap-7">
        {columns.map((col) => {
          const hasSub = col.sub && col.sub.length > 0;
          const label = navLabel(t, col.label);
          return (
            <li
              key={col.label}
              className={hasSub ? 'megamenu-trigger' : undefined}
            >
              {/* NavLink + `end` so each column highlights only when its
                  exact path is active. The .nav-link CSS already styles
                  the [aria-current='page'] state with a persistent red
                  underline (see styles/tailwind.css). */}
              <NavLink to={col.href} end className="nav-link">
                {label}
              </NavLink>
              {hasSub ? (
                <div className="megamenu-panel" role="menu">
                  <div className="container-x grid grid-cols-2 gap-x-12 gap-y-2 py-8 md:grid-cols-4">
                    <div className="md:col-span-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                        {label}
                      </p>
                      <ul className="mt-4 space-y-2">
                        <li>
                          <NavLink
                            to={col.href}
                            end
                            className={({isActive}) =>
                              `link-accent text-[15px] ${
                                isActive
                                  ? 'font-semibold text-[var(--color-primary)]'
                                  : 'text-[var(--color-text)]'
                              }`
                            }
                          >
                            {t('common.browse_all')}
                          </NavLink>
                        </li>
                        {col.sub!.map((s) => (
                          <li key={s.href}>
                            <NavLink
                              to={s.href}
                              end
                              className={({isActive}) =>
                                `link-accent text-[15px] ${
                                  isActive
                                    ? 'font-semibold text-[var(--color-primary)]'
                                    : 'text-[var(--color-text)]'
                                }`
                              }
                            >
                              {s.label}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="md:col-span-3 self-end justify-self-end text-right">
                      <p className="font-[var(--font-display)] text-2xl italic leading-tight text-[var(--color-text-muted)]">
                        {t('nav.engineered_tagline_line1')}
                        <br />
                        {t('nav.engineered_tagline_line2')}
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

export {MEGA_MENU_FALLBACK};
export type {MegaColumn};
