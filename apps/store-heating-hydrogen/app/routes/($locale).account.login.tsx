import type {Route} from './+types/($locale).account.login';

/**
 * Hands the request to Hydrogen's CustomerAccount API which builds the
 * Shopify-hosted OAuth URL and 302-redirects there. The OAuth flow uses
 * Shopify's hosted login (email + magic-link / passcode — no password).
 * On success, Shopify bounces the customer back to /account/authorize.
 */
export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.login();
}
