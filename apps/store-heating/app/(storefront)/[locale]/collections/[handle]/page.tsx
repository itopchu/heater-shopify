/**
 * Heating collection page (PLP).
 * Wireframe ref: shop/02_wireframes_page_blueprints.md "Heating collection page".
 *
 * Above-the-fold: breadcrumbs, title, intro — server-rendered.
 * Filter sidebar + sort + product grid + sub-category chips live in
 * `<CollectionView>` (client) so faceting is interactive without round-trips.
 * Sub-category chips are now derived from the actual product set per Fix 6
 * (no more hardcoded "All / Vertical / Panel" chip row that links nowhere).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb, Eyebrow } from "@gberg/ui";
import { CollectionView } from "@/components/plp/collection-view";
import { fetchCollectionByHandle } from "@/lib/queries";
import { localeHref } from "@/lib/href";

export const dynamic = "force-static";
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const { handle, locale } = await params;
  const col = await fetchCollectionByHandle(handle, locale, 1).catch(() => null);
  if (!col) return { title: handle };
  return {
    title: col.seo?.title ?? col.title,
    description: col.seo?.description ?? col.description,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const col = await fetchCollectionByHandle(handle, locale, 48);

  if (!col) {
    if (process.env.SHOPIFY_STOREFRONT_TOKEN) notFound();
  }

  const title = col?.title ?? unkebab(handle);
  const description = col?.description ?? "";
  const products = col?.products ?? [];

  return (
    <div className="container-x py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: "Home", href: localeHref(locale, "/") },
          { label: title },
        ]}
        className="mb-6"
      />

      <header className="max-w-3xl">
        <Eyebrow>Collection</Eyebrow>
        <h1 className="display-heading mt-4 text-[clamp(2.25rem,4vw+0.5rem,4rem)] text-[var(--color-text)]">
          {title}
        </h1>
        <span
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
          aria-hidden
        />
        {description ? (
          <div
            className="mt-5 leading-relaxed text-[var(--color-text-muted)]"
            dangerouslySetInnerHTML={{ __html: col?.descriptionHtml || description }}
          />
        ) : (
          <p className="mt-5 text-[var(--color-text-muted)]">
            CE-certified European radiators selected for performance, durability and clean
            integration with modern heating systems.
          </p>
        )}
      </header>

      {products.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
          {!col
            ? "Shopify Storefront API is not configured. See apps/store-heating/.env.local.example."
            : "No products in this collection yet."}
        </div>
      ) : (
        <CollectionView products={products} locale={locale} />
      )}

      {/* Lower content — SEO/intro/FAQ blocks come later */}
      <section className="mt-16 max-w-3xl">
        <Eyebrow>About this category</Eyebrow>
        <p className="mt-3 text-[var(--color-text-muted)]">
          We test every radiator against EN 442 output ratings and pair each listing with
          installer-grade specs: pipe spacing, connection type, max pressure and certified
          heat output. Use the filters above to narrow by dimension or compatibility.
        </p>
      </section>
    </div>
  );
}

function unkebab(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
