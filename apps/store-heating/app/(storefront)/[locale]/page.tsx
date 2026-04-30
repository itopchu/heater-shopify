/**
 * Homepage — heating storefront.
 * Section order per spec shop/02_wireframes_page_blueprints.md "STORE A — HEATING".
 *
 * Server component. Critical content (hero, category cards, FAQs, intro copy)
 * is server-rendered for SEO per the master execution prompt non-negotiables.
 *
 * Visual brief — premium-but-dense (G-Berg):
 *   - Magazine-cover Fraunces italic H1 (no SaaS sans hero).
 *   - Numbered red eyebrows ("01 / SHOP BY ROOM") on every section.
 *   - Real product imagery sourced from Shopify per category card (no SVG /
 *     emoji placeholders), asymmetric 12-column grid (5/4/3 spans rather
 *     than equal 3×2).
 *   - Editorial split block ("Designed in Germany / Made for Europe") sits
 *     between sections as a "living" beat instead of more whitespace.
 *   - Section padding stays moderate (py-16) — rhythm comes from rules,
 *     numbered eyebrows, mixed scales, NOT extra whitespace.
 */
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button, Eyebrow, FaqAccordion, type FaqItem } from "@gberg/ui";
import { ProductGrid } from "@/components/plp/product-grid";
import { NewsletterForm } from "@/components/newsletter-form";
import { fetchBestsellers, fetchCategoryPreviews } from "@/lib/queries";
import { isShopifyConfigured } from "@/lib/shopify";
import { localeHref } from "@/lib/href";

export const dynamic = "force-static";
export const revalidate = 600;

/**
 * Curated 6 highest-value categories. Handles match the live Shopify store
 * (verified against agent/sync seed output). Override the `label` per
 * locale once the merchant copy lands in Translate & Adapt.
 */
const CATEGORY_HANDLES: { handle: string; label: string }[] = [
  { handle: "wohnraumheizkoerper", label: "Living rooms" },
  { handle: "badheizkoerper", label: "Bathroom" },
  { handle: "badheizkoerper-elektrisch", label: "Electric" },
  { handle: "austauschheizkoerper", label: "Replacement" },
  { handle: "fussbodenheizung", label: "Underfloor" },
  { handle: "zubehoer", label: "Accessories" },
];

/**
 * Fix 10 — replaced asymmetric 5/4/3/4/3/5 grid with a uniform 3×2 grid
 * (Option B from the brief). The asymmetric pattern looked clever in
 * isolation but the row-2 cards collapsed to ~3-column slivers on tablet
 * and the rhythm felt arbitrary, not editorial. A uniform grid with
 * hairline gutters + consistent 4:5 aspect + numbered red eyebrows reads
 * like a proper magazine contact sheet.
 *
 * We considered Option A (1 large + 5 small) but the photography sourced
 * via fetchCategoryPreviews uses each collection's first product image.
 * No single category has dramatically better imagery to justify the 7-col
 * feature treatment, so Option B wins. Revisit if the merchant uploads
 * dedicated lifestyle photos per category.
 */

const GUIDED_FINDER = [
  { label: "Replace existing", desc: "Match dimensions and connections in 60 seconds.", href: "/pages/guides" },
  { label: "Shop by dimensions", desc: "Width, height, depth — narrow it down.", href: "/pages/guides" },
  { label: "Shop by room", desc: "Living room, bathroom, hallway and more.", href: "/pages/guides" },
  { label: "Heat-pump compatible", desc: "Low-temperature radiators only.", href: "/pages/guides" },
];

const WHY_US = [
  { label: "Free EU delivery over €500", icon: "→" },
  { label: "30-day returns", icon: "↺" },
  { label: "Engineering support", icon: "✦" },
  { label: "10-year warranty", icon: "✓" },
];

const HOMEPAGE_FAQS: FaqItem[] = [
  {
    question: "Do you ship across Europe?",
    answer:
      "Yes — we deliver to Germany, Belgium, Spain, Austria, the Netherlands and other EU countries. Free shipping over €500.",
  },
  {
    question: "Are your radiators heat-pump compatible?",
    answer:
      "Many of them are. Look for the 'Heat-pump ready' badge on product cards or filter by heat-pump compatibility on collection pages.",
  },
  {
    question: "What's your return policy?",
    answer:
      "30-day returns on unused, unopened items. Bespoke orders are non-refundable — we'll tell you clearly before checkout.",
  },
];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const handles = CATEGORY_HANDLES.map((c) => c.handle);
  const [bestsellers, categoryPreviews] = await Promise.all([
    fetchBestsellers(locale, 8),
    fetchCategoryPreviews(handles, locale),
  ]);

  // Drop categories that have no products (rather than rendering empty cards).
  const categories = CATEGORY_HANDLES
    .map((c) => {
      const preview = categoryPreviews.find((p) => p.handle === c.handle);
      return { ...c, preview };
    })
    .filter((c) => !c.preview || c.preview.image || c.preview.productCount > 0);

  // Editorial split block uses the first bestseller image as a "lifestyle"
  // backdrop. Keeps the page entirely image-driven without bespoke uploads.
  const editorialImage =
    bestsellers[0]?.featuredImage ??
    categoryPreviews.find((p) => p.image)?.image ??
    null;

  return (
    <>
      {/* ====================================================== */}
      {/* Section 1 — HERO  (60/40 asymmetric, Fraunces magazine)  */}
      {/* ====================================================== */}
      <section className="bg-[var(--color-surface)]">
        <div className="container-x grid grid-cols-1 items-end gap-10 py-14 md:py-16 lg:grid-cols-[1.5fr_1fr] lg:gap-16 lg:py-20">
          <div>
            <Eyebrow>
              <span className="section-number">00 /</span>European radiators
            </Eyebrow>
            <h1 className="display-heading mt-5 text-[clamp(3rem,7vw+0.5rem,7.5rem)] text-[var(--color-text)]">
              The right radiator,
              <br />
              <span className="text-[var(--color-primary)]">without the guesswork.</span>
            </h1>
            <p className="mt-7 max-w-[52ch] text-[var(--color-text-muted)] text-base md:text-lg">
              Hundreds of CE-certified radiators with full specs, compatibility
              notes and engineering support. Designed in Germany, made for Europe.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={localeHref(locale, "/collections/wohnraumheizkoerper")}>
                <Button size="lg">Shop radiators</Button>
              </Link>
              <Link href={localeHref(locale, "/pages/guides")}>
                <Button size="lg" variant="secondary">
                  Find the right one
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-surface-muted)] lg:aspect-[3/4]">
            {editorialImage ? (
              <Image
                src={editorialImage.url}
                alt={editorialImage.altText ?? "G-Berg radiator"}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-[var(--color-text-muted)]">
                Hero image
              </div>
            )}
            {/* Subtle red rule top-left of hero image — anchors brand corner. */}
            <span
              aria-hidden
              className="absolute left-0 top-0 h-[2px] w-12 bg-[var(--color-primary)]"
            />
            <span
              aria-hidden
              className="absolute left-0 top-0 h-12 w-[2px] bg-[var(--color-primary)]"
            />
          </div>
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* ====================================================== */}
      {/* Section 2 — SHOP BY CATEGORY  (asymmetric 12-col grid)   */}
      {/* ====================================================== */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          number="01"
          eyebrow="Shop by room"
          title={
            <>
              Find what fits <em className="font-[var(--font-display)] italic text-[var(--color-primary)]">your</em> space.
            </>
          }
          description="Each category includes filters tuned to how heating engineers actually shop."
        />
        {/*
          Fix 10 — uniform 3×2 grid (Option B). Equal aspect ratios (4:5),
          1px hairline gutters via the `gap-px` + bg-border trick, no
          rounded corners. Numbered red eyebrow + Fraunces italic name +
          chevron arrow under the gradient overlay. Hover scales the image
          1.05 over 600ms; the chevron translates +6px right.
        */}
        <ul className="mt-10 grid grid-cols-1 gap-px bg-[var(--color-border)] sm:grid-cols-2 md:grid-cols-3">
          {categories.map((c, idx) => (
            <li key={c.handle} className="bg-[var(--color-surface)]">
              <Link
                href={localeHref(locale, `/collections/${c.handle}`)}
                className="group relative block aspect-[4/5] overflow-hidden"
              >
                {c.preview?.image ? (
                  <Image
                    src={c.preview.image.url}
                    alt={c.preview.image.altText ?? c.label}
                    fill
                    priority={idx === 0}
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                    className="object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-muted)] font-[var(--font-display)] text-3xl italic text-[var(--color-text-muted)]">
                    {c.label}
                  </div>
                )}
                {/* Charcoal gradient overlay — bottom 40% at 0.6 opacity → 0. */}
                <div
                  className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#111111]/60 to-transparent"
                  aria-hidden
                />
                {/* Card label */}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white md:p-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                      {String(idx + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-1.5 font-[var(--font-display)] text-2xl italic leading-tight md:text-3xl">
                      {c.label}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-2xl text-white transition-transform duration-300 ease-out group-hover:translate-x-[6px]"
                  >
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* ====================================================== */}
      {/* Section 3 — EDITORIAL SPLIT  (designed-in-germany beat)  */}
      {/* ====================================================== */}
      <section className="bg-[var(--color-surface-muted)]">
        <div className="container-x grid grid-cols-1 gap-0 md:grid-cols-12 md:items-stretch">
          <div className="relative aspect-[4/5] md:col-span-7 md:aspect-auto md:min-h-[480px]">
            {editorialImage ? (
              <Image
                src={editorialImage.url}
                alt={editorialImage.altText ?? ""}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                Editorial image
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center p-10 md:col-span-5 md:p-14">
            <Eyebrow>
              <span className="section-number">02 /</span>Designed in Germany
            </Eyebrow>
            <p className="display-heading mt-5 text-[clamp(2rem,3vw+1rem,3.75rem)] text-[var(--color-text)]">
              Built like
              <br />
              furniture, sized
              <br />
              for <span className="text-[var(--color-primary)]">every wall.</span>
            </p>
            <p className="mt-6 max-w-[42ch] text-[var(--color-text-muted)]">
              Eight design series — Astoria, Elanor, Flora, Pullman, Twister, Konrad,
              Platis, Lavinno — across three studio colorways. Sculptural objects
              first, heaters second.
            </p>
            <div className="mt-8">
              <Link href={localeHref(locale, "/collections/wohnraumheizkoerper")}>
                <Button size="md" variant="secondary">
                  Browse the catalog
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* ====================================================== */}
      {/* Section 4 — BESTSELLERS  (peek-next-card horizontal)     */}
      {/* ====================================================== */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          number="03"
          eyebrow="Bestsellers"
          title={
            <>
              Loved by installers <em className="font-[var(--font-display)] italic text-[var(--color-primary)]">&amp;</em> homeowners.
            </>
          }
        />
        <div className="mt-10">
          {bestsellers.length > 0 ? (
            <ProductGrid products={bestsellers.slice(0, 8)} locale={locale} />
          ) : (
            <EmptyShopify configured={isShopifyConfigured()} />
          )}
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* ====================================================== */}
      {/* Section 5 — GUIDED FINDER                                 */}
      {/* ====================================================== */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          number="04"
          eyebrow="Guided finder"
          title={<>Tell us what you need.</>}
        />
        <ul className="mt-10 grid grid-cols-1 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {GUIDED_FINDER.map((g, i) => (
            <li key={`${g.label}-${i}`}>
              <Link
                href={localeHref(locale, g.href)}
                className="group relative block px-6 py-8 transition-colors hover:bg-[var(--color-surface-muted)] md:px-8 md:py-10"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-3 font-[var(--font-display)] text-2xl italic leading-tight">
                  {g.label}
                </p>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">{g.desc}</p>
                <p className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]">
                  <span>Start</span>
                  <span aria-hidden className="text-[var(--color-primary)]">→</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* ====================================================== */}
      {/* Section 6 — TRUST STRIP  (charcoal inverse, tight)        */}
      {/* ====================================================== */}
      <section className="bg-[var(--color-surface-inverse)] text-[var(--color-text-inverse)]">
        <ul className="container-x grid grid-cols-2 gap-px py-10 md:grid-cols-4">
          {WHY_US.map((w) => (
            <li key={w.label} className="flex items-center gap-4 px-2 md:px-4">
              <span aria-hidden className="text-2xl text-[var(--color-primary)]">
                {w.icon}
              </span>
              <span className="text-sm font-medium tracking-tight">{w.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ====================================================== */}
      {/* Section 7 — FAQ  (dense accordion, full-bleed rules)     */}
      {/* ====================================================== */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          number="05"
          eyebrow="FAQ"
          title={<>Common questions.</>}
        />
        <div className="mt-8 max-w-3xl">
          <FaqAccordion items={HOMEPAGE_FAQS} />
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* ====================================================== */}
      {/* Section 8 — NEWSLETTER  (single-row inline form)         */}
      {/* ====================================================== */}
      <section className="container-x py-14 md:py-16">
        <div className="grid grid-cols-1 items-end gap-8 md:grid-cols-[1.4fr_1fr] md:gap-12">
          <div>
            <Eyebrow>
              <span className="section-number">06 /</span>Stay in the loop
            </Eyebrow>
            <p className="display-heading mt-5 text-[clamp(1.875rem,3vw+0.5rem,3rem)] text-[var(--color-text)]">
              New arrivals, install
              <br />
              guides, EU&#8209;only deals.
            </p>
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Roughly one email a month. Unsubscribe whenever.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

function SectionHeader({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string;
  eyebrow: string;
  title: ReactNode;
  description?: string;
}) {
  return (
    <header className="max-w-3xl">
      <Eyebrow>
        <span className="section-number">{number} /</span>
        {eyebrow}
      </Eyebrow>
      <h2 className="display-heading mt-4 text-[clamp(2rem,3vw+1rem,3.5rem)] leading-[1] text-[var(--color-text)]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 max-w-[55ch] text-[var(--color-text-muted)]">{description}</p>
      ) : null}
      <span className="mt-6 inline-block h-[2px] w-12 bg-[var(--color-primary)]" aria-hidden />
    </header>
  );
}

function EmptyShopify({ configured }: { configured: boolean }) {
  return (
    <div className="border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
      {configured ? (
        <p>Bestsellers will appear here once products are tagged.</p>
      ) : (
        <p>
          Shopify Storefront API isn&apos;t configured yet. See{" "}
          <code>apps/store-heating/.env.local.example</code>.
        </p>
      )}
    </div>
  );
}
