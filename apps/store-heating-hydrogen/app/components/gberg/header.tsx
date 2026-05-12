/**
 * Sticky top header with logo, mega-nav, search overlay, account/cart icons.
 * Hydrogen port.
 */
import {Suspense} from 'react';
import {Link, Await, useRouteLoaderData} from 'react-router';
import type {MenuItem} from '@gberg/shopify-client';
import {localeHref} from '~/lib/gberg/href';
import {tFor, isSupportedLocale, DEFAULT_LOCALE, type Locale, type TFunction} from '~/lib/gberg/i18n';
import {
  MegaMenu,
  MEGA_MENU_FALLBACK,
  shopifyMenuToColumns,
  type MegaColumn,
} from './nav/mega-menu';
import {MobileDrawer} from './nav/mobile-drawer';
import {SearchOverlay} from './search/search-overlay';
import LanguageSwitcher from './language-switcher';

interface CartLike {
  totalQuantity?: number | null;
}
interface RootLoaderShape {
  cart?: Promise<CartLike | null> | CartLike | null;
}

/**
 * Renders the cart quantity. `mode`:
 *  - `label` (default): "Cart (N)" — used as the visible desktop link text
 *    AND the screen-reader accessible name.
 *  - `count`: just "N" — the badge digit on the mobile bag icon.
 */
function CartCount({locale, mode = 'label'}: {locale: Locale; mode?: 'label' | 'count'}) {
  const t = tFor(locale);
  const data = useRouteLoaderData<RootLoaderShape>('root');
  const cart = data?.cart;
  const render = (n: number | null | undefined) => {
    const count = typeof n === 'number' ? n : 0;
    return mode === 'count' ? String(count) : t('header.cart_count', {count});
  };
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

/** Person glyph — mobile account link. */
function AccountIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

/** Shopping-bag glyph — mobile cart link. */
function BagIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/**
 * Cart link. Mobile (`<sm`): bag icon + a small quantity badge — keeps the
 * header on a single line on narrow phones. `sm+`: the "Cart (N)" text.
 * A visually-hidden "Cart (N)" string is the accessible name in both
 * modes, so the visible badge digit (aria-hidden) never trips axe's
 * `label-content-name-mismatch`.
 */
function CartLink({locale, safeLocale}: {locale: string; safeLocale: Locale}) {
  return (
    <Link
      to={localeHref(locale, '/cart')}
      // Mobile: a 40×40 centred icon button, matching the hamburger so the
      // action row reads as a row of equal-weight controls. sm+: revert to an
      // inline text link ("Cart (N)").
      className="link-accent inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--color-text)] sm:h-auto sm:w-auto sm:justify-start"
    >
      <span className="sr-only">
        <CartCount locale={safeLocale} mode="label" />
      </span>
      <span aria-hidden className="relative inline-flex sm:hidden">
        <BagIcon />
        <span className="absolute -right-2 -top-1.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[9px] font-bold leading-none text-white">
          <CartCount locale={safeLocale} mode="count" />
        </span>
      </span>
      <span aria-hidden className="hidden whitespace-nowrap sm:inline">
        <CartCount locale={safeLocale} mode="label" />
      </span>
    </Link>
  );
}

export interface HeaderProps {
  locale: string;
  menu?: MenuItem[];
  isLoggedIn?: Promise<boolean> | boolean;
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

export function Header({locale, menu, isLoggedIn}: HeaderProps) {
  const safeLocale: Locale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const t = tFor(safeLocale);
  const columns = resolveColumns(menu, locale);

  return (
    <header className="sticky top-0 z-50 bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
      {/*
        Mobile crowding fix (May 2026): tighter gaps + a smaller logo on
        narrow phones, and the account/cart links collapse to icons below
        `sm` so the multi-word labels ("Sign in", "Cart (0)") can never
        wrap to a second line. Text labels return at `sm+` where there's
        room. See AccountLink / CartLink below.
      */}
      <div className="container-x flex items-center gap-3 py-4 sm:gap-5 sm:py-5 lg:gap-6">
        <Link
          to={localeHref(locale, '/')}
          aria-label={t('common.home')}
          // -my-2/py-2 stretches the tap target to the header's full height
          // on touch screens without changing the visual layout. The
          // hover/active states give it real button feedback: red on hover
          // (desktop) and a quick press-down (dim + slight shrink) on tap.
          className="-my-2 inline-flex shrink-0 items-center py-2 font-[var(--font-display)] text-xl font-semibold tracking-tight text-[var(--color-text)] transition hover:text-[var(--color-primary)] active:scale-[0.97] active:opacity-70 sm:text-2xl"
        >
          G-Berg
        </Link>

        <MegaMenu locale={locale} menu={menu} />

        {/* Mobile: tight gap — the Account/Cart/hamburger controls are 40×40
            with their own internal padding, so they self-space. sm+: roomier
            gaps once the Account/Cart links carry text labels. */}
        <div className="ml-auto flex items-center gap-1 text-[12px] uppercase tracking-[0.12em] font-semibold sm:gap-3.5 lg:gap-5">
          <SearchOverlay locale={locale} />
          <LanguageSwitcher locale={safeLocale} />
          <AccountLink locale={locale} isLoggedIn={isLoggedIn} />
          <CartLink locale={locale} safeLocale={safeLocale} />
          <MobileDrawer locale={locale} columns={columns} />
        </div>
      </div>
      <div className="rule-accent" aria-hidden />
    </header>
  );
}

/** Resolves "Account" (logged in) vs "Sign in" via the auth promise. */
function AccountLabel({
  isLoggedIn,
  t,
}: {
  isLoggedIn?: Promise<boolean> | boolean;
  t: TFunction;
}) {
  return (
    <Suspense fallback={t('header.sign_in')}>
      <Await resolve={Promise.resolve(isLoggedIn ?? false)} errorElement={t('header.sign_in')}>
        {(loggedIn) => (loggedIn ? t('header.account') : t('header.sign_in'))}
      </Await>
    </Suspense>
  );
}

/**
 * Header account/sign-in link. Resolves the auth promise client-side via
 * Suspense so SSR doesn't block on it. Logged-in users see "Account",
 * everyone else sees "Sign in" — both link to /account, which the
 * Customer Account API redirects to /account/login when not authed.
 *
 * Mobile (`<sm`): a person icon (saves header width on narrow phones).
 * `sm+`: the text label. A visually-hidden copy of the label is the
 * accessible name in both modes — this also fixes the prior latent
 * mismatch where the visible text "Sign in" disagreed with the
 * `aria-label="Account"`.
 */
function AccountLink({locale, isLoggedIn}: {locale: string; isLoggedIn?: Promise<boolean> | boolean}) {
  const safeLocale: Locale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const t = tFor(safeLocale);
  return (
    <Link
      to={localeHref(locale, '/account')}
      reloadDocument
      // Mobile: a 40×40 centred icon button, matching the hamburger so the
      // action row reads as a row of equal-weight controls. sm+: revert to an
      // inline text link ("Sign in" / "Account").
      className="link-accent inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--color-text)] sm:h-auto sm:w-auto sm:justify-start"
    >
      <span className="sr-only">
        <AccountLabel isLoggedIn={isLoggedIn} t={t} />
      </span>
      <span aria-hidden className="inline-flex sm:hidden">
        <AccountIcon />
      </span>
      <span aria-hidden className="hidden whitespace-nowrap sm:inline">
        <AccountLabel isLoggedIn={isLoggedIn} t={t} />
      </span>
    </Link>
  );
}
