/**
 * "We accept" payment method strip — flat SVG marks shown under the cart
 * checkout CTA to build trust before the customer leaves the cart for
 * Shopify-hosted checkout.
 *
 * The marks are deliberately compact + monochrome-on-white (with a few
 * official brand colours for recognition). They are:
 *   - Wordmarks for Visa, MC, AmEx, PayPal, Klarna, Apple/Google/Shop Pay
 *   - The two EU-specific wallets we plan to accept once Shopify Payments is
 *     active: Wero (replacing SOFORT in 2026) and iDeal (NL standard).
 *
 * Once the merchant activates Shopify Payments + Klarna + PayPal in admin,
 * the corresponding methods become real at checkout. Until then, this is
 * aspirational signalling — the standard EU e-commerce convention.
 */
import {useT} from '~/lib/gberg/i18n';

const ICONS = [
  {key: 'visa', label: 'Visa', bg: '#1A1F71', fg: '#FFFFFF'},
  {key: 'mc', label: 'MC', bg: '#FFFFFF', fg: '#000000', special: 'mastercard' as const},
  {key: 'amex', label: 'AMEX', bg: '#016FD0', fg: '#FFFFFF'},
  {key: 'paypal', label: 'PayPal', bg: '#FFFFFF', fg: '#003087'},
  {key: 'klarna', label: 'Klarna', bg: '#FFA8CD', fg: '#17120F'},
  {key: 'applepay', label: ' Pay', bg: '#000000', fg: '#FFFFFF'},
  {key: 'gpay', label: 'G Pay', bg: '#FFFFFF', fg: '#5F6368'},
  {key: 'shoppay', label: 'Shop Pay', bg: '#5A31F4', fg: '#FFFFFF'},
  {key: 'ideal', label: 'iDEAL', bg: '#FFFFFF', fg: '#CC0066'},
  {key: 'wero', label: 'Wero', bg: '#FFFFFF', fg: '#FF6B00'},
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
