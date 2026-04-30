/**
 * Top utility bar: shipping/trust/promo + market selector slot.
 * Spec ref: shop/02_wireframes_page_blueprints.md "Utility bar".
 *
 * Charcoal bar with white tracked-out type — anchors the dark/red/white
 * brand identity from the very top of every page.
 *
 * i18n: this is the canonical mount point for the language/region switcher
 * (see components/language-switcher.tsx). Keeping it here means the picker
 * is visible on every storefront route without needing to edit header.tsx.
 */
import { LanguageSwitcher } from "./language-switcher";

export function UtilityBar({ locale }: { locale: string }) {
  return (
    <div className="bg-[var(--color-surface-inverse)] text-[var(--color-text-inverse)]">
      <div className="container-x flex items-center justify-between gap-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em]">
        <p className="hidden sm:block">
          Free EU delivery over &euro;500 &nbsp;&middot;&nbsp; 30&#8209;day returns &nbsp;&middot;&nbsp; Authorized G&#8209;Berg reseller
        </p>
        <p className="sm:hidden">Free EU delivery over &euro;500</p>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline tracking-normal opacity-80 normal-case">
            Need help? +49 (0)30 12345678
          </span>
          <span aria-hidden className="hidden md:inline text-[var(--color-primary)]">/</span>
          <LanguageSwitcher locale={locale} />
        </div>
      </div>
    </div>
  );
}
