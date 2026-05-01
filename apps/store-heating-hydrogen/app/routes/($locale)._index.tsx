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
import {normalizeLocale, tFor, useT} from '~/lib/gberg/i18n';
import {buildSeoMeta} from '~/lib/gberg/seo';

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {locale?: ReturnType<typeof normalizeLocale>};
  location: {pathname: string};
}) => {
  const t = tFor(data?.locale ?? 'en');
  const title = t('home.meta_title');
  const description = t('home.meta_description');
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

const CATEGORY_HANDLES: {handle: string; labelKey: string}[] = [
  {handle: 'wohnraumheizkoerper', labelKey: 'nav.living_rooms'},
  {handle: 'badheizkoerper', labelKey: 'nav.bathroom'},
  {handle: 'badheizkoerper-elektrisch', labelKey: 'nav.electric'},
  {handle: 'austauschheizkoerper', labelKey: 'nav.replacement'},
  {handle: 'fussbodenheizung', labelKey: 'nav.underfloor'},
  {handle: 'accessories', labelKey: 'nav.accessories'},
];

const GUIDED_FINDER: {
  labelKey: string;
  descKey: string;
  href: string;
}[] = [
  {
    labelKey: 'home.guided_finder_replace_label',
    descKey: 'home.guided_finder_replace_desc',
    href: '/collections/austauschheizkoerper',
  },
  {
    labelKey: 'home.guided_finder_living_label',
    descKey: 'home.guided_finder_living_desc',
    href: '/collections/wohnraumheizkoerper',
  },
  {
    labelKey: 'home.guided_finder_bathroom_label',
    descKey: 'home.guided_finder_bathroom_desc',
    href: '/collections/badheizkoerper',
  },
  {
    labelKey: 'home.guided_finder_electric_label',
    descKey: 'home.guided_finder_electric_desc',
    href: '/collections/badheizkoerper-elektrisch',
  },
];

const WHY_US: {labelKey: string; icon: string}[] = [
  {labelKey: 'home.why_us_delivery', icon: '→'},
  {labelKey: 'home.why_us_returns', icon: '↺'},
  {labelKey: 'home.why_us_engineering', icon: '✦'},
  {labelKey: 'home.why_us_warranty', icon: '✓'},
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
  const t = useT();

  const homepageFaqs: FaqItem[] = [
    {question: t('home.faq_q1'), answer: t('home.faq_a1')},
    {question: t('home.faq_q2'), answer: t('home.faq_a2')},
    {question: t('home.faq_q3'), answer: t('home.faq_a3')},
  ];

  const categories = CATEGORY_HANDLES.map((c) => {
    const preview = categoryPreviews.find((p) => p.handle === c.handle);
    return {...c, label: t(c.labelKey), preview};
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
              {t('home.hero_eyebrow')}
            </Eyebrow>
            <h1 className="mt-5 font-[var(--font-display)] text-[clamp(3rem,7vw+0.5rem,7.5rem)] tracking-tight leading-[1.02] text-[var(--color-text)]">
              {t('home.hero_title_line1')}
              <br />
              <span className="text-[var(--color-primary)]">{t('home.hero_title_line2')}</span>
            </h1>
            <p className="mt-7 max-w-[var(--lede-max-width,52ch)] text-[var(--color-text-muted)] text-base md:text-lg">
              {t('home.hero_lede')}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to={localeHref(locale, '/collections/wohnraumheizkoerper')}>
                <Button size="lg">{t('home.hero_cta_shop')}</Button>
              </Link>
              <Link to={localeHref(locale, '/collections/badheizkoerper')}>
                <Button size="lg" variant="secondary">
                  {t('home.hero_cta_bathroom')}
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-[16/10] w-full max-w-md overflow-hidden bg-[var(--color-surface-muted)] sm:max-w-lg sm:aspect-[16/10] md:max-w-xl md:aspect-[16/10] lg:mx-0 lg:max-w-none lg:aspect-[3/4]">
            {heroBanner ? (
              <Image
                data={heroBanner}
                alt={heroBanner.altText ?? t('home.hero_image_alt')}
                aspectRatio="3/4"
                sizes="(max-width: 1024px) 100vw, 40vw"
                // Home hero is the LCP candidate — prioritise it.
                loading="eager"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-[var(--color-text-muted)]">
                {t('home.hero_image_fallback')}
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
          eyebrow={t('home.shop_by_room_eyebrow')}
          title={
            <>
              {t('home.shop_by_room_title_lead')}{' '}
              <em className="font-[var(--font-display)] italic text-[var(--color-primary)]">
                {t('home.shop_by_room_title_em')}
              </em>{' '}
              {t('home.shop_by_room_title_tail')}
            </>
          }
          description={t('home.shop_by_room_description')}
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
                {t('home.editorial_image_fallback')}
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center p-10 md:col-span-5 md:p-14">
            <Eyebrow>{t('home.designed_in_germany_eyebrow')}</Eyebrow>
            <p className="display-heading mt-5 text-[clamp(2rem,3vw+1rem,3.75rem)] text-[var(--color-text)]">
              {t('home.designed_in_germany_title_line1')}
              <br />
              {t('home.designed_in_germany_title_line2')}
              <br />
              {t('home.designed_in_germany_title_line3')}{' '}
              <span className="text-[var(--color-primary)]">
                {t('home.designed_in_germany_title_em')}
              </span>
            </p>
            <p className="mt-6 max-w-[42ch] text-[var(--color-text-muted)]">
              {t('home.designed_in_germany_lede')}
            </p>
            <div className="mt-8">
              <Link to={localeHref(locale, '/products')}>
                <Button size="md" variant="secondary">
                  {t('home.browse_catalog_cta')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="rule-accent" aria-hidden />

      {/* BESTSELLERS */}
      {bestsellers.length > 0 ? (
        <section className="container-x py-14 md:py-16">
          <SectionHeader
            eyebrow={t('home.bestsellers_eyebrow')}
            title={
              <>
                {t('home.bestsellers_title_lead')}{' '}
                <span className="font-[var(--font-body)] not-italic font-light text-[var(--color-primary)] mx-1">
                  {t('home.bestsellers_title_amp')}
                </span>{' '}
                {t('home.bestsellers_title_tail')}
              </>
            }
          />
          <div className="mt-10">
            <ProductGrid products={bestsellers.slice(0, 8)} locale={locale} />
          </div>
        </section>
      ) : null}

      <div className="rule-accent" aria-hidden />

      {/* GUIDED FINDER */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          eyebrow={t('home.guided_finder_eyebrow')}
          title={<>{t('home.guided_finder_title')}</>}
        />
        <ul className="mt-10 grid grid-cols-1 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {GUIDED_FINDER.map((g, i) => (
            <li key={`${g.labelKey}-${i}`}>
              <Link
                to={localeHref(locale, g.href)}
                className="group relative block px-6 py-8 transition-colors hover:bg-[var(--color-surface-muted)] md:px-8 md:py-10"
              >
                <p className="font-[var(--font-display)] text-2xl italic leading-tight">
                  {t(g.labelKey)}
                </p>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                  {t(g.descKey)}
                </p>
                <p className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]">
                  <span>{t('home.guided_finder_start')}</span>
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
            <li key={w.labelKey} className="flex items-center gap-4 px-2 md:px-4">
              <span aria-hidden className="text-2xl text-[var(--color-primary)]">
                {w.icon}
              </span>
              <span className="text-sm font-medium tracking-tight">{t(w.labelKey)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="container-x py-14 md:py-16">
        <SectionHeader
          eyebrow={t('home.faq_eyebrow')}
          title={<>{t('home.faq_title')}</>}
        />
        <div className="mt-8 max-w-3xl">
          <FaqAccordion items={homepageFaqs} />
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
