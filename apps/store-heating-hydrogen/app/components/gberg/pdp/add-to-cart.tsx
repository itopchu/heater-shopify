/**
 * Add-to-cart button + quantity stepper, wired to Shopify via Hydrogen's
 * CartForm primitive. Submitting POSTs to the ($locale).cart action which
 * runs cart.addLines() on the server. The local quantity input is held in
 * a hidden field that updates in sync with the stepper.
 */
import {useCallback, useState} from 'react';
import {CartForm} from '@shopify/hydrogen';
import {cn} from '@gberg/ui';
import {useAside} from '~/components/Aside';
import {useCartActionRoute, useT} from '~/lib/gberg/i18n';
import {CartAddButton} from './cart-add-button';

export interface AddToCartProps {
  variantId: string | null;
  available: boolean;
  className?: string;
}

export function AddToCart({variantId, available, className}: AddToCartProps) {
  const t = useT();
  const cartRoute = useCartActionRoute();
  const [qty, setQty] = useState(1);
  const {open} = useAside();
  const disabled = !available || !variantId;
  const openCart = useCallback(() => open('cart'), [open]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex h-12 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--color-border)]"
          role="group"
          aria-label={t('pdp.quantity_label')}
        >
          <button
            type="button"
            aria-label={t('pdp.quantity_decrease')}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-3 text-lg disabled:opacity-50"
            disabled={qty <= 1}
          >
            −
          </button>
          <span className="min-w-[2rem] text-center font-medium" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            aria-label={t('pdp.quantity_increase')}
            onClick={() => setQty((q) => q + 1)}
            className="px-3 text-lg"
          >
            +
          </button>
        </div>

        <CartForm
          route={cartRoute}
          action={CartForm.ACTIONS.LinesAdd}
          inputs={{
            lines: variantId
              ? [{merchandiseId: variantId, quantity: qty}]
              : [],
          }}
        >
          {(fetcher) => (
            <CartAddButton
              fetcher={fetcher}
              available={available}
              disabled={disabled}
              size="lg"
              unavailableLabel={t('pdp.out_of_stock')}
              className="w-auto min-w-[12rem] px-8"
              onAdded={openCart}
            />
          )}
        </CartForm>
      </div>
    </div>
  );
}
