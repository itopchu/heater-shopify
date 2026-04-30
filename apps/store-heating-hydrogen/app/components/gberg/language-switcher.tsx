/**
 * Language switcher dropdown. Uses native HTML <details>/<summary> so it
 * works with zero JavaScript and remains keyboard-accessible. The trigger
 * shows the active locale's two-letter code; the menu lists every
 * supported locale by its endonym (its own name, e.g. "Deutsch") so users
 * recognize their language without needing to know the code.
 *
 * Translation strings are delivered via Shopify Translate & Adapt at
 * runtime — this component only flips the URL prefix and the @inContext
 * language hint downstream.
 */
import {Link, useLocation} from 'react-router';
import {SUPPORTED_LOCALES, LOCALE_LABEL, LOCALE_NAME, tFor, type Locale} from '~/lib/gberg/i18n';

interface Props {
  locale: string;
}

function swapLocaleInPath(pathname: string, current: string, next: string): string {
  const stripped = pathname.startsWith(`/${current}/`)
    ? pathname.slice(`/${current}`.length)
    : pathname === `/${current}`
      ? '/'
      : pathname;
  const cleaned = stripped.startsWith('/') ? stripped : `/${stripped}`;
  return `/${next}${cleaned === '/' ? '' : cleaned}`;
}

export default function LanguageSwitcher({locale}: Props) {
  const {pathname, search, hash} = useLocation();
  const current: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : 'en';
  const t = tFor(current);

  return (
    <details className="group relative z-[60]">
      <summary
        aria-label={t('language_switcher.aria_label', {name: LOCALE_NAME[current]})}
        className="list-none cursor-pointer select-none inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] uppercase tracking-[0.12em] font-semibold text-white hover:text-white transition-colors [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden className="opacity-80">▸</span>
        <span>{LOCALE_LABEL[current]}</span>
        <span aria-hidden className="text-[8px] opacity-70 group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div
        role="menu"
        aria-label={t('language_switcher.choose_language')}
        className="absolute right-0 top-full mt-1 min-w-[170px] rounded-sm bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] ring-1 ring-[var(--color-border)] py-1 z-[60]"
      >
        {SUPPORTED_LOCALES.map((loc) => {
          const isActive = loc === current;
          const target = isActive
            ? `${pathname}${search}${hash}`
            : `${swapLocaleInPath(pathname, current, loc)}${search}${hash}`;
          return (
            <Link
              key={loc}
              to={target}
              role="menuitem"
              aria-current={isActive ? 'true' : undefined}
              lang={loc}
              className={[
                'flex items-center justify-between gap-3 px-3 py-2 text-[13px] normal-case tracking-normal',
                isActive
                  ? 'bg-[var(--color-surface-muted)] text-[var(--color-text)] font-semibold'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
              ].join(' ')}
            >
              <span>{LOCALE_NAME[loc]}</span>
              <span
                aria-hidden
                className={[
                  'text-[10px] uppercase tracking-[0.12em] font-semibold',
                  isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]',
                ].join(' ')}
              >
                {LOCALE_LABEL[loc]}
              </span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

export {LanguageSwitcher as LanguageSwitcher};

// Back-compat — kept as a no-op for any direct call sites that may still
// import this name. New usage should import the default export.
export function LanguageSwitcherButton(): null {
  return null;
}
