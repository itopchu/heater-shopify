/**
 * Heating PLP. Hydrogen port.
 */
import {redirect, useLoaderData} from 'react-router';
import type {Route} from './+types/collections.$handle';
import {Eyebrow} from '@gberg/ui';
import {CollectionView} from '~/components/gberg/plp/collection-view';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchCollectionByHandle} from '~/lib/gberg/queries';
import {localeHref} from '~/lib/gberg/href';
import {normalizeLocale} from '~/lib/gberg/i18n';

/**
 * Track B (April 2026): allow-list of single-product collections. When a
 * collection in this set has exactly 1 product, the loader 301-redirects
 * straight to that product's PDP. Hard-coded so a future temporary-OOS
 * state (a normally-multi-product collection drops to 1) doesn't quietly
 * redirect — only these two collections in our 55-product catalog are
 * intentionally single-product.
 */
const SINGLE_PRODUCT_COLLECTIONS = new Set([
  'bad',
  'fussbodenheizungsrohre',
]);

export const meta: Route.MetaFunction = ({data}) => {
  const col = data?.collection;
  if (!col) return [{title: data?.handle ?? 'Collection'}];
  return [
    {title: col.seo?.title ?? col.title},
    {name: 'description', content: col.seo?.description ?? col.description ?? ''},
  ];
};

export async function loader({context, params}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  const handle = params.handle;
  if (!handle) throw new Response('Missing handle', {status: 404});

  const client = createGbergClient(context.storefront);
  const collection = await fetchCollectionByHandle(client, handle, locale, 48);
  if (!collection) {
    if (context.env.PUBLIC_STOREFRONT_API_TOKEN) {
      throw new Response('Not found', {status: 404});
    }
  }

  // Track B (April 2026): redirect single-product allow-listed
  // collections to their PDP. Keeps the funnel direct on the two
  // collections in our 55-product catalog that intentionally have one
  // entry: `bad` (Lavinno WC) and `fussbodenheizungsrohre` (PE-RT pipe).
  if (
    collection &&
    SINGLE_PRODUCT_COLLECTIONS.has(handle) &&
    collection.products.length === 1
  ) {
    const target = collection.products[0]!;
    return redirect(localeHref(locale, `/products/${target.handle}`));
  }

  return {locale, handle, collection};
}

export default function CollectionPage() {
  const {locale, handle, collection} = useLoaderData<typeof loader>();

  const title = collection?.title ?? unkebab(handle);
  const description = collection?.description ?? '';
  const products = collection?.products ?? [];

  return (
    <div className="container-x py-8 lg:py-12">
      <header className="max-w-3xl">
        {/*
          Design Refresh — Complaint #5: editorial display rhythm. PLP gets
          `withRule` because the page has one hero, not a grid of cards.
        */}
        <Eyebrow tone="accent" withRule>
          Heating
        </Eyebrow>
        <h1 className="mt-4 font-[var(--font-display)] text-[length:var(--text-display-xl)] tracking-tight leading-[1.05] text-[var(--color-text)]">
          {title}
        </h1>
        {description ? (
          <div
            className="mt-5 max-w-[var(--lede-max-width,60ch)] leading-relaxed text-[var(--color-text-muted)]"
            dangerouslySetInnerHTML={{
              __html: collection?.descriptionHtml || description,
            }}
          />
        ) : (
          <p className="mt-5 max-w-[var(--lede-max-width,60ch)] text-[var(--color-text-muted)]">
            CE-certified European radiators selected for performance, durability and clean
            integration with modern heating systems.
          </p>
        )}
      </header>

      {products.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
          {!collection
            ? 'Shopify Storefront API is not configured.'
            : 'No products in this collection yet.'}
        </div>
      ) : (
        <CollectionView products={products} locale={locale} />
      )}

      <section className="mt-16 max-w-3xl">
        <Eyebrow>About this category</Eyebrow>
        <p className="mt-3 text-[var(--color-text-muted)]">
          We test every radiator against EN 442 output ratings and pair each
          listing with installer-grade specs: pipe spacing, connection type,
          max pressure and certified heat output. Use the filters above to
          narrow by dimension or compatibility.
        </p>
      </section>
    </div>
  );
}

function unkebab(s: string): string {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
