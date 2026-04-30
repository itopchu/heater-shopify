/**
 * /[locale]/products — shop-all catalogue route.
 *
 * Replaces the (incorrect) /collections/all link, since `all` is NOT a real
 * Shopify collection — Shopify does not auto-create it. We list every
 * product in the catalogue here, paginated 24 per page, with the same
 * filter/sort shell as the per-category PLP.
 *
 * Pagination is cursor-based (Storefront API), surfaced as ?after=<cursor>.
 * Server-rendered for SEO; client-side filter/sort lives in CollectionView.
 */
import type { Metadata } from "next";
import { Breadcrumb, Eyebrow } from "@gberg/ui";
import { CollectionView } from "@/components/plp/collection-view";
import { fetchAllProducts } from "@/lib/queries";
import { localeHref } from "@/lib/href";

export const dynamic = "force-static";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Shop all radiators",
  description:
    "Every G-Berg radiator, towel rail, electric heater and underfloor system in one place. Filter by series, dimensions, colour and heat-pump compatibility.",
};

export default async function ShopAllPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Fetch up to 60 — covers the current 47-product catalogue without paging.
  // When the catalogue grows past ~50 items, switch to ?after= cursor links.
  const result = await fetchAllProducts(locale, { first: 60, sortKey: "BEST_SELLING" });
  const products = result.products;

  return (
    <div className="container-x py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: "Home", href: localeHref(locale, "/") },
          { label: "Shop all" },
        ]}
        className="mb-6"
      />

      <header className="max-w-3xl">
        <Eyebrow>
          <span className="section-number">00 /</span>Catalogue
        </Eyebrow>
        <h1 className="display-heading mt-4 text-[clamp(2.25rem,4vw+0.5rem,4rem)] text-[var(--color-text)]">
          Shop all <em className="italic text-[var(--color-primary)]">radiators</em>.
        </h1>
        <span
          aria-hidden
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />
        <p className="mt-5 text-[var(--color-text-muted)]">
          Every product across every category — filter by series, dimensions,
          colour and heat-pump compatibility.
        </p>
      </header>

      {products.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
          No products yet. Check back once the catalogue sync runs.
        </div>
      ) : (
        <CollectionView products={products} locale={locale} />
      )}
    </div>
  );
}
