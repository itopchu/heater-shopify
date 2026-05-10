import {redirect} from 'react-router';
import type {Route} from './+types/($locale).account.logout';

/**
 * Sign-out endpoint. POST clears the customer session and redirects to
 * the localized home page. GET-on-the-route just bounces back home so
 * stray crawls / direct visits don't error.
 */
export async function action({context}: Route.ActionArgs) {
  return context.customerAccount.logout();
}

export async function loader({params}: Route.LoaderArgs) {
  const locale = params.locale ? `/${params.locale}` : '';
  return redirect(`${locale}/`);
}
