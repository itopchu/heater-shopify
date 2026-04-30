/**
 * Server component. Premium-density product grid.
 *
 * Column counts and gutters per fix-spec §7:
 *   - Mobile (<640px):    2 cols, 8px gutter (1px hairline visual)
 *   - Tablet (640–1024):  3 cols, 12px gutter
 *   - Desktop (>1024):    4 cols, 16px gutter
 *   - Wide (>1440):       4 cols, 24px gutter (we deliberately do NOT go to
 *                                                5-up — premium catalogues hold
 *                                                4-up at all sizes)
 *
 * The product card itself enforces a strict 4:5 aspect on the image area
 * with a hairline 1px outline (`#ECECEC`); see component/product-card.tsx
 * and the `.card-edit` rules in globals.css.
 *
 * This component replaces the simpler `<ProductGrid>` shell that lived in
 * `components/product-grid.tsx`. The legacy file re-exports this one to keep
 * older imports working.
 */
import type { HeatingProduct } from "@gberg/product-schema";
import { ProductCard } from "@/components/product-card";

export interface ProductGridProps {
  products: HeatingProduct[];
  locale: string;
  /** Optional message when products list is empty. */
  emptyMessage?: string;
}

export function ProductGrid({ products, locale, emptyMessage }: ProductGridProps) {
  if (!products?.length) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
        {emptyMessage ?? "No products to show yet."}
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
