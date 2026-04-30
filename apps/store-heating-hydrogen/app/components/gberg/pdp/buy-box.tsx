/**
 * Buy-box wraps variant selector + add-to-cart so they share the
 * currently selected variant.
 *
 * Design Refresh — April 2026:
 *  - Sticky-mobile add-to-cart: a bottom-fixed bar appears below the
 *    `lg` breakpoint with a polished `<Button size="xl">` so the
 *    primary action is always reachable on a phone. Safe-area inset
 *    keeps it clear of the iOS home indicator.
 *
 * History: a non-inverse <TrustStrip> used to live below the
 * AddToCart button (warranty / returns / delivery / secure checkout).
 * It was removed at the user's request — those signals already live
 * in the top utility bar, and stacking them again under the buy-box
 * read as visual repetition rather than reassurance. If a per-PDP
 * trust mark needs to surface again later (e.g. SKU-specific
 * warranty terms), surface it as a single inline note next to the
 * warranty/return policy link, not as a 4-icon strip.
 */
import {useState} from 'react';
import {CartForm} from '@shopify/hydrogen';
import type {HeatingProduct, ProductVariant, Money} from '@gberg/product-schema';
import {Button} from '@gberg/ui';
import {VariantSelector} from './variant-selector';
import {AddToCart} from './add-to-cart';
import {PriceBlock} from './price-block';
import {formatMoney} from '~/lib/gberg/format';

export interface BuyBoxProps {
  product: HeatingProduct;
  initialVariant: ProductVariant | null;
  locale: string;
  fallbackPrice: Money;
}

export function BuyBox({
  product,
  initialVariant,
  locale,
  fallbackPrice,
}: BuyBoxProps) {
  const [variant, setVariant] = useState<ProductVariant | null>(initialVariant);
  const price = variant?.price ?? fallbackPrice;
  const compareAt = variant?.compareAtPrice ?? null;
  const available = variant?.availableForSale ?? false;


  return (
    <>
      <div className="space-y-6">
        <PriceBlock price={price} compareAtPrice={compareAt} locale={locale} />
        <VariantSelector
          options={product.options}
          variants={product.variants}
          locale={locale}
          onVariantChange={setVariant}
        />
        <AddToCart variantId={variant?.id ?? null} available={available} />

      </div>

      <StickyMobileBuy
        title={product.title}
        price={price}
        locale={locale}
        available={available}
        variantId={variant?.id ?? null}
      />
    </>
  );
}

interface StickyMobileBuyProps {
  title: string;
  price: Money;
  locale: string;
  available: boolean;
  variantId: string | null;
}

/**
 * Bottom-fixed add-to-cart bar visible below the `lg` breakpoint. Hidden on
 * `lg+` where the side-rail buy box stays in view via `position: sticky`.
 *
 * iOS safe-area inset (`pb-[env(safe-area-inset-bottom)]`) keeps the button
 * above the home indicator on iPhone X+ devices.
 *
 * Until the cart wiring lands the button still routes through `<AddToCart>`'s
 * staged behaviour — we intentionally keep one source of truth for the click.
 */
function StickyMobileBuy({
  title,
  price,
  locale,
  available,
  variantId,
}: StickyMobileBuyProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden pb-[env(safe-area-inset-bottom)]"
      role="region"
      aria-label="Buy bar"
    >
      <div className="container-x flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            {title}
          </p>
          <p className="text-base font-semibold tabular-nums text-[var(--color-text)]">
            {formatMoney(price, locale)}
          </p>
        </div>
        <CartForm
          route="/cart"
          action={CartForm.ACTIONS.LinesAdd}
          inputs={{
            lines: variantId
              ? [{merchandiseId: variantId, quantity: 1}]
              : [],
          }}
        >
          {(fetcher) => {
            const adding = fetcher.state !== 'idle';
            const justAdded =
              fetcher.state === 'idle' && (fetcher.data as {cart?: unknown})?.cart != null;
            return (
              <Button
                type="submit"
                size="xl"
                variant="primary"
                loading={adding}
                disabled={!available || !variantId}
              >
                {!available ? 'Sold out' : justAdded ? 'Added' : 'Add to cart'}
              </Button>
            );
          }}
        </CartForm>
      </div>
    </div>
  );
}
