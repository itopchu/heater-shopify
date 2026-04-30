/**
 * PDP price block.
 *
 * Track B (April 2026): strict compare-at gating. Storefront API surfaces
 * compare-at values of "0.00" for products that have *no* sale — only
 * 21/55 catalog products have a real `compare_at_min > 0`. Render the
 * strike-through + "-X%" badge only when:
 *   1. compareAtPrice is non-null AND
 *   2. its numeric amount is > 0 AND
 *   3. it's strictly greater than the live price.
 */
import type {Money} from '@gberg/product-schema';
import {formatMoney} from '~/lib/gberg/format';

export interface PriceBlockProps {
  price: Money;
  compareAtPrice?: Money | null;
  locale: string;
  vatNote?: string;
}

export function PriceBlock({price, compareAtPrice, locale, vatNote}: PriceBlockProps) {
  const priceNum = Number(price.amount);
  const compareNum = compareAtPrice ? Number(compareAtPrice.amount) : 0;
  const hasDiscount =
    compareAtPrice != null &&
    Number.isFinite(compareNum) &&
    compareNum > 0 &&
    Number.isFinite(priceNum) &&
    compareNum > priceNum;

  const discountPct =
    hasDiscount && compareNum > 0
      ? Math.round(((compareNum - priceNum) / compareNum) * 100)
      : 0;

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold tracking-tight">
          {formatMoney(price, locale)}
        </span>
        {hasDiscount ? (
          <>
            <span className="text-base text-[var(--color-text-muted)] line-through">
              {formatMoney(compareAtPrice, locale)}
            </span>
            {discountPct > 0 ? (
              <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary-fg,white)]">
                -{discountPct}%
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        {vatNote ?? 'Incl. VAT, excl. shipping'}
      </p>
    </div>
  );
}
