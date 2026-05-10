import {redirect} from 'react-router';
import type {Route} from './+types/($locale).cart.c.$token';

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

  const target = `https://${context.env.PUBLIC_STORE_DOMAIN}/cart/c/${token}?${passthrough.toString()}`;
  return redirect(target, 302);
}

export default function CartPermalink() {
  return null;
}
