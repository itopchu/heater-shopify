/**
 * Mobile / tablet (<lg) navigation drawer. Hydrogen port.
 */
import {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router';
import {localeHref} from '~/lib/gberg/href';
import {SearchInput} from '~/components/gberg/search/search-input';
import type {MegaColumn} from './mega-menu';

export interface MobileDrawerProps {
  locale: string;
  columns: MegaColumn[];
}

export function MobileDrawer({locale, columns}: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex h-10 w-10 items-center justify-center text-[var(--color-text)] hover:text-[var(--color-primary)]"
      >
        <span aria-hidden className="flex flex-col gap-[5px]">
          <span className="block h-[2px] w-6 bg-current" />
          <span className="block h-[2px] w-6 bg-current" />
          <span className="block h-[2px] w-6 bg-current" />
        </span>
      </button>

      <div
        className="drawer-overlay lg:hidden"
        data-open={open}
        onClick={close}
        aria-hidden={!open}
      />

      <aside
        className="drawer-panel drawer-panel--right lg:hidden"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <p className="font-[var(--font-display)] text-xl font-semibold tracking-tight">
            G-Berg
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[var(--color-border)] px-5 py-5">
            <SearchInput locale={locale} variant="page" />
          </div>

          <nav aria-label="Mobile navigation" className="px-5 py-2">
            <ul className="divide-y divide-[var(--color-border)]">
              {columns.map((col) => (
                <li key={col.label}>
                  {col.sub && col.sub.length > 0 ? (
                    <details className="group">
                      <summary className="flex cursor-pointer items-center justify-between py-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]">
                        <span>{col.label}</span>
                        <span
                          aria-hidden
                          className="text-[var(--color-text-muted)] transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <ul className="space-y-3 pb-4 pl-3">
                        <li>
                          <Link
                            to={col.href}
                            onClick={close}
                            className="link-accent text-sm text-[var(--color-text)]"
                          >
                            Browse all
                          </Link>
                        </li>
                        {col.sub.map((s) => (
                          <li key={s.href}>
                            <Link
                              to={s.href}
                              onClick={close}
                              className="link-accent text-sm text-[var(--color-text)]"
                            >
                              {s.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <Link
                      to={col.href}
                      onClick={close}
                      className="block py-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text)] hover:text-[var(--color-primary)]"
                    >
                      {col.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-[var(--color-border)] px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Quick links
            </p>
            <ul className="mt-3 space-y-3">
              <li>
                <Link
                  to={localeHref(locale, '/cart')}
                  onClick={close}
                  className="link-accent text-sm"
                >
                  Cart
                </Link>
              </li>
              <li>
                <Link
                  to={localeHref(locale, '/pages/contact')}
                  onClick={close}
                  className="link-accent text-sm"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

      </aside>
    </>
  );
}
