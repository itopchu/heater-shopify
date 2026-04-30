/**
 * /[locale]/news — editorial / news index.
 * Wireframe ref: shop/02_wireframes_page_blueprints.md "Guides / Editorial".
 *
 * Server component. Fetches the most recent articles from the Shopify
 * `news` blog (with a fallback to "blog", "journal", "editorial" handles),
 * and renders an editorial 3-column card grid.
 *
 * If no articles exist (the most likely state during initial seeding) we
 * render a clearly-marked "Editorial coming soon" surface with 6
 * placeholder cards and a CTA pointing at the existing newsletter
 * section. We deliberately do NOT generate fake article links — the
 * placeholder cards are non-interactive.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumb, Eyebrow } from "@gberg/ui";
import { fetchBlog } from "@/lib/queries";
import { localeHref } from "@/lib/href";
import { NewsletterForm } from "@/components/newsletter-form";

export const dynamic = "force-static";
export const revalidate = 900;

export const metadata: Metadata = {
  title: "News & guides",
  description:
    "Editorial pieces from G-Berg — install guides, sizing notes, product launches and EU heating regulation updates.",
};

const PLACEHOLDER_CARDS = [
  {
    eyebrow: "Install guide",
    title: "How to size a radiator without guesswork",
  },
  {
    eyebrow: "Heat-pump",
    title: "Why low-temperature output ratings matter in 2026",
  },
  {
    eyebrow: "Series spotlight",
    title: "Astoria — 100 years of vertical column radiators",
  },
  {
    eyebrow: "EU regulation",
    title: "What the new ecodesign rules mean for your project",
  },
  {
    eyebrow: "Bathroom",
    title: "Towel radiators that don't sacrifice heat output",
  },
  {
    eyebrow: "Replacement",
    title: "Match your existing pipe spacing in 60 seconds",
  },
];

export default async function NewsIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const blog = await fetchBlog(locale, { first: 12 });
  const articles = blog?.articles ?? [];

  return (
    <div className="container-x py-10 lg:py-16">
      <Breadcrumb
        items={[
          { label: "Home", href: localeHref(locale, "/") },
          { label: blog?.blogTitle ?? "News" },
        ]}
        className="mb-6"
      />

      <header className="max-w-3xl">
        <Eyebrow>
          <span className="section-number">07 /</span>News &amp; guides
        </Eyebrow>
        <h1 className="display-heading mt-4 text-[clamp(2.25rem,4vw+0.5rem,4rem)] text-[var(--color-text)]">
          {articles.length > 0 ? (
            <>Editorial from the engineering room.</>
          ) : (
            <>Editorial <em className="italic text-[var(--color-primary)]">coming soon</em>.</>
          )}
        </h1>
        <span
          aria-hidden
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />
        <p className="mt-5 max-w-[60ch] text-[var(--color-text-muted)]">
          {articles.length > 0
            ? "Sizing notes, install guides and product launches written by the engineers who specify the catalogue."
            : "We're writing install guides, sizing notes and EU regulation updates. Sign up for the newsletter and we'll send the first issue when it's ready."}
        </p>
      </header>

      {articles.length > 0 ? (
        <ul className="mt-12 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a, i) => (
            <li key={a.id} className="group flex flex-col">
              <div className="relative aspect-[4/5] overflow-hidden bg-[var(--color-surface-muted)]">
                {a.image ? (
                  <Image
                    src={a.image.url}
                    alt={a.image.altText ?? a.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    priority={i < 3}
                  />
                ) : null}
              </div>
              <div className="mt-5 flex flex-1 flex-col gap-3 border-t border-[var(--color-border)] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  {String(i + 1).padStart(2, "0")} ·{" "}
                  {new Date(a.publishedAt).toLocaleDateString(locale, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <h2 className="font-[var(--font-display)] text-2xl italic leading-tight">
                  {a.title}
                </h2>
                {a.excerpt ? (
                  <p className="text-sm text-[var(--color-text-muted)]">{a.excerpt}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul
            aria-label="Coming soon — placeholder cards"
            className="mt-12 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
          >
            {PLACEHOLDER_CARDS.map((c, i) => (
              <li
                key={c.title}
                className="flex flex-col opacity-90"
                aria-disabled
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-[var(--color-surface-muted)]">
                  <div className="grid h-full place-items-center px-8 text-center font-[var(--font-display)] text-2xl italic leading-tight text-[var(--color-text-muted)]">
                    {c.eyebrow}
                  </div>
                </div>
                <div className="mt-5 flex flex-1 flex-col gap-3 border-t border-[var(--color-border)] pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    {String(i + 1).padStart(2, "0")} · Coming soon
                  </p>
                  <h2 className="font-[var(--font-display)] text-2xl italic leading-tight text-[var(--color-text)]">
                    {c.title}
                  </h2>
                  <p className="mt-auto text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    Sign up below — we&rsquo;ll email when it&rsquo;s live.
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <aside className="mt-16 grid grid-cols-1 items-end gap-8 border-t border-[var(--color-border)] pt-10 md:grid-cols-[1.4fr_1fr] md:gap-12">
            <div>
              <Eyebrow>
                <span className="section-number">08 /</span>Stay in the loop
              </Eyebrow>
              <p className="display-heading mt-5 text-[clamp(1.5rem,2vw+0.5rem,2.25rem)] text-[var(--color-text)]">
                One email when the first guide ships.
              </p>
            </div>
            <NewsletterForm />
          </aside>
        </>
      )}
    </div>
  );
}
