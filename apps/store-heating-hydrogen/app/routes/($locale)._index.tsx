/**
 * Homepage — heating storefront. Hydrogen port of the Next.js homepage.
 * Section order matches apps/store-heating/app/(storefront)/[locale]/page.tsx.
 */
import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/_index';
import {Image} from '@shopify/hydrogen';
import {Button, Eyebrow, FaqAccordion, type FaqItem} from '@gberg/ui';
import {ProductGrid} from '~/components/gberg/plp/product-grid';
import {createGbergClient} from '~/lib/storefront.server';
import {
  fetchBestsellers,
  fetchCategoryPreviews,
  fetchMostExpensiveImage,
} from '~/lib/gberg/queries';
import {localeHref} from '~/lib/gberg/href';
import {normalizeLocale} from '~/lib/gberg/i18n';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'G-Berg Heizung — Premium European radiators'},
    {
      name: 'description',
      content:
        'Hundreds of CE-certified radiators with full specs, compatibility notes and engineering support. Designed in Germany, made for Europe.',
    },
  ];
};

const CATEGORY_HANDLES: {handle: string; label: string}[] = [
  {handle: 'wohnraumheizkoerper', label: 'Living rooms'},
  {handle: 'badheizkoerper', label: 'Bathroom'},
  {handle: 'badheizkoerper-elektrisch', label: 'Electric'},
  {handle: 'austauschheizkoerper', label: 'Replacement'},
  {handle: 'fussbodenheizung', label: 'Underfloor'},
  {handle: 'accessories', label: 'Accessories'},
];

const GUIDED_FINDER = [
  {
    label: 'Replace existing',
    desc: 'Drop-in replacements sized to fit existing connection centres.',
    href: '/collections/austauschheizkoerper',
  },
  {
    label: 'Living room',
    desc: 'Panel and design radiators for living rooms, bedrooms and hallways.',
    href: '/collections/wohnraumheizkoerper',
  },
  {
    label: 'Bathroom',
    desc: 'Bathroom radiators and towel warmers, central or electric.',
    href: '/collections/badheizkoerper',
  },
  {
    label: 'Electric',
    desc: 'Electric towel warmers — no central heating required.',
    href: '/collections/badheizkoerper-elektrisch',
  },
];

const WHY_US = [
  {label: 'Free EU delivery over €500', icon: '→'},
  {label: '30-day returns', icon: '↺'},
  {label: 'Engineering support', icon: '✦'},
  {label: '10-year warranty', icon: '✓'},
];

const HOMEPAGE_FAQS: FaqItem[] = [
  {
    question: 'Do you ship across Europe?',
    answer:
      'Yes — we deliver to Germany, Belgium, Spain, Austria, the Netherlands and other EU countries. Free shipping over €500.',
  },
  {
    question: 'Are your radiators heat-pump compatible?',
    answer:
      "Many of them are. Look for the 'Heat-pump ready' badge on product cards or filter by heat-pump compatibility on collection pages.",
  },
  {
    question: "What's your return policy?",
    answer:
      "30-day returns on unused, unopened items. Bespoke orders are non-refundable — we'll tell you clearly before checkout.",
  },
];

export async function loader({context, params}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  const client = createGbergClient(context.storefront);
  const handles = CATEGORY_HANDLES.map((c) => c.handle);
  const [bestsellers, categoryPreviews, heroImage, designEditorialImage] =
    await Promise.all([
      fetchBestsellers(client, locale, 8),
      fetchCategoryPreviews(client, handles, locale),
      // Hero banner sits under the "European radiators" eyebrow — must be
      // an electric bath radiator. Pick the most expensive in that
      // collection so the hero photograph is the most premium option.
      fetchMostExpensiveImage(client, 'badheizkorper-elektrisch', locale),
      // "Designed in Germany" split features a panel/living-room radiator
      // — smaller silhouette than a tall towel radiator. Most expensive
      // wohnraumheizkoerper item.
      fetchMostExpensiveImage(client, 'wohnraumheizkoerper', locale),
    ]);
  return {
    locale,
    bestsellers,
    categoryPreviews,
    heroImage,
    designEditorialImage,
  };
}

export default function HomePage() {
  const {
    locale,
    bestsellers,
    categoryPreviews,
    heroImage,
    designEditorialImage,
  } = useLoaderData<typeof loader>();

  const categories = CATEGORY_HANDLES.map((c) => {
    const preview = categoryPreviews.find((p) => p.handle === c.handle);
    return {...c, preview};
  }).filter((c) => !c.preview || c.preview.image || c.preview.productCount > 0);

  // Hero image: curated electric radiator (loader-fetched). Falls back to
  // a category preview only if the curated lookup returned nothing.
  const heroBanner =
    heroImage ?? categoryPreviews.find((p) => p.image)?.image ?? null;

  // "Designed in Germany" editorial image: curated panel radiator.
  const editorialBanner =
    designEditorialImage ??
    categoryPreviews.find((p) => p.image)?.image ??
    bestsellers[0]?.featuredImage ??
    null;

  return (
    <>
      {/* HERO */}
      <section className="bg-[var(--color-surface)]">
        <div className="container-x grid grid-cols-1 items-end gap-10 py-14 md:py-16 lg:grid-cols-[1.5fr_1fr] lg:gap-16 lg:py-20">
          <div>
            {/*
              Design Refresh — Complaint #5: editorial display rhythm.
              Hero earns the rule (single hero per page).
            */}
            <Eyebrow tone="accent" withRule>
              European radiators
            </Eyebrow>
            <h1 className="mt-5 font-[var(--font-display)] text-[clamp(3rem,7vw+0.5rem,7.5rem)] tracking-tight leading-[1.02] text-[var(--color-text)]">
              The right radiator,
              <br />
              <span className="text-[var(--color-primary)]">without the guesswork.</span>
            </h1>
            <p className="mt-7 max-w-[var(--lede-max-width,52ch)] text-[var(--color-text-muted)] text-base md:text-lg">
              Hundreds of CE-certified radiators with full specs, compatibility
              notes and engineering support. Designed in Germany, made for Europe.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to={localeHref(locale, '/collections/wohnraumheizkoerper')}>
                <Button size="lg">Shop radiators</Button>
              </Link>
              <Link to={localeHref(locale, '/collections/badheizkoerper')}>
                <Button size="lg" variant="secondary">
                  Browse bathroom
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-[16/10] w-full max-w-md overflow-hidden bg-[var(--color-surface-muted)] sm:max-w-lg sm:aspect-[16/10] md:max-w-xl md:aspect-[16/10] lg:mx-0 lg:max-w-none lg:aspect-[3/4]">
            {heroBanner ? (
              <Image
                data={heroBanner}
                alt={heroBanner.altText ?? 'G-Berg electric radiator'}
                aspectRatio="3/4"
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-[var(--color-text-muted)]">
                Hero image
              </div>
            )}
            <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-[var(--color-primary)]" />
            <span aria-hidden className="absolute left-0 top-0 h-12 w-[2px] bg-[var(--color-primary)]" />
          </div>
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* SHOP BY CATEGORY */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          eyebrow="Shop by room"
          title={
            <>
              Find what fits{' '}
              <em className="font-[var(--font-display)] italic text-[var(--color-primary)]">your</em>{' '}
              space.
            </>
          }
          description="Each category includes filters tuned to how heating engineers actually shop."
        />
        <ul className="mt-10 grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-3 md:grid-cols-3">
          {categories.map((c) => (
            <li key={c.handle} className="bg-[var(--color-surface)]">
              <Link
                to={localeHref(locale, `/collections/${c.handle}`)}
                className="group relative block aspect-square overflow-hidden md:aspect-[4/5]"
              >
                {c.preview?.image ? (
                  <Image
                    data={c.preview.image}
                    alt={c.preview.image.altText ?? c.label}
                    aspectRatio="4/5"
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-muted)] font-[var(--font-display)] text-3xl italic text-[var(--color-text-muted)]">
                    {c.label}
                  </div>
                )}
                <div
                  className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#111111]/60 to-transparent"
                  aria-hidden
                />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white md:p-6">
                  <div>
                    <p className="font-[var(--font-display)] text-2xl italic leading-tight md:text-3xl">
                      {c.label}
                    </p>
                    <span
                      aria-hidden
                      className="mt-2 block h-[2px] w-6 bg-[var(--color-primary)]"
                    />
                  </div>
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-2xl text-[var(--color-primary)] transition-transform duration-300 ease-out group-hover:translate-x-[6px]"
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

      {/* EDITORIAL SPLIT */}
      <section className="bg-[var(--color-surface-muted)]">
        <div className="container-x grid grid-cols-1 gap-0 md:grid-cols-12 md:items-stretch">
          <div className="relative aspect-[16/10] sm:aspect-[2/1] md:col-span-7 md:aspect-auto md:min-h-[480px]">
            {editorialBanner ? (
              <Image
                data={editorialBanner}
                alt={editorialBanner.altText ?? ''}
                sizes="(max-width: 768px) 100vw, 60vw"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                Editorial image
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center p-10 md:col-span-5 md:p-14">
            <Eyebrow>Designed in Germany</Eyebrow>
            <p className="display-heading mt-5 text-[clamp(2rem,3vw+1rem,3.75rem)] text-[var(--color-text)]">
              Built like
              <br />
              furniture, sized
              <br />
              for <span className="text-[var(--color-primary)]">every wall.</span>
            </p>
            <p className="mt-6 max-w-[42ch] text-[var(--color-text-muted)]">
              Eight design series — Astoria, Elanor, Flora, Pullman, Twister,
              Konrad, Platis, Lavinno — across three studio colorways. Sculptural
              objects first, heaters second.
            </p>
            <div className="mt-8">
              <Link to={localeHref(locale, '/collections/wohnraumheizkoerper')}>
                <Button size="md" variant="secondary">
                  Browse the catalog
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* BESTSELLERS */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          eyebrow="Bestsellers"
          title={
            <>
              Loved by installers{' '}
              <em className="font-[var(--font-display)] italic text-[var(--color-primary)]">
                &amp;
              </em>{' '}
              homeowners.
            </>
          }
        />
        <div className="mt-10">
          {bestsellers.length > 0 ? (
            <ProductGrid products={bestsellers.slice(0, 8)} locale={locale} />
          ) : (
            <div className="border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
              <p>Bestsellers will appear here once products are tagged.</p>
            </div>
          )}
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* GUIDED FINDER */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader eyebrow="Guided finder" title={<>Tell us what you need.</>} />
        <ul className="mt-10 grid grid-cols-1 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {GUIDED_FINDER.map((g, i) => (
            <li key={`${g.label}-${i}`}>
              <Link
                to={localeHref(locale, g.href)}
                className="group relative block px-6 py-8 transition-colors hover:bg-[var(--color-surface-muted)] md:px-8 md:py-10"
              >
                <p className="font-[var(--font-display)] text-2xl italic leading-tight">
                  {g.label}
                </p>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">{g.desc}</p>
                <p className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]">
                  <span>Start</span>
                  <span aria-hidden className="text-[var(--color-primary)]">
                    →
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* TRUST STRIP */}
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

      {/* FAQ */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader eyebrow="FAQ" title={<>Common questions.</>} />
        <div className="mt-8 max-w-3xl">
          <FaqAccordion items={HOMEPAGE_FAQS} />
        </div>
      </section>

    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
}) {
  return (
    <header className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
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
