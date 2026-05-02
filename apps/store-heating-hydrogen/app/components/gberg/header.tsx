/**
 * Sticky top header with logo, mega-nav, search overlay, account/cart icons.
 * Hydrogen port.
 */
import {Suspense} from 'react';
import {Link, Await, useRouteLoaderData} from 'react-router';
import type {MenuItem} from '@gberg/shopify-client';
import {localeHref} from '~/lib/gberg/href';
import {tFor, isSupportedLocale, DEFAULT_LOCALE, type Locale} from '~/lib/gberg/i18n';
import {
  MegaMenu,
  MEGA_MENU_FALLBACK,
  shopifyMenuToColumns,
  type MegaColumn,
} from './nav/mega-menu';
import {MobileDrawer} from './nav/mobile-drawer';
import {SearchOverlay} from './search/search-overlay';

interface CartLike {
  totalQuantity?: number | null;
}
interface RootLoaderShape {
  cart?: Promise<CartLike | null> | CartLike | null;
}

function CartCount({locale}: {locale: Locale}) {
  const t = tFor(locale);
  const data = useRouteLoaderData<RootLoaderShape>('root');
  const cart = data?.cart;
  const render = (n: number | null | undefined) =>
    t('header.cart_count', {count: typeof n === 'number' ? n : 0});
  if (cart && typeof (cart as Promise<CartLike>).then === 'function') {
    return (
      <Suspense fallback={render(0)}>
        <Await resolve={cart as Promise<CartLike | null>} errorElement={<>{render(0)}</>}>
          {(c) => <>{render(c?.totalQuantity ?? 0)}</>}
        </Await>
      </Suspense>
    );
  }
  return <>{render((cart as CartLike | null)?.totalQuantity ?? 0)}</>;
}

export interface HeaderProps {
  locale: string;
  menu?: MenuItem[];
}

function resolveColumns(menu: MenuItem[] | undefined, locale: string): MegaColumn[] {
  // Live Shopify Admin menu intentionally ignored — see MEGA_MENU_FALLBACK
  // in nav/mega-menu.tsx for the canonical catalog-driven nav.
  void menu;
  const t = tFor(isSupportedLocale(locale) ? locale : DEFAULT_LOCALE);
  const cols: MegaColumn[] = MEGA_MENU_FALLBACK.map((c) => ({
    ...c,
    href: localeHref(locale, c.href),
    sub: c.sub?.map((s) => ({...s, href: localeHref(locale, s.href)})),
  }));

  const shopAllHref = localeHref(locale, '/products');
  const hasShopAll = cols.some((c) => c.href === shopAllHref);
  if (!hasShopAll) {
    cols.push({label: t('common.shop_all'), href: shopAllHref});
  }
  return cols;
}

export function Header({locale, menu}: HeaderProps) {
  const safeLocale: Locale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const t = tFor(safeLocale);
  const columns = resolveColumns(menu, locale);

  return (
    <header className="sticky top-0 z-50 bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
      <div className="container-x flex items-center gap-6 py-5">
        <Link
          to={localeHref(locale, '/')}
          className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--color-text)]"
        >
          G-Berg
        </Link>

        <MegaMenu locale={locale} menu={menu} />

        <div className="ml-auto flex items-center gap-5 text-[12px] uppercase tracking-[0.12em] font-semibold">
          <SearchOverlay locale={locale} />
          <Link
            to={localeHref(locale, '/cart')}
            className="link-accent text-[var(--color-text)]"
          >
            {/*
              No aria-label here. Visible text is "Cart (N)" via CartCount —
              that string is the accessible name. A separate aria-label of
              "Cart" was triggering axe's `label-content-name-mismatch`
              because the visible label ("Cart (0)") wasn't a substring of
              the accessible name ("Cart"). The visible string is already
              clear, so let it serve as the accessible name.
            */}
            <CartCount locale={safeLocale} />
          </Link>
          <MobileDrawer locale={locale} columns={columns} />
        </div>
      </div>
      <div className="rule-accent" aria-hidden />
    </header>
  );
}
