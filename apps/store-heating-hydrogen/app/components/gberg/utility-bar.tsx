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
      <div className="container-x flex items-center justify-between gap-4 py-1.5">
        <TrustStrip
          inverse
          className="
            flex-1
            [&_svg]:h-4 [&_svg]:w-4
            [&_.leading-none]:whitespace-nowrap
            [&_li]:hidden
            [&_li:first-child]:flex
            sm:[&_li:nth-child(-n+2)]:flex
            md:[&_li:nth-child(-n+3)]:flex
            lg:[&_li:nth-child(-n+4)]:flex
            [&_li]:!text-white
          "
          items={[
            {icon: <TrustDeliveryIcon />, label: t('utility_bar.free_eu_delivery')},
            {icon: <TrustWarrantyIcon />, label: t('utility_bar.warranty_10y')},
            {icon: <TrustReturnIcon />, label: t('utility_bar.returns_30d')},
            {icon: <TrustSecureIcon />, label: t('utility_bar.secure_checkout')},
          ]}
        />
        {/*
          Right cluster — phone hidden below xl: so it never collides
          with the trust strip. LanguageSwitcher always visible since
          it's a navigational primitive, not a promo.
        */}
        <div className="ml-4 flex flex-none items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em]">
          <a
            href="tel:+491722706648"
            className="hidden xl:inline tracking-normal opacity-80 normal-case hover:opacity-100 hover:text-[var(--color-primary)] transition-colors"
          >
            {t('utility_bar.need_help_phone')}
          </a>
          {/*
            Language switcher temporarily removed (May 2026). The
            translation pipeline is a content problem we're solving
            differently — until then, the storefront is English-only.
            The locale routes still work for direct URLs but no UI
            entry point invites users into them.
          */}
        </div>
      </div>
    </div>
  );
}
