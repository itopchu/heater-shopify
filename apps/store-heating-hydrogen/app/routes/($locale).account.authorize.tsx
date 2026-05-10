import type {Route} from './+types/($locale).account.authorize';

/**
 * OAuth callback. Hydrogen's customerAccount.authorize() exchanges the
 * code for tokens, persists the customer session, and 302-redirects to
 * /account.
 */
export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.authorize();
}
