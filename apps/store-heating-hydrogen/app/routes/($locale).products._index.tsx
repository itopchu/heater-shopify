/**
 * Shop-all catalogue route. Lists every product, paginated 60/page.
 * Hydrogen port.
 */
import {useLoaderData} from 'react-router';
import type {Route} from './+types/products._index';
import {Eyebrow} from '@gberg/ui';
import {CollectionView} from '~/components/gberg/plp/collection-view';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchAllProducts} from '~/lib/gberg/queries';
import {localeHref} from '~/lib/gberg/href';
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
  const title = t('plp.shop_all_meta_title');
  const description = t('plp.shop_all_meta_description');
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
  const client = createGbergClient(context.storefront);
  const result = await fetchAllProducts(client, locale, {
    first: 60,
    sortKey: 'BEST_SELLING',
  });
  return {locale, products: result.products};
}

export default function ShopAllPage() {
  const {locale, products} = useLoaderData<typeof loader>();
  const t = useT();

  return (
    <div className="container-x py-8 lg:py-12">
      <header className="max-w-3xl">
        <Eyebrow>{t('plp.shop_all_eyebrow')}</Eyebrow>
        <h1 className="display-heading mt-4 text-[clamp(2.25rem,4vw+0.5rem,4rem)] text-[var(--color-text)]">
          {t('plp.shop_all_title_lead')}{' '}
          <em className="italic text-[var(--color-primary)]">
            {t('plp.shop_all_title_em')}
          </em>
          .
        </h1>
        <span
          aria-hidden
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />
        <p className="mt-5 text-[var(--color-text-muted)]">
          {t('plp.shop_all_lede')}
        </p>
      </header>

      {products.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
          {t('plp.shop_all_empty')}
        </div>
      ) : (
        <CollectionView products={products} locale={locale} />
      )}
    </div>
  );
}
