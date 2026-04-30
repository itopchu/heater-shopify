/**
 * /[locale]/blogs — editorial / news index. Hydrogen port of the
 * Next.js news page (which lived at /news, but Hydrogen scaffold uses /blogs).
 */
import {useLoaderData} from 'react-router';
import type {Route} from './+types/blogs._index';
import {Image} from '@shopify/hydrogen';
import {Eyebrow} from '@gberg/ui';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchBlog} from '~/lib/gberg/queries';
import {localeHref} from '~/lib/gberg/href';
import {NewsletterForm} from '~/components/gberg/newsletter-form';
import {normalizeLocale, tFor, useT} from '~/lib/gberg/i18n';
import {BRAND_NAME, buildSeoMeta} from '~/lib/gberg/seo';

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {locale?: ReturnType<typeof normalizeLocale>};
  location: {pathname: string};
}) => {
  const t = tFor(data?.locale ?? 'en');
  const title = `${t('blogs.meta_title')} — ${BRAND_NAME}`;
  const description = t('blogs.meta_description');
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

const PLACEHOLDER_CARDS: {eyebrowKey: string; titleKey: string}[] = [
  {eyebrowKey: 'blogs.placeholder_eyebrow_install', titleKey: 'blogs.placeholder_title_install'},
  {eyebrowKey: 'blogs.placeholder_eyebrow_heatpump', titleKey: 'blogs.placeholder_title_heatpump'},
  {eyebrowKey: 'blogs.placeholder_eyebrow_series', titleKey: 'blogs.placeholder_title_series'},
  {eyebrowKey: 'blogs.placeholder_eyebrow_eu', titleKey: 'blogs.placeholder_title_eu'},
  {eyebrowKey: 'blogs.placeholder_eyebrow_bathroom', titleKey: 'blogs.placeholder_title_bathroom'},
  {eyebrowKey: 'blogs.placeholder_eyebrow_replacement', titleKey: 'blogs.placeholder_title_replacement'},
];

export async function loader({context, params}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  const client = createGbergClient(context.storefront);
  const blog = await fetchBlog(client, locale, {first: 12});
  return {locale, blog};
}

export default function NewsIndex() {
  const {locale, blog} = useLoaderData<typeof loader>();
  const t = useT();
  const articles = blog?.articles ?? [];

  return (
    <div className="container-x py-10 lg:py-16">
      <header className="max-w-3xl">
        <Eyebrow>{t('blogs.eyebrow')}</Eyebrow>
        <h1 className="display-heading mt-4 text-[clamp(2.25rem,4vw+0.5rem,4rem)] text-[var(--color-text)]">
          {articles.length > 0 ? (
            <>{t('blogs.title_active')}</>
          ) : (
            <>
              {t('blogs.title_coming_soon_lead')}{' '}
              <em className="italic text-[var(--color-primary)]">
                {t('blogs.title_coming_soon_em')}
              </em>
              .
            </>
          )}
        </h1>
        <span
          aria-hidden
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />
        <p className="mt-5 max-w-[60ch] text-[var(--color-text-muted)]">
          {articles.length > 0
            ? t('blogs.lede_active')
            : t('blogs.lede_coming_soon')}
        </p>
      </header>

      {articles.length > 0 ? (
        <ul className="mt-12 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a, i) => (
            <li key={a.id} className="group flex flex-col">
              <div className="relative aspect-[4/5] overflow-hidden bg-[var(--color-surface-muted)]">
                {a.image ? (
                  <Image
                    data={a.image}
                    alt={a.image.altText ?? a.title}
                    aspectRatio="4/5"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  />
                ) : null}
              </div>
              <div className="mt-5 flex flex-1 flex-col gap-3 border-t border-[var(--color-border)] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  {String(i + 1).padStart(2, '0')} ·{' '}
                  {new Date(a.publishedAt).toLocaleDateString(locale, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
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
            aria-label={t('blogs.coming_soon_card_aria')}
            className="mt-12 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
          >
            {PLACEHOLDER_CARDS.map((c, i) => (
              <li key={c.titleKey} className="flex flex-col opacity-90" aria-disabled>
                <div className="relative aspect-[4/5] overflow-hidden bg-[var(--color-surface-muted)]">
                  <div className="grid h-full place-items-center px-8 text-center font-[var(--font-display)] text-2xl italic leading-tight text-[var(--color-text-muted)]">
                    {t(c.eyebrowKey)}
                  </div>
                </div>
                <div className="mt-5 flex flex-1 flex-col gap-3 border-t border-[var(--color-border)] pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    {String(i + 1).padStart(2, '0')} · {t('blogs.coming_soon_marker')}
                  </p>
                  <h2 className="font-[var(--font-display)] text-2xl italic leading-tight text-[var(--color-text)]">
                    {t(c.titleKey)}
                  </h2>
                  <p className="mt-auto text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    {t('blogs.coming_soon_email_promise')}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <aside className="mt-16 grid grid-cols-1 items-end gap-8 border-t border-[var(--color-border)] pt-10 md:grid-cols-[1.4fr_1fr] md:gap-12">
            <div>
              <Eyebrow>{t('footer.stay_in_loop')}</Eyebrow>
              <p className="display-heading mt-5 text-[clamp(1.5rem,2vw+0.5rem,2.25rem)] text-[var(--color-text)]">
                {t('newsletter.first_guide_promise')}
              </p>
            </div>
            <NewsletterForm />
          </aside>
        </>
      )}
    </div>
  );
}
