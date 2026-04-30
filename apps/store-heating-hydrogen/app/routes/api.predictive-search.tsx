/**
 * GET /api/predictive-search?q=…&locale=…
 *
 * Server-side wrapper around the Storefront API `predictiveSearch` query.
 * Returns a JSON envelope: { products, collections, queries }.
 */
import type {Route} from './+types/api.predictive-search';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchPredictiveSearch} from '~/lib/gberg/queries';
import {normalizeLocale} from '~/lib/gberg/i18n';

export async function loader({context, request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const localeParam = url.searchParams.get('locale') ?? 'en';
  const locale = normalizeLocale(localeParam);

  const client = createGbergClient(context.storefront);
  const data = await fetchPredictiveSearch(client, q, locale, 6);
  return Response.json(data, {
    status: 200,
    headers: {'Cache-Control': 'no-store'},
  });
}
