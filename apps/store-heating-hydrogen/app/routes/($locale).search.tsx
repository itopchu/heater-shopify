/**
 * /[locale]/search?q=… — full search results. Hydrogen port.
 */
import {useLoaderData} from 'react-router';
import type {Route} from './+types/search';
import {ProductGrid} from '~/components/gberg/plp/product-grid';
import {SearchInput} from '~/components/gberg/search/search-input';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchSearchResults} from '~/lib/gberg/queries';
import {localeHref} from '~/lib/gberg/href';
import {normalizeLocale} from '~/lib/gberg/i18n';

export const meta: Route.MetaFunction = ({data}) => {
  const q = data?.query ?? '';
  return [
    {title: q ? `Search · ${q}` : 'Search'},
    {
      name: 'description',
      content: q
        ? `Results for "${q}" across the G-Berg catalogue.`
        : 'Search radiators, towel rails, underfloor systems and accessories.',
    },
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export async function loader({context, params, request}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();

  const client = createGbergClient(context.storefront);
  const results = query
    ? await fetchSearchResults(client, query, locale, 48)
    : {totalCount: 0, products: []};

  return {locale, query, results};
}

export default function SearchResultsPage() {
  const {locale, query: q, results} = useLoaderData<typeof loader>();

  return (
    <div className="container-x py-8 lg:py-12">
      <header className="max-w-3xl">
        <h1 className="display-heading text-[clamp(2rem,3vw+0.75rem,3.5rem)] text-[var(--color-text)]">
          {q ? (
            <>
              Results for{' '}
              <em className="italic text-[var(--color-primary)]">
                &ldquo;{q}&rdquo;
              </em>
              .
            </>
          ) : (
            <>What are you looking for?</>
          )}
        </h1>
        <span
          aria-hidden
          className="mt-5 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />

        <div className="mt-6 max-w-xl">
          <SearchInput locale={locale} initialQuery={q} variant="page" />
        </div>

        {q ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            {results.totalCount} match{results.totalCount === 1 ? '' : 'es'}
          </p>
        ) : null}
      </header>

      <div className="mt-10">
        {q && results.products.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
            No products match &ldquo;{q}&rdquo;. Try a series name (Berlin,
            Köln, Aachen), a dimension (e.g. <code>1800x600</code>), or a
            room (bathroom, living room).
          </div>
        ) : null}
        {q && results.products.length > 0 ? (
          <ProductGrid products={results.products} locale={locale} />
        ) : null}
      </div>
    </div>
  );
}
