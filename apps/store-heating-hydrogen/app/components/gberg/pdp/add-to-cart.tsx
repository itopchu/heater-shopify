/**
 * Add-to-cart button + quantity stepper, wired to Shopify via Hydrogen's
 * CartForm primitive. Submitting POSTs to the ($locale).cart action which
 * runs cart.addLines() on the server. The local quantity input is held in
 * a hidden field that updates in sync with the stepper.
 */
import {useState} from 'react';
import {CartForm} from '@shopify/hydrogen';
import {Button, cn} from '@gberg/ui';
import {useAside} from '~/components/Aside';

export interface AddToCartProps {
  variantId: string | null;
  available: boolean;
  className?: string;
}

export function AddToCart({variantId, available, className}: AddToCartProps) {
  const [qty, setQty] = useState(1);
  const {open} = useAside();
  const disabled = !available || !variantId;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex h-12 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--color-border)]"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            aria-label="Decrease quantity"
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
            aria-label="Increase quantity"
            onClick={() => setQty((q) => q + 1)}
            className="px-3 text-lg"
          >
            +
          </button>
        </div>

        <CartForm
          route="/cart"
          action={CartForm.ACTIONS.LinesAdd}
          inputs={{
            lines: variantId
              ? [{merchandiseId: variantId, quantity: qty}]
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
                size="lg"
                variant="primary"
                loading={adding}
                disabled={disabled}
                onClick={() => {
                  // Open the cart drawer when the user fires the action so
                  // they see the result without leaving the page.
                  if (!disabled) open('cart');
                }}
                className="w-auto min-w-[12rem] px-8"
              >
                {!available ? 'Out of stock' : justAdded ? 'Added' : 'Add to cart'}
              </Button>
            );
          }}
        </CartForm>
      </div>
    </div>
  );
}
