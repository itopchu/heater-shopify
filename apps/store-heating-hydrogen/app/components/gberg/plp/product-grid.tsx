/**
 * Premium-density product grid. Hydrogen port.
 */
import type {HeatingProduct} from '@gberg/product-schema';
import {ProductCard} from '~/components/gberg/product-card';
import {useT} from '~/lib/gberg/i18n';

export interface ProductGridProps {
  products: HeatingProduct[];
  locale: string;
  emptyMessage?: string;
}

export function ProductGrid({products, locale, emptyMessage}: ProductGridProps) {
  const t = useT();
  if (!products?.length) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
        {emptyMessage ?? t('plp.empty_grid_default')}
      </div>
    );
  }
  return (
    <ul className="product-grid">
      {products.map((p, i) => (
        <li key={p.id}>
          {/* First 2 cards are above-the-fold on mobile (≤2 per row).
              Mark them priority so the LCP image isn't deprioritised by
              the default lazy-loading on the rest of the grid. */}
          <ProductCard product={p} locale={locale} priority={i < 2} />
        </li>
      ))}
    </ul>
  );
}
