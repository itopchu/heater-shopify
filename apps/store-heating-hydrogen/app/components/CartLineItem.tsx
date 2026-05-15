import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout, LineItemChildrenMap} from '~/components/CartMain';
import {CartForm, Image, type OptimisticCartLine} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link} from 'react-router';
import {ProductPrice} from './ProductPrice';
import {useAside} from './Aside';
import {useCartActionRoute, useT} from '~/lib/gberg/i18n';
import type {
  CartApiQueryFragment,
  CartLineFragment,
} from 'storefrontapi.generated';

export type CartLine = OptimisticCartLine<CartApiQueryFragment>;

/**
 * A single line item in the cart. Editorial-card layout: thumbnail left,
 * title + variant tags + price stacked on the right, quantity stepper +
 * remove link underneath. Works in both the page layout and the aside
 * drawer; the drawer just stacks tighter via parent CSS.
 */
export function CartLineItem({
  layout,
  line,
  childrenMap,
}: {
  layout: CartLayout;
  line: CartLine;
  childrenMap: LineItemChildrenMap;
}) {
  const {id, merchandise} = line;
  const {product, title, image, selectedOptions} = merchandise;
  const lineItemUrl = useVariantUrl(product.handle, selectedOptions);
  const {close} = useAside();
  const lineItemChildren = childrenMap[id];
  const childrenLabelId = `cart-line-children-${id}`;
  const t = useT();

  // Drop default "Default Title" Shopify variant noise.
  const meaningfulOptions = selectedOptions.filter(
    (o) => o.value && o.value !== 'Default Title',
  );

  return (
    <li key={id} className="px-4 py-5 sm:px-6 md:py-6">
      <div className="flex gap-4 sm:gap-5 md:gap-6">
        {image ? (
          <Link
            prefetch="intent"
            to={lineItemUrl}
            onClick={() => layout === 'aside' && close()}
            className="block shrink-0 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)]"
          >
            <Image
              alt={title}
              aspectRatio="1/1"
              data={image}
              sizes="(max-width: 640px) 80px, 110px"
              className="h-20 w-20 object-contain sm:h-24 sm:w-24 md:h-28 md:w-28"
            />
          </Link>
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-md bg-[var(--color-surface-muted)] sm:h-24 sm:w-24 md:h-28 md:w-28" />
        )}

        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <Link
              prefetch="intent"
              to={lineItemUrl}
              onClick={() => layout === 'aside' && close()}
              className="font-[var(--font-display)] text-[1rem] font-medium leading-snug text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)] md:text-[1.05rem]"
            >
              {product.title}
            </Link>
            <div className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-[var(--color-text)]">
              <ProductPrice price={line?.cost?.totalAmount} />
            </div>
          </div>

          {meaningfulOptions.length > 0 ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--color-text-muted)]">
              {meaningfulOptions.map((option) => (
                <li key={option.name} className="flex items-center gap-1">
                  <span className="uppercase tracking-[0.08em]">
                    {option.name}
                  </span>
                  <span aria-hidden className="text-[var(--color-text-muted)]/60">
                    ·
                  </span>
                  <span className="text-[var(--color-text)]">{option.value}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <CartLineQuantity line={line} />
            <CartLineRemoveButton
              lineIds={[id]}
              disabled={!!line.isOptimistic}
            />
          </div>
        </div>
      </div>

      {lineItemChildren ? (
        <div className="mt-4 border-l-2 border-[var(--color-primary)]/40 pl-4">
          <p id={childrenLabelId} className="sr-only">
            {t('cart.line_items_with', {title: product.title})}
          </p>
          <ul aria-labelledby={childrenLabelId} className="space-y-3">
            {lineItemChildren.map((childLine) => (
              <CartLineItem
                childrenMap={childrenMap}
                key={childLine.id}
                line={childLine}
                layout={layout}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Segmented quantity stepper — single bordered group with a centred
 * tabular-num count. Replaces the previous tiny "Qty: 1 - +" inline row
 * that read as legacy Dawn template CSS.
 */
function CartLineQuantity({line}: {line: CartLine}) {
  const t = useT();
  if (!line || typeof line?.quantity === 'undefined') return null;
  const {id: lineId, quantity, isOptimistic} = line;
  const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
  const nextQuantity = Number((quantity + 1).toFixed(0));

  return (
    <div
      className="inline-flex items-center rounded-sm border border-[var(--color-border)]"
      aria-label={t('pdp.quantity')}
    >
      <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
        <button
          aria-label={t('pdp.decrease_quantity')}
          disabled={quantity <= 1 || !!isOptimistic}
          name="decrease-quantity"
          value={prevQuantity}
          className="flex h-9 w-9 items-center justify-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden className="text-lg leading-none">−</span>
        </button>
      </CartLineUpdateButton>
      <span
        className="min-w-[2.25rem] px-2 text-center text-[14px] font-semibold tabular-nums text-[var(--color-text)]"
        aria-live="polite"
      >
        {quantity}
      </span>
      <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
        <button
          aria-label={t('pdp.increase_quantity')}
          name="increase-quantity"
          value={nextQuantity}
          disabled={!!isOptimistic}
          className="flex h-9 w-9 items-center justify-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden className="text-lg leading-none">+</span>
        </button>
      </CartLineUpdateButton>
    </div>
  );
}

/**
 * Subtle remove link — text-style, not a CTA button, since it's a
 * destructive secondary action that shouldn't compete with the
 * checkout button at the bottom of the cart.
 */
function CartLineRemoveButton({
  lineIds,
  disabled,
}: {
  lineIds: string[];
  disabled: boolean;
}) {
  const t = useT();
  const cartRoute = useCartActionRoute();
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route={cartRoute}
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button
        disabled={disabled}
        type="submit"
        className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)] disabled:opacity-40"
      >
        {t('common.remove')}
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
  const lineIds = lines.map((line) => line.id);
  const cartRoute = useCartActionRoute();

  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route={cartRoute}
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

/**
 * Returns a unique key for the update action. This is used to make sure actions modifying the same line
 * items are not run concurrently, but cancel each other. For example, if the user clicks "Increase quantity"
 * and "Decrease quantity" in rapid succession, the actions will cancel each other and only the last one will run.
 * @param lineIds - line ids affected by the update
 * @returns
 */
function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
