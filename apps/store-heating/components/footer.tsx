/**
 * Server component. Site footer.
 * Spec ref: shop/02_wireframes_page_blueprints.md "Footer".
 *
 * Brand treatment: charcoal background, white type, large Fraunces wordmark,
 * red horizontal hairlines between column groups, single-row newsletter
 * input with a borderless field + 2px charcoal bottom-rule (premium tailoring
 * detail).
 *
 * Internal href hygiene: every link goes through `localeHref` so we never
 * leak a locale-less URL. Page links target Shopify handles via the new
 * /pages/[slug] route — the route renders notFound() if the page doesn't
 * exist yet, which is the correct behaviour vs. the old silent break.
 */
import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";
import { localeHref } from "@/lib/href";

export function Footer({ locale }: { locale: string }) {
  const cs = [
    { label: "Contact", href: localeHref(locale, "/pages/contact") },
    { label: "FAQ", href: localeHref(locale, "/pages/faq") },
    { label: "Buying guides", href: localeHref(locale, "/pages/guides") },
    { label: "Engineering support", href: "mailto:hello@gberg-heizung.de" },
  ];
  const ship = [
    { label: "Shipping & delivery", href: localeHref(locale, "/pages/shipping") },
    { label: "Returns", href: localeHref(locale, "/pages/returns") },
    { label: "Warranty", href: localeHref(locale, "/pages/warranty") },
  ];
  const legal = [
    { label: "Imprint", href: localeHref(locale, "/pages/imprint") },
    { label: "Privacy", href: localeHref(locale, "/pages/privacy") },
    { label: "Terms", href: localeHref(locale, "/pages/terms") },
  ];

  return (
    <footer className="mt-16 bg-[var(--color-surface-inverse)] text-[var(--color-text-inverse)]">
      {/* Newsletter strap — single-row inline form, borderless input with bottom rule. */}
      <div className="border-b border-white/15">
        <div className="container-x grid gap-6 py-10 md:grid-cols-[1.4fr_1fr] md:items-end md:gap-12">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Stay in the loop
            </p>
            <p className="mt-3 font-[var(--font-display)] text-3xl italic leading-[1] md:text-4xl">
              New arrivals, install guides, EU&#8209;only deals.
            </p>
          </div>
          <NewsletterForm dark />
        </div>
      </div>

      {/* Top columns — charcoal bg, white type, red column rules. */}
      <div className="container-x grid grid-cols-1 gap-10 py-14 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-4">
          <p className="font-[var(--font-display)] text-5xl font-semibold leading-none md:text-6xl">
            G&#8209;Berg
          </p>
          <p className="mt-5 max-w-[28ch] text-sm text-white/70">
            Authorized regional reseller of premium European radiators and
            bathroom heating. Designed in Germany, made for Europe.
          </p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[var(--color-primary)]">
            G-Berg GmbH
          </p>
        </div>
        <FooterColumn title="Customer service" items={cs} />
        <FooterColumn title="Shipping & returns" items={ship} />
        <FooterColumn title="Legal" items={legal} />
      </div>

      {/* Red baseline rule. */}
      <div className="rule-accent-strong" aria-hidden />

      {/* Meta strap. */}
      <div>
        <div className="container-x flex flex-wrap items-center justify-between gap-4 py-5 text-[11px] uppercase tracking-[0.14em] text-white/55">
          <p>&copy; {new Date().getFullYear()} G-Berg GmbH</p>
          <p>Prices include local VAT, exclude shipping</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div className="md:col-span-2 md:relative md:before:absolute md:before:left-[-1rem] md:before:top-0 md:before:bottom-0 md:before:w-px md:before:bg-[var(--color-primary)]/30 lg:col-span-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
        {title}
      </p>
      <ul className="mt-5 space-y-3 text-sm">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="link-accent text-white/85 transition-colors hover:text-white"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
