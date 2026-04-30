/**
 * Generic Shopify Online Store Page renderer with merchant-aware fallback.
 * Wireframe ref: shop/02_wireframes_page_blueprints.md "Static info pages".
 *
 * Resolution order:
 *   1. Real Shopify Page with this handle  → render its body (HTML).
 *   2. Slug is in the FALLBACK_HANDLES set → render placeholder content
 *      (about / contact / imprint / privacy / terms / shipping / returns /
 *       warranty / faq / guides). HTTP 200, NOT 404 — the store needs these
 *      surfaces present from day one even if the merchant hasn't filled them
 *      out yet.
 *   3. Otherwise → notFound().
 *
 * The fallback content is i18n-translated via lib/page-fallbacks.ts. It
 * includes a clearly-marked "merchant-editable" comment so QA notices the
 * stub. As soon as a Shopify Page with the same handle is published, the
 * route prefers the real content automatically.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb, Eyebrow } from "@gberg/ui";
import { fetchPageByHandle } from "@/lib/queries";
import { localeHref } from "@/lib/href";
import {
  getPageFallback,
  isFallbackHandle,
  type PageFallback,
  type PageFallbackHandle,
} from "@/lib/page-fallbacks";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-static";
export const revalidate = 600;

interface ResolvedPage {
  source: "shopify" | "fallback";
  title: string;
  intro?: string;
  bodyHtml?: string;
  bodyText?: string;
  seo?: { title: string | null; description: string | null } | null;
}

async function resolvePage(slug: string, locale: string): Promise<ResolvedPage | null> {
  const live = await fetchPageByHandle(slug, locale).catch(() => null);
  if (live) {
    return {
      source: "shopify",
      title: live.title,
      bodyHtml: live.body,
      seo: live.seo,
    };
  }
  if (isFallbackHandle(slug)) {
    const fallback: PageFallback = getPageFallback(
      slug as PageFallbackHandle,
      normalizeLocale(locale),
    );
    return {
      source: "fallback",
      title: fallback.title,
      intro: fallback.intro,
      bodyText: fallback.body,
    };
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const page = await resolvePage(slug, locale);
  if (!page) return { title: slug };
  return {
    title: page.seo?.title ?? page.title,
    description: page.seo?.description ?? page.intro,
  };
}

export default async function PageRoute({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const page = await resolvePage(slug, locale);
  if (!page) notFound();

  return (
    <article className="container-x py-10 lg:py-16">
      <Breadcrumb
        items={[
          { label: "Home", href: localeHref(locale, "/") },
          { label: page.title },
        ]}
        className="mb-6"
      />

      <header className="max-w-3xl border-b border-[var(--color-border)] pb-8">
        <Eyebrow>Information</Eyebrow>
        {/*
          Title in Fraunces display per spec ("title in Fraunces display,
          intro paragraph in Inter regular, then the body").
        */}
        <h1 className="display-heading mt-3 text-[clamp(2rem,3vw+1rem,3.25rem)] text-[var(--color-text)]">
          {page.title}
        </h1>
        {page.intro ? (
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-[var(--color-text-muted)]">
            {page.intro}
          </p>
        ) : null}
        <span
          aria-hidden
          className="mt-6 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />
      </header>

      {/*
        Merchant-editable note: the placeholder body below is rendered ONLY
        when no Shopify Page with this handle exists. The moment the merchant
        publishes a Page with handle="${slug}" in Shopify Admin → Online
        Store → Pages, this route prefers the live content automatically.
      */}
      {page.source === "fallback" ? (
        <div className="prose prose-neutral mt-8 max-w-3xl text-[var(--color-text)] leading-relaxed [&_a]:text-[var(--color-primary)] [&_a:hover]:text-[var(--color-primary-hover)]">
          {(page.bodyText ?? "").split(/\n\n+/).map((para, i) => (
            <p key={i} className="mt-4 first:mt-0">
              {para}
            </p>
          ))}
          <aside
            aria-hidden="false"
            className="mt-10 border-l-2 border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-5 py-3 text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
          >
            Placeholder copy. A merchant can publish the live version in
            Shopify Admin → Online Store → Pages.
          </aside>
        </div>
      ) : (
        <div
          className="prose prose-neutral mt-8 max-w-3xl text-[var(--color-text)] leading-relaxed [&_a]:text-[var(--color-primary)] [&_a:hover]:text-[var(--color-primary-hover)] [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1"
          dangerouslySetInnerHTML={{ __html: page.bodyHtml ?? "" }}
        />
      )}
    </article>
  );
}
