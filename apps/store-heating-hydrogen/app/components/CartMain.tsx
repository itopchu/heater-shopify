import {useOptimisticCart} from '@shopify/hydrogen';
import {Link} from 'react-router';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {CartLineItem, type CartLine} from '~/components/CartLineItem';
import {CartSummary} from './CartSummary';
import {useT, type TFunction} from '~/lib/gberg/i18n';

// Categories matching the homepage shortcut grid — a customer who lands on
// an empty cart shouldn't have to backtrack to the home to start shopping.
function getEmptyCartShortcuts(t: TFunction) {
  return [
    {handle: 'wohnraumheizkoerper', label: t('nav.living_rooms')},
    {handle: 'badheizkoerper', label: t('nav.bathroom')},
    {handle: 'badheizkoerper-elektrisch', label: t('nav.electric')},
    {handle: 'austauschheizkoerper', label: t('nav.replacement')},
    {handle: 'fussbodenheizung', label: t('nav.underfloor')},
    {handle: 'accessories', label: t('nav.accessories')},
  ];
}

function getTrustBadges(t: TFunction) {
  return [
    {title: t('cart.trust_free_eu_title'), sub: t('cart.trust_free_eu_sub')},
    {title: t('cart.trust_returns_title'), sub: t('cart.trust_returns_sub')},
    {title: t('cart.trust_warranty_title'), sub: t('cart.trust_warranty_sub')},
    {title: t('cart.trust_engineering_title'), sub: t('cart.trust_engineering_sub')},
  ];
}

export type CartLayout = 'page' | 'aside';

export type CartMainProps = {
  cart: CartApiQueryFragment | null;
  layout: CartLayout;
};

export type LineItemChildrenMap = {[parentId: string]: CartLine[]};
/** Returns a map of all line items and their children. */
function getLineItemChildrenMap(lines: CartLine[]): LineItemChildrenMap {
  const children: LineItemChildrenMap = {};
  for (const line of lines) {
    if ('parentRelationship' in line && line.parentRelationship?.parent) {
      const parentId = line.parentRelationship.parent.id;
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(line);
    }
    if ('lineComponents' in line) {
      const children = getLineItemChildrenMap(line.lineComponents);
      for (const [parentId, childIds] of Object.entries(children)) {
        if (!children[parentId]) children[parentId] = [];
        children[parentId].push(...childIds);
      }
    }
  }
  return children;
}
/**
 * The main cart component that displays the cart items and summary.
 * It is used by both the /cart route and the cart aside dialog.
 */
export function CartMain({layout, cart: originalCart}: CartMainProps) {
  const t = useT();
  const trustBadges = getTrustBadges(t);
  // The useOptimisticCart hook applies pending actions to the cart
  // so the user immediately sees feedback when they modify the cart.
  const cart = useOptimisticCart(originalCart);

  const linesCount = Boolean(cart?.lines?.nodes?.length || 0);
  const withDiscount =
    cart &&
    Boolean(cart?.discountCodes?.filter((code) => code.applicable)?.length);
  const className = `cart-main ${withDiscount ? 'with-discount' : ''}`;
  const cartHasItems = cart?.totalQuantity ? cart.totalQuantity > 0 : false;
  const childrenMap = getLineItemChildrenMap(cart?.lines?.nodes ?? []);

  // EMPTY STATE — page layout gets a full hero treatment; aside drawer stays compact.
  if (!cartHasItems) {
    return (
      <section className={className} aria-label={t('cart.title')}>
        <CartEmpty layout={layout} />
      </section>
    );
  }

  // POPULATED STATE — page layout uses a two-column grid; aside drawer stays linear.
  if (layout === 'page') {
    const qty = cart?.totalQuantity ?? 0;
    return (
      <section className={className} aria-label={t('cart.aria_page')}>
        {/* Branded header — eyebrow + display heading + count chip on the right at md+. */}
        <header className="mb-8 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between md:gap-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[var(--color-primary)]">
              {t('cart.title')}
            </p>
            <h1 className="display-heading mt-3 text-[clamp(2rem,3vw+1rem,3.5rem)]">
              {t('cart.your_cart')}
            </h1>
            <p className="mt-3 text-[var(--color-text-muted)]">
              {qty === 1
                ? t('cart.items_ready_singular', {count: qty})
                : t('cart.items_ready_plural', {count: qty})}
            </p>
          </div>
          <span className="inline-flex h-9 min-w-[3rem] items-center justify-center self-start rounded-full bg-[var(--color-text)] px-4 text-[12px] uppercase tracking-[0.14em] font-semibold text-white md:self-auto">
            {qty}
          </span>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
          <div>
            <p id="cart-lines" className="sr-only">{t('cart.line_items')}</p>
            {/* Card container around the line list — proper border, white surface, soft shadow at md+. */}
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] md:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <ul
                aria-labelledby="cart-lines"
                className="divide-y divide-[var(--color-border)]"
              >
                {(cart?.lines?.nodes ?? []).map((line) => {
                  if ('parentRelationship' in line && line.parentRelationship?.parent) {
                    return null;
                  }
                  return (
                    <CartLineItem
                      key={line.id}
                      line={line}
                      layout={layout}
                      childrenMap={childrenMap}
                    />
                  );
                })}
              </ul>
            </div>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            {/* Summary card: brand-red top accent rule, hairline border, generous padding, soft shadow. */}
            <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
              <div className="h-[3px] bg-[var(--color-primary)]" aria-hidden />
              <div className="p-6 md:p-8">
                <CartSummary cart={cart} layout={layout} />
              </div>
            </div>

            {/* Trust grid: 2×2 cards with brand-red accent bar, replaces the prior bullet list. */}
            <ul className="mt-6 grid grid-cols-2 gap-3">
              {trustBadges.map((b) => (
                <li
                  key={b.title}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <span
                    aria-hidden
                    className="block h-1 w-6 rounded-full bg-[var(--color-primary)]"
                  />
                  <p className="mt-3 text-[12px] uppercase tracking-[0.12em] font-semibold text-[var(--color-text)]">
                    {b.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-[var(--color-text-muted)]">
                    {b.sub}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    );
  }

  // ASIDE / DRAWER LAYOUT — keep concise.
  return (
    <section className={className} aria-label={t('cart.aria_drawer')}>
      <p id="cart-lines" className="sr-only">{t('cart.line_items')}</p>
      <ul
        aria-labelledby="cart-lines"
        className="divide-y divide-[var(--color-border)]"
      >
        {(cart?.lines?.nodes ?? []).map((line) => {
          if ('parentRelationship' in line && line.parentRelationship?.parent) {
            return null;
          }
          return (
            <CartLineItem
              key={line.id}
              line={line}
              layout={layout}
              childrenMap={childrenMap}
            />
          );
        })}
      </ul>
      <CartSummary cart={cart} layout={layout} />
    </section>
  );
}

function CartEmpty({layout}: {layout?: CartMainProps['layout']}) {
  const {close} = useAside();
  const t = useT();
  const shortcuts = getEmptyCartShortcuts(t);
  const trustBadges = getTrustBadges(t);

  // Drawer (aside) variant — keep compact since vertical space is limited.
  if (layout === 'aside') {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[var(--color-primary)]">
          {t('cart.title')}
        </p>
        <h3 className="mt-3 font-[var(--font-display)] text-2xl italic">
          {t('cart.your_cart_empty')}
        </h3>
        <p className="mt-2 text-[14px] text-[var(--color-text-muted)]">
          {t('cart.empty_aside_blurb')}
        </p>
        <Link
          to="/collections"
          onClick={close}
          prefetch="viewport"
          className="mt-6 inline-flex items-center gap-2 rounded-sm bg-[var(--color-text)] px-5 py-3 text-[12px] uppercase tracking-[0.14em] font-semibold text-white hover:bg-[var(--color-primary)] transition-colors"
        >
          {t('cart.browse_all')} <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  // Page variant — proper hero with category shortcuts and trust strip.
  return (
    <div className="py-4 md:py-6">
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[var(--color-primary)]">
        {t('cart.title')}
      </p>
      <h1 className="display-heading mt-3 text-[clamp(2rem,3vw+1rem,3.5rem)]">
        {t('cart.your_cart_empty')}
      </h1>
      <p className="mt-4 max-w-xl text-[var(--color-text-muted)]">
        {t('cart.empty_page_blurb')}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/collections"
          onClick={close}
          prefetch="viewport"
          className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-text)] px-6 py-3 text-[12px] uppercase tracking-[0.14em] font-semibold text-white hover:bg-[var(--color-primary)] transition-colors"
        >
          {t('cart.browse_all')} <span aria-hidden>→</span>
        </Link>
        <Link
          to="/collections/austauschheizkoerper"
          onClick={close}
          prefetch="viewport"
          className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-border)] px-6 py-3 text-[12px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text)] hover:border-[var(--color-text)] transition-colors"
        >
          {t('cart.replacement_radiators')}
        </Link>
      </div>

      <div className="mt-12">
        <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-muted)]">
          {t('cart.shop_by_room')}
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-3">
          {shortcuts.map((c) => (
            <li key={c.handle} className="bg-[var(--color-surface)]">
              <Link
                to={`/collections/${c.handle}`}
                onClick={close}
                prefetch="viewport"
                className="group flex items-center justify-between gap-4 p-5 hover:bg-[var(--color-surface-muted)] transition-colors"
              >
                <span className="font-[var(--font-display)] italic text-xl md:text-2xl text-[var(--color-text)]">
                  {c.label}
                </span>
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 items-center justify-center text-xl text-[var(--color-primary)] transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-12 grid gap-3 border-t border-[var(--color-border)] pt-8 text-[13px] text-[var(--color-text-muted)] sm:grid-cols-2 md:grid-cols-4">
        {trustBadges.map((b) => (
          <li key={b.title} className="flex items-baseline gap-2">
            <span aria-hidden className="text-[var(--color-primary)]">·</span>
            <span>
              <strong className="text-[var(--color-text)] font-semibold">
                {b.title}
              </strong>
              <br />
              <span>{b.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
