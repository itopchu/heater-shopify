import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/($locale).account.orders.$id';
import {Image, Money} from '@shopify/hydrogen';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {useT} from '~/lib/gberg/i18n';

export async function loader({context, params}: Route.LoaderArgs) {
  await context.customerAccount.handleAuthStatus();
  if (!params.id) throw new Response(null, {status: 404});
  const orderId = `gid://shopify/Order/${params.id}`;
  const {data, errors} = await context.customerAccount.query(CUSTOMER_ORDER_QUERY, {
    variables: {orderId},
  });
  if (errors?.length || !data?.order) throw new Response(null, {status: 404});
  return {order: data.order};
}

export default function AccountOrder() {
  const {order} = useLoaderData<typeof loader>();
  const t = useT();
  const fmtDate = (s: string) => new Date(s).toLocaleDateString();

  return (
    <div className="space-y-6">
      <Link to="/account/orders" className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
        ← {t('account.order_back_link')}
      </Link>
      <header>
        <h2 className="text-lg font-semibold">{order.name}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('account.order_placed_on')} {fmtDate(order.processedAt)} · {t('account.order_confirmation_label')} {order.confirmationNumber}
        </p>
        {order.statusPageUrl ? (
          <a href={order.statusPageUrl} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">
            {t('account.order_status_link')} ↗
          </a>
        ) : null}
      </header>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          {t('account.order_items_heading')}
        </h3>
        <ul className="divide-y divide-[var(--color-border)]">
          {order.lineItems.nodes.map((li: any) => (
            <li key={li.id} className="flex gap-4 py-4">
              {li.image ? (
                <Image data={li.image} aspectRatio="1/1" sizes="80px"
                  className="h-20 w-20 rounded-sm object-cover" />
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{li.title}</p>
                {li.variantTitle ? (
                  <p className="text-xs text-[var(--color-text-muted)]">{li.variantTitle}</p>
                ) : null}
                <p className="text-xs text-[var(--color-text-muted)]">× {li.quantity}</p>
              </div>
              <p className="text-sm tabular-nums">
                <Money data={li.price} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            {t('account.order_totals_heading')}
          </h3>
          <dl className="space-y-1 text-sm">
            {order.subtotal ? (
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">{t('account.order_subtotal')}</dt>
                <dd className="tabular-nums"><Money data={order.subtotal} /></dd>
              </div>
            ) : null}
            {order.totalTax ? (
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">{t('account.order_tax')}</dt>
                <dd className="tabular-nums"><Money data={order.totalTax} /></dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-[var(--color-border)] pt-2 font-semibold">
              <dt>{t('account.order_total')}</dt>
              <dd className="tabular-nums"><Money data={order.totalPrice} /></dd>
            </div>
          </dl>
        </div>
        {order.shippingAddress ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              {t('account.order_shipping_to')}
            </h3>
            <address className="not-italic text-sm whitespace-pre-line">
              {(order.shippingAddress.formatted ?? []).join('\n')}
            </address>
          </div>
        ) : null}
      </section>
    </div>
  );
}
