import {redirect} from 'react-router';
import type {Route} from './+types/($locale).cart.c.$token';
import {DEFAULT_LOCALE, isSupportedLocale} from '~/lib/gberg/i18n';

/**
 * Cart-permalink passthrough.
 *
 * Storefront API returns checkoutUrl = https://{PUBLIC_STORE_DOMAIN}/cart/c/{token}?key=...
 * Shopify's primary-domain rule rewrites that to https://gberg-heizung.de/cart/c/{token}
 * — which is this Hydrogen Oxygen worker, with no native handler for /cart/c/*. Result:
 * every "Proceed to Checkout" 404s.
 *
 * We catch the inbound and 302 the customer back to the myshopify origin with
 * `auto_redirect=false&edge_redirect=true`, which signals Shopify's edge to skip the
 * primary-domain rewrite and hand off directly to shop.app's universal checkout entry.
 */
export async function loader({request, context, params}: Route.LoaderArgs) {
  const token = params.token;
  if (!token) return redirect('/cart');

  const url = new URL(request.url);
  const passthrough = new URLSearchParams(url.searchParams);
  passthrough.set('auto_redirect', 'false');
  passthrough.set('edge_redirect', 'true');

  // Stamp the customer's locale onto the myshopify cart-permalink as a
  // `?locale=…` query param. This is the lever that flips Shopify's
  // checkout-handoff URL from `/checkouts/cn/<token>/en-de` to
  // `/checkouts/cn/<token>/de`, which renders the hosted checkout in
  // German. Verified empirically:
  //   - Path-prefix `/de/cart/c/<token>` on myshopify → 404
  //   - `?locale=de` query param → checkout in German (`htmlLang="de"`)
  //
  // We always stamp an explicit locale (rather than letting the Shopify
  // market default decide) so the hosted checkout matches the browsing
  // language even on the unprefixed default route. The unprefixed `/cart/c/…`
  // carries no `params.locale`, so it resolves to DEFAULT_LOCALE (German) —
  // exactly the language the customer was shopping in at the root.
  const checkoutLocale =
    params.locale && isSupportedLocale(params.locale)
      ? params.locale
      : DEFAULT_LOCALE;
  passthrough.set('locale', checkoutLocale);
  const target = `https://${context.env.PUBLIC_STORE_DOMAIN}/cart/c/${token}?${passthrough.toString()}`;
  return redirect(target, 302);
}

export default function CartPermalink() {
  return null;
}
