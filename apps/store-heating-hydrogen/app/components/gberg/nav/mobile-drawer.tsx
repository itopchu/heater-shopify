/**
 * Mobile / tablet (<lg) navigation drawer. Hydrogen port.
 */
import {useCallback, useEffect, useState} from 'react';
import {Link, NavLink} from 'react-router';
import {localeHref} from '~/lib/gberg/href';
import {useT} from '~/lib/gberg/i18n';
import {SearchInput} from '~/components/gberg/search/search-input';
import {navLabel, type MegaColumn} from './mega-menu';

export interface MobileDrawerProps {
  locale: string;
  columns: MegaColumn[];
}

export function MobileDrawer({locale, columns}: MobileDrawerProps) {
  const t = useT();
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
        aria-label={t('header.open_menu')}
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
        aria-label={t('header.mobile_nav')}
        // When closed, `inert` removes the whole subtree from the tab order
        // AND the accessibility tree — replaces the WCAG-violating
        // aria-hidden-on-focusable-content pattern flagged by axe rule
        // `aria-hidden-focus`. Spread because React 18's typings don't have
        // `inert` yet (added in 19); the runtime accepts the empty-string
        // attribute form on all evergreen browsers.
        // suppressHydrationWarning: React 18's hydration check normalises
        // boolean-flavoured attributes differently than the SSR string
        // serialiser, producing a false-positive #418 mismatch on the
        // empty-string inert form. The value is in fact identical on
        // both sides.
        suppressHydrationWarning
        {...(!open ? {inert: ''} : {})}
      >
        {/* Header — compact, brand-anchored, single tap row.
            Two-line accent bar pinned bottom for visual continuity with
            the rest of the brand surfaces (eyebrow rule motif). */}
        <div className="relative flex items-center justify-between bg-[var(--color-surface)] px-4 py-3">
          <p className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-[var(--color-text)]">
            G-Berg
          </p>
          <button
            type="button"
            onClick={close}
            aria-label={t('header.close_menu')}
            className="-mr-1 inline-flex h-9 w-9 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            <span aria-hidden className="text-2xl leading-none">✕</span>
          </button>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[var(--color-border)]" />
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--color-surface)]">
          {/* Search — tighter, inline with bg tint so it visually
              registers as an input on small screens. */}
          <div className="bg-[var(--color-surface-muted)] px-4 py-3">
            <SearchInput locale={locale} variant="page" />
          </div>

          <nav aria-label={t('header.mobile_nav')} className="px-3 py-1">
            <ul className="divide-y divide-[var(--color-border)]">
              {columns.map((col) => {
                const label = navLabel(t, col.label);
                return (
                  <li key={col.label}>
                    {col.sub && col.sub.length > 0 ? (
                      <details className="group">
                        <summary className="flex cursor-pointer items-center justify-between px-2 py-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text)]">
                          <span>{label}</span>
                          <span
                            aria-hidden
                            className="text-base text-[var(--color-text-muted)] transition-transform group-open:rotate-45"
                          >
                            +
                          </span>
                        </summary>
                        <ul className="space-y-2 pb-3 pl-4">
                          <li>
                            <NavLink
                              to={col.href}
                              end
                              onClick={close}
                              className={({isActive}) =>
                                `block py-1 text-[13px] hover:text-[var(--color-primary)] ${
                                  isActive
                                    ? 'font-semibold text-[var(--color-primary)]'
                                    : 'text-[var(--color-text-muted)]'
                                }`
                              }
                            >
                              {t('common.browse_all')}
                            </NavLink>
                          </li>
                          {col.sub.map((s) => (
                            <li key={s.href}>
                              <NavLink
                                to={s.href}
                                end
                                onClick={close}
                                className={({isActive}) =>
                                  `block py-1 text-[13px] hover:text-[var(--color-primary)] ${
                                    isActive
                                      ? 'font-semibold text-[var(--color-primary)]'
                                      : 'text-[var(--color-text-muted)]'
                                  }`
                                }
                              >
                                {s.label}
                              </NavLink>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <NavLink
                        to={col.href}
                        end
                        onClick={close}
                        className={({isActive}) =>
                          `block px-2 py-3 text-[13px] font-semibold uppercase tracking-[0.1em] hover:text-[var(--color-primary)] ${
                            isActive
                              ? 'text-[var(--color-primary)]'
                              : 'text-[var(--color-text)]'
                          }`
                        }
                      >
                        {label}
                      </NavLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-1 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
              {t('header.quick_links')}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              <li>
                <Link
                  to={localeHref(locale, '/cart')}
                  onClick={close}
                  className="block py-1 text-[13px] font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                >
                  {t('header.cart')}
                </Link>
              </li>
              <li>
                <Link
                  to={localeHref(locale, '/pages/contact')}
                  onClick={close}
                  className="block py-1 text-[13px] font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                >
                  {t('header.contact')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

      </aside>
    </>
  );
}
