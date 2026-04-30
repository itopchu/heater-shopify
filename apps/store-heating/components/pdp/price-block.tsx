/**
 * Server component. PDP price block — server rendered for SEO.
 */
import type { Money } from "@gberg/product-schema";
import { formatMoney } from "@/lib/format";

export interface PriceBlockProps {
  price: Money;
  compareAtPrice?: Money | null;
  locale: string;
  vatNote?: string;
}

export function PriceBlock({ price, compareAtPrice, locale, vatNote }: PriceBlockProps) {
  const hasDiscount =
    compareAtPrice && Number(compareAtPrice.amount) > Number(price.amount);
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold tracking-tight">
          {formatMoney(price, locale)}
        </span>
        {hasDiscount ? (
          <span className="text-base text-[var(--color-text-muted)] line-through">
            {formatMoney(compareAtPrice, locale)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        {vatNote ?? "Incl. VAT, excl. shipping"}
      </p>
    </div>
  );
}
