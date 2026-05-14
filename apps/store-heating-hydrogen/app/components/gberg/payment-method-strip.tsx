/**
 * "We accept" payment method strip — flat marks shown under the cart
 * checkout CTA to build trust before the customer leaves the cart for
 * Shopify-hosted checkout.
 *
 * Source of truth: the methods configured in Shopify Payments + the
 * PayPal and Klarna apps for this store. Keep this list in lockstep
 * with what the checkout actually offers — see screenshots in the
 * pyzype-xf admin → Settings → Payments. Last reconciled 2026-05-14.
 */
import {useT} from '~/lib/gberg/i18n';

const ICONS = [
  {key: 'visa', label: 'Visa', bg: '#1A1F71', fg: '#FFFFFF'},
  {key: 'mc', label: 'MC', bg: '#FFFFFF', fg: '#000000', special: 'mastercard' as const},
  {key: 'maestro', label: 'Maestro', bg: '#FFFFFF', fg: '#000000', special: 'maestro' as const},
  {key: 'amex', label: 'AMEX', bg: '#016FD0', fg: '#FFFFFF'},
  {key: 'unionpay', label: 'UnionPay', bg: '#FFFFFF', fg: '#E21836'},
  {key: 'paypal', label: 'PayPal', bg: '#FFFFFF', fg: '#003087'},
  {key: 'klarna', label: 'Klarna', bg: '#FFA8CD', fg: '#17120F'},
  {key: 'shoppay', label: 'Shop Pay', bg: '#5A31F4', fg: '#FFFFFF'},
  {key: 'gpay', label: 'G Pay', bg: '#FFFFFF', fg: '#5F6368'},
];

function MastercardMark() {
  // Two intersecting circles — the visual primitive of the Mastercard mark.
  return (
    <span className="relative inline-flex items-center" aria-hidden>
      <span className="block h-3.5 w-3.5 rounded-full bg-[#EB001B]" />
      <span className="-ml-1.5 block h-3.5 w-3.5 rounded-full bg-[#F79E1B]" />
    </span>
  );
}

function MaestroMark() {
  // Same two-circle primitive as Mastercard but with Maestro's blue + red.
  return (
    <span className="relative inline-flex items-center" aria-hidden>
      <span className="block h-3.5 w-3.5 rounded-full bg-[#0099DF]" />
      <span className="-ml-1.5 block h-3.5 w-3.5 rounded-full bg-[#ED0006]" />
    </span>
  );
}

export function PaymentMethodStrip({className = ''}: {className?: string}) {
  const t = useT();
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-muted)]">
        {t('cart.we_accept')}
      </p>
      <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label={t('cart.we_accept')}>
        {ICONS.map((i) => (
          <li
            key={i.key}
            className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded border border-[var(--color-border)] px-2 shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)]"
            style={{backgroundColor: i.bg, color: i.fg}}
            title={i.label}
          >
            {i.special === 'mastercard' ? (
              <MastercardMark />
            ) : i.special === 'maestro' ? (
              <MaestroMark />
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-[0.04em]">{i.label}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
        <span aria-hidden className="mr-1">{'\u{1F512}'}</span>
        {t('cart.secure_checkout_note')}
      </p>
    </div>
  );
}
