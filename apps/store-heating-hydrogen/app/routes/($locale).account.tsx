import {Form, NavLink, Outlet, useLoaderData} from 'react-router';
import type {Route} from './+types/($locale).account';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import {useT} from '~/lib/gberg/i18n';

/**
 * Account section layout. Loader runs `handleAuthStatus` so any
 * unauthenticated request is redirected to /account/login. The query
 * fetches the customer's name + addresses for the side-nav header.
 */
export async function loader({context}: Route.LoaderArgs) {
  await context.customerAccount.handleAuthStatus();
  const {data, errors} = await context.customerAccount.query(CUSTOMER_DETAILS_QUERY);
  if (errors?.length || !data?.customer) throw new Error('Customer not found');
  return {customer: data.customer};
}

export default function AccountLayout() {
  const {customer} = useLoaderData<typeof loader>();
  const t = useT();
  const heading = customer.firstName
    ? t('account.welcome_named', {name: customer.firstName})
    : t('account.welcome');

  const linkClass = ({isActive}: {isActive: boolean}) =>
    [
      'block px-3 py-2 text-sm rounded-sm transition-colors',
      isActive
        ? 'bg-[var(--color-surface-muted)] text-[var(--color-text)] font-semibold'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
    ].join(' ');

  return (
    <div className="container-x py-12">
      <header className="mb-8">
        <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[var(--color-primary)]">
          {t('account.eyebrow')}
        </span>
        <h1 className="display-heading mt-2 text-[clamp(1.75rem,2vw+1rem,2.5rem)]">
          {heading}
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label={t('account.nav_aria')} className="space-y-1">
          <NavLink to="/account" end className={linkClass}>{t('account.nav_overview')}</NavLink>
          <NavLink to="/account/orders" className={linkClass}>{t('account.nav_orders')}</NavLink>
          <NavLink to="/account/profile" className={linkClass}>{t('account.nav_profile')}</NavLink>
          <NavLink to="/account/addresses" className={linkClass}>{t('account.nav_addresses')}</NavLink>
          <Form method="post" action="/account/logout" className="pt-2">
            <button
              type="submit"
              className="block w-full text-left px-3 py-2 text-sm rounded-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              {t('account.nav_logout')}
            </button>
          </Form>
        </nav>

        <main className="min-w-0">
          <Outlet context={{customer}} />
        </main>
      </div>
    </div>
  );
}
