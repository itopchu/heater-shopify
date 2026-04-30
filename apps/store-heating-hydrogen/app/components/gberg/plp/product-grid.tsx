/**
 * Premium-density product grid. Hydrogen port.
 */
import type {HeatingProduct} from '@gberg/product-schema';
import {ProductCard} from '~/components/gberg/product-card';

export interface ProductGridProps {
  products: HeatingProduct[];
  locale: string;
  emptyMessage?: string;
}

export function ProductGrid({products, locale, emptyMessage}: ProductGridProps) {
  if (!products?.length) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
        {emptyMessage ?? 'No products to show yet.'}
      </div>
    );
  }
  return (
    <ul className="product-grid">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
