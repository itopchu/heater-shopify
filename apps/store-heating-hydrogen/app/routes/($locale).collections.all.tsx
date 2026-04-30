/**
 * /[locale]/collections/all → /[locale]/products redirect.
 *
 * `all` is not a real Shopify collection. The shop-all catalogue lives at
 * /products; this redirect keeps the familiar /collections/all URL working.
 */
import {redirect} from 'react-router';
import type {Route} from './+types/collections.all';
import {localeHref} from '~/lib/gberg/href';
import {normalizeLocale} from '~/lib/gberg/i18n';

export async function loader({params}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  return redirect(localeHref(locale, '/products'));
}

export default function CollectionsAll() {
  return null;
}
