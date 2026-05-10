import {Link, useOutletContext} from 'react-router';
import {useT} from '~/lib/gberg/i18n';

interface OutletCtx {
  customer: {
    firstName?: string | null;
    lastName?: string | null;
    defaultAddress?: {formatted?: string[] | null} | null;
    addresses?: {nodes: Array<{id: string}>};
  };
}

/**
 * Account dashboard — quick links to the four sub-sections plus a
 * preview of the default address.
 */
export default function AccountIndex() {
  const {customer} = useOutletContext<OutletCtx>();
  const t = useT();

  const addr = customer.defaultAddress?.formatted ?? [];
  const addressCount = customer.addresses?.nodes.length ?? 0;

  const tile =
    'block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]';

  return (
    <div className="space-y-8">
      <p className="max-w-prose text-[var(--color-text-muted)]">
        {t('account.dashboard_blurb')}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link to="/account/orders" className={tile}>
          <h2 className="text-base font-semibold">{t('account.tile_orders_title')}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('account.tile_orders_body')}</p>
        </Link>
        <Link to="/account/profile" className={tile}>
          <h2 className="text-base font-semibold">{t('account.tile_profile_title')}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('account.tile_profile_body')}</p>
        </Link>
        <Link to="/account/addresses" className={tile}>
          <h2 className="text-base font-semibold">
            {t('account.tile_addresses_title')}
            {addressCount ? <span className="ml-2 text-xs text-[var(--color-text-muted)]">({addressCount})</span> : null}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {addr.length ? addr.join(', ') : t('account.tile_addresses_empty')}
          </p>
        </Link>
        <a
          href="mailto:info@g-berg-gmbh.de"
          className={tile}
        >
          <h2 className="text-base font-semibold">{t('account.tile_help_title')}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('account.tile_help_body')}</p>
        </a>
      </div>
    </div>
  );
}
