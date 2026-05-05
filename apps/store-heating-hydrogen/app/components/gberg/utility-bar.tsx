/**
 * Top utility bar: shipping/trust/promo + market selector slot.
 *
 * Design Refresh — April 2026 (Complaint #4: "Lack of emphasizing icons —
 * warranty, return, delivery, cart"):
 * Replaces the text-only trust copy with `<TrustStrip inverse>` driving the
 * 4 trust icons. Charcoal bar with white tracked-out type retained.
 *
 * The Hydrogen storefront is currently English-only (see
 * `app/lib/gberg/i18n.ts`). When DE/NL/FR are restored, swap the inline
 * strings for `t('utility_bar.delivery_label')` etc.
 */
import {
  TrustStrip,
  TrustDeliveryIcon,
  TrustReturnIcon,
  TrustWarrantyIcon,
  TrustSecureIcon,
} from '@gberg/ui';
import {tFor, isSupportedLocale, DEFAULT_LOCALE} from '~/lib/gberg/i18n';
import {PHONE_TEL_HREF} from '~/lib/gberg/contact';
import LanguageSwitcher from './language-switcher';

export function UtilityBar({locale}: {locale: string}) {
  const t = tFor(isSupportedLocale(locale) ? locale : DEFAULT_LOCALE);
  /*
   * Compact + progressively responsive utility bar.
   *
   * Vertical: py-1.5 (6px t/b) gives a thin ~36px charcoal strip.
   * Icons:    h-4 w-4 (16px) instead of TrustStrip's default 24px so 4
   *           marks fit next to the LanguageSwitcher at desktop.
   * Labels:   whitespace-nowrap so a tight column can't push e.g.
   *           "FREE EU / DELIVERY" onto two lines and bloat the row.
   *
   * Progressive reveal — trust marks appear by viewport, ordered by
   * conversion impact (delivery > warranty > returns > secure):
   *   <sm  (≤639px)  : 1 mark (delivery) — keeps a visible trust line
   *                    next to the language switcher on phones; without
   *                    it the dark bar looked empty on mobile.
   *   sm   (640px+)  : 2 marks (delivery + warranty)
   *   md   (768px+)  : 3 marks (+ returns)
   *   lg   (1024px+) : 4 marks (+ secure checkout)
   *   xl   (1280px+) : 4 marks + phone
   * Cumulative nth-child(-n+N) variants — items in the array stay in
   * priority order so the visible subset is always the highest-value
   * one. The array order matters: never resort it without re-reading
   * this comment.
   */
  return (
    <div className="bg-[var(--color-surface-inverse)] text-[var(--color-text-inverse)]">
      <div className="container-x flex items-center justify-between gap-3 py-1">
        <TrustStrip
          inverse
          className="
            flex-1 min-w-0
            [&_svg]:h-3 [&_svg]:w-3 sm:[&_svg]:h-3.5 sm:[&_svg]:w-3.5
            [&_.leading-none]:whitespace-nowrap
            [&_.leading-none]:text-[10px] sm:[&_.leading-none]:text-[11px]
            [&_li]:gap-1 sm:[&_li]:gap-1.5
            [&_ul]:gap-2.5 sm:[&_ul]:gap-4
            [&_li]:hidden
            [&_li:nth-child(-n+2)]:flex
            sm:[&_li:nth-child(-n+3)]:flex
            md:[&_li:nth-child(-n+4)]:flex
            [&_li]:!text-white
          "
          items={[
            {icon: <TrustDeliveryIcon />, label: t('utility_bar.paid_shipping')},
            {icon: <TrustWarrantyIcon />, label: t('utility_bar.warranty_10y')},
            {icon: <TrustReturnIcon />, label: t('utility_bar.returns_30d')},
            {icon: <TrustSecureIcon />, label: t('utility_bar.secure_checkout')},
          ]}
        />
        <div className="ml-3 flex flex-none items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em]">
          <a
            href={PHONE_TEL_HREF}
            className="hidden xl:inline tracking-normal opacity-80 normal-case hover:opacity-100 hover:text-[var(--color-primary)] transition-colors"
          >
            {t('utility_bar.need_help_phone')}
          </a>
          <LanguageSwitcher locale={isSupportedLocale(locale) ? locale : DEFAULT_LOCALE} />
        </div>
      </div>
    </div>
  );
}
