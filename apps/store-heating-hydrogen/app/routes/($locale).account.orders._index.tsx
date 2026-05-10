import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/($locale).account.orders._index';
import {Money} from '@shopify/hydrogen';
import {CUSTOMER_ORDERS_QUERY} from '~/graphql/customer-account/CustomerOrdersQuery';
import {useT} from '~/lib/gberg/i18n';

export async function loader({context, request}: Route.LoaderArgs) {
  await context.customerAccount.handleAuthStatus();
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const direction = url.searchParams.get('direction');
  const variables: Record<string, unknown> = {first: 20};
  if (direction === 'next' && cursor) {
    variables.endCursor = cursor;
  } else if (direction === 'prev' && cursor) {
    variables.startCursor = cursor;
    variables.first = undefined;
    variables.last = 20;
  }
  const {data, errors} = await context.customerAccount.query(CUSTOMER_ORDERS_QUERY, {variables});
  if (errors?.length) throw new Error(errors[0].message);
  return {orders: data?.customer?.orders};
}

export default function AccountOrders() {
  const {orders} = useLoaderData<typeof loader>();
  const t = useT();
  const fmtDate = (s: string) => new Date(s).toLocaleDateString();

  if (!orders || orders.nodes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
        <h2 className="text-base font-semibold">{t('account.orders_empty_title')}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('account.orders_empty_body')}</p>
        <Link to="/products" className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">
          {t('account.orders_empty_cta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('account.orders_heading')}</h2>
      <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {orders.nodes.map((o: any) => (
          <li key={o.id} className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-semibold">#{o.number}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{t('account.order_confirmation_label')} {o.confirmationNumber}</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">{fmtDate(o.processedAt)}</p>
            <p className="text-sm font-medium tabular-nums">
              <Money data={o.totalPrice} />
            </p>
            <Link
              to={`/account/orders/${encodeURIComponent(o.id.replace('gid://shopify/Order/', ''))}`}
              className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
            >
              {t('account.orders_view_link')}
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
        {orders.pageInfo.hasPreviousPage ? (
          <Link to={`?direction=prev&cursor=${orders.pageInfo.startCursor}`} className="text-[var(--color-primary)] hover:underline">
            ← {t('account.orders_prev')}
          </Link>
        ) : <span />}
        {orders.pageInfo.hasNextPage ? (
          <Link to={`?direction=next&cursor=${orders.pageInfo.endCursor}`} className="text-[var(--color-primary)] hover:underline">
            {t('account.orders_next')} →
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}
