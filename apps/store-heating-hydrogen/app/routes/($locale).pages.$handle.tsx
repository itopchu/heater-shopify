/**
 * Generic Shopify Online Store Page renderer with merchant-aware fallback.
 * Hydrogen port.
 */
import {useLoaderData, useParams} from 'react-router';
import type {Route} from './+types/pages.$handle';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchPageByHandle} from '~/lib/gberg/queries';
import {localeHref} from '~/lib/gberg/href';
import {
  getPageFallback,
  isFallbackHandle,
  type PageFallback,
  type PageFallbackHandle,
} from '~/lib/gberg/page-fallbacks';
import {normalizeLocale, useT} from '~/lib/gberg/i18n';
import {BRAND_NAME, buildSeoMeta} from '~/lib/gberg/seo';
import {buildBreadcrumbJsonLd} from '~/lib/gberg/jsonld';
import {JsonLd} from '~/components/gberg/json-ld';
import {ContactView} from '~/components/gberg/contact-view';

interface ResolvedPage {
  source: 'shopify' | 'fallback';
  title: string;
  intro?: string;
  bodyHtml?: string;
  bodyText?: string;
  seo?: {title: string | null; description: string | null} | null;
}

/**
 * EN-source SEO description floor per CMS handle. Used only when the
 * Shopify Admin SEO field is blank — once a merchant fills in the SEO
 * description in Online Store → Pages, that overrides this map.
 * Localisation flows through Translate & Adapt against the same Admin
 * field; we don't ship per-locale duplicates here.
 */
const PAGE_DESCRIPTION_FLOOR: Record<string, string> = {
  default:
    'Read official information from G-Berg, your authorised European partner for designer radiators, towel warmers and heating accessories.',
  contact:
    'Speak to a real G-Berg heating engineer. Email, phone or WhatsApp — we reply within two business hours and help you size, specify and order the right radiator the first time.',
  faq: 'Answers to the questions G-Berg customers ask most often: shipping to Germany, Belgium, Netherlands and the wider EU, returns, sizing, heat-pump compatibility and installation.',
  imprint:
    'Legal imprint for G-Berg GmbH (Impressum) — company details, registered office, managing director and contact information per German telemedia law.',
  privacy:
    'How G-Berg handles personal data, cookies and consent under GDPR. What we collect, why, how long we keep it and how to exercise your data rights.',
  returns:
    'G-Berg returns and refunds policy — 14-day right of withdrawal, what is and isn’t returnable, who pays the shipping and how the refund is processed.',
  shipping:
    'Shipping rates, lead times and tracking for G-Berg radiator orders to Germany, Belgium, Netherlands, France and the rest of the EU. Pallet vs parcel, taxes included.',
  terms:
    'G-Berg general terms and conditions of sale (AGB) — contract formation, payment, delivery, retention of title, warranty, returns and applicable law.',
  warranty:
    'G-Berg warranty terms for designer radiators, towel warmers and heating accessories. Coverage, claim procedure, exclusions and what proof of purchase you need.',
};

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {locale?: string; page?: ResolvedPage};
  location: {pathname: string};
}) => {
  const page = data?.page;
  const baseTitle = page?.seo?.title ?? page?.title ?? 'Page';
  const title = baseTitle.includes(BRAND_NAME)
    ? baseTitle
    : `${baseTitle} — ${BRAND_NAME}`;
  // Resolution order for the SEO description:
  //   1. Shopify Admin SEO description (merchant override)
  //   2. Page intro paragraph (on fallback pages)
  //   3. Per-handle EN floor shipped here
  //   4. Generic site description
  // The floor guarantees Lighthouse never flags `meta-description` even
  // when Admin/intro are blank. Merchants override per page via Shopify
  // Admin → Online Store → Pages → SEO; Translate & Adapt handles the
  // localised override.
  const pathname = location.pathname || '';
  const handleSlug = pathname.split('/').filter(Boolean).pop() ?? '';
  const description =
    page?.seo?.description ||
    page?.intro ||
    PAGE_DESCRIPTION_FLOOR[handleSlug] ||
    PAGE_DESCRIPTION_FLOOR.default;

  // BreadcrumbList JSON-LD is emitted from the component via <JsonLd>
  // (React Router drops `tagName:'script'` meta descriptors).
  return [
    {title},
    {name: 'description', content: description},
    ...buildSeoMeta({
      title,
      description,
      pathname: location.pathname,
      type: 'website',
    }),
  ];
};

export async function loader({context, params}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  const slug = params.handle;
  if (!slug) throw new Response('Not found', {status: 404});

  const client = createGbergClient(context.storefront);
  const live = await fetchPageByHandle(client, slug, locale);

  let page: ResolvedPage | null = null;
  if (live) {
    page = {
      source: 'shopify',
      title: live.title,
      bodyHtml: live.body,
      seo: live.seo,
    };
  } else if (isFallbackHandle(slug)) {
    const fb: PageFallback = getPageFallback(slug as PageFallbackHandle, locale);
    page = {
      source: 'fallback',
      title: fb.title,
      intro: fb.intro,
      bodyText: fb.body,
    };
  }

  if (!page) throw new Response('Not found', {status: 404});

  return {locale, page};
}

export default function PageRoute() {
  const {locale, page} = useLoaderData<typeof loader>();
  const params = useParams();
  const t = useT();

  // BreadcrumbList — Home → <visible page H1>. Rendered on both the
  // generic-page and the contact layouts.
  const jsonLd = [
    buildBreadcrumbJsonLd([
      {label: 'Home', href: `/${locale}`},
      {label: page.title},
    ]),
  ];

  // The contact page gets a structured layout instead of generic prose —
  // clearer channel-based grid, brief callout, full locale parity.
  if ((params as {handle?: string}).handle === 'contact') {
    return (
      <>
        <JsonLd items={jsonLd} />
        <ContactView />
      </>
    );
  }

  return (
    <article className="container-x py-10 lg:py-16">
      <JsonLd items={jsonLd} />
      <header className="max-w-3xl border-b border-[var(--color-border)] pb-8">
        <h1 className="display-heading text-[clamp(2rem,3vw+1rem,3.25rem)] text-[var(--color-text)]">
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

      {page.source === 'fallback' ? (
        <div className="prose prose-neutral mt-8 max-w-3xl text-[var(--color-text)] leading-relaxed [&_a]:text-[var(--color-primary)] [&_a:hover]:text-[var(--color-primary-hover)]">
          {(page.bodyText ?? '').split(/\n\n+/).map((para, i) => (
            <p key={i} className="mt-4 first:mt-0">
              {para}
            </p>
          ))}
          <aside
            aria-hidden="false"
            className="mt-10 border-l-2 border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-5 py-3 text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
          >
            {t('pages.fallback_notice')}
          </aside>
        </div>
      ) : (
        <div
          className="prose prose-neutral mt-8 max-w-3xl text-[var(--color-text)] leading-relaxed [&_a]:text-[var(--color-primary)] [&_a:hover]:text-[var(--color-primary-hover)] [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1"
          dangerouslySetInnerHTML={{__html: page.bodyHtml ?? ''}}
        />
      )}
    </article>
  );
}
