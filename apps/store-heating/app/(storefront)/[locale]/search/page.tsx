/**
 * /[locale]/search?q=… — full search results.
 *
 * Server component. Reads `q` from search params and renders matching
 * products via Storefront API `search(query, types: [PRODUCT])`. The
 * predictiveSearch surface is wired into the header overlay client-side
 * (components/header-search.tsx), not this route.
 *
 * SEO note: this is `dynamic = "force-dynamic"` because the result set
 * depends on the query string. The `q` param is reflected in the page
 * title so each query gets a unique-ish title even without crawlable links.
 */
import type { Metadata } from "next";
import { Breadcrumb, Eyebrow } from "@gberg/ui";
import { ProductGrid } from "@/components/plp/product-grid";
import { fetchSearchResults } from "@/lib/queries";
import { localeHref } from "@/lib/href";
import { SearchInput } from "@/components/search/search-input";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : Array.isArray(sp.q) ? sp.q[0] : "";
  return {
    title: q ? `Search · ${q}` : "Search",
    description: q
      ? `Results for "${q}" across the G-Berg catalogue.`
      : "Search radiators, towel rails, underfloor systems and accessories.",
    robots: { index: false, follow: true },
  };
}

export default async function SearchResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const results = q ? await fetchSearchResults(q, locale, 48) : { totalCount: 0, products: [] };

  return (
    <div className="container-x py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: "Home", href: localeHref(locale, "/") },
          { label: "Search" },
        ]}
        className="mb-6"
      />

      <header className="max-w-3xl">
        <Eyebrow>
          <span className="section-number">00 /</span>Search
        </Eyebrow>
        <h1 className="display-heading mt-4 text-[clamp(2rem,3vw+0.75rem,3.5rem)] text-[var(--color-text)]">
          {q ? (
            <>
              Results for{" "}
              <em className="italic text-[var(--color-primary)]">&ldquo;{q}&rdquo;</em>.
            </>
          ) : (
            <>What are you looking for?</>
          )}
        </h1>
        <span
          aria-hidden
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />

        <div className="mt-6 max-w-xl">
          <SearchInput locale={locale} initialQuery={q} variant="page" />
        </div>

        {q ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            {results.totalCount} match{results.totalCount === 1 ? "" : "es"}
          </p>
        ) : null}
      </header>

      <div className="mt-10">
        {q && results.products.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
            No products match &ldquo;{q}&rdquo;. Try a series name (Astoria,
            Elanor, Konrad), a dimension (e.g. <code>1800x600</code>), or a
            room (bathroom, living room).
          </div>
        ) : null}
        {q && results.products.length > 0 ? (
          <ProductGrid products={results.products} locale={locale} />
        ) : null}
      </div>
    </div>
  );
}
