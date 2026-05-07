/**
 * Language switcher dropdown. Controlled component (useState + portal-less
 * absolute panel). Closes on:
 *   - selecting a locale (the click that triggers navigation)
 *   - clicking outside the dropdown
 *   - pressing Escape
 *   - successful navigation (pathname change)
 *
 * The trigger shows the active locale's two-letter code; the menu lists
 * every supported locale by its endonym ("Deutsch", "Nederlands") so users
 * recognise their language without knowing the code.
 */
import {useEffect, useRef, useState} from 'react';
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

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close after navigation completes (locale change → new pathname).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={wrapRef} className="relative z-[60]">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('language_switcher.aria_label', {name: LOCALE_NAME[current]})}
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer select-none inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[12px] uppercase tracking-[0.12em] font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors"
      >
        <span aria-hidden className="opacity-80">▸</span>
        <span>{LOCALE_LABEL[current]}</span>
        <span
          aria-hidden
          className={`text-[8px] opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>
      {open ? (
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
                onClick={() => setOpen(false)}
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
      ) : null}
    </div>
  );
}

export {LanguageSwitcher as LanguageSwitcher};

// Back-compat — kept as a no-op for any direct call sites that may still
// import this name. New usage should import the default export.
export function LanguageSwitcherButton(): null {
  return null;
}
