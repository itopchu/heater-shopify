/**
 * Generic Shopify Online Store Page renderer with merchant-aware fallback.
 * Hydrogen port.
 */
import {useLoaderData} from 'react-router';
import type {Route} from './+types/pages.$handle';
import {Eyebrow} from '@gberg/ui';
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

interface ResolvedPage {
  source: 'shopify' | 'fallback';
  title: string;
  intro?: string;
  bodyHtml?: string;
  bodyText?: string;
  seo?: {title: string | null; description: string | null} | null;
}

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {locale?: string; page?: ResolvedPage};
  location: {pathname: string};
}) => {
  const page = data?.page;
  const locale = data?.locale ?? 'en';
  const baseTitle = page?.seo?.title ?? page?.title ?? 'Page';
  const title = baseTitle.includes(BRAND_NAME)
    ? baseTitle
    : `${baseTitle} — ${BRAND_NAME}`;
  const description = page?.seo?.description ?? page?.intro ?? '';

  // BreadcrumbList: Home → <page title>. Mirrors the visible "Home" path
  // implied by the brand link in the header (which lands at `/{locale}`)
  // and the page H1 below.
  const breadcrumbLd = page?.title
    ? buildBreadcrumbJsonLd([
        {label: 'Home', href: `/${locale}`},
        {label: page.title},
      ])
    : null;

  return [
    {title},
    {name: 'description', content: description},
    ...buildSeoMeta({
      title,
      description,
      pathname: location.pathname,
      type: 'website',
    }),
    ...(breadcrumbLd ? [breadcrumbLd] : []),
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
  const t = useT();

  return (
    <article className="container-x py-10 lg:py-16">
      <header className="max-w-3xl border-b border-[var(--color-border)] pb-8">
        <Eyebrow>{t('pages.eyebrow')}</Eyebrow>
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
