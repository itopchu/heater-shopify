/**
 * Header search overlay. Hydrogen port.
 */
import {useCallback, useEffect, useState} from 'react';
import {useT} from '~/lib/gberg/i18n';
import {SearchInput} from './search-input';

export function SearchOverlay({locale}: {locale: string}) {
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
        aria-label={t('header.open_search')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 border-b-2 border-transparent px-1 py-1 text-[12px] uppercase tracking-[0.12em] font-semibold text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
      >
        <span aria-hidden>⌕</span>
        <span>{t('common.search')}</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={t('common.search')}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('header.close_search')}
            onClick={close}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="relative bg-[var(--color-surface)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]">
            <div className="container-x py-8">
              <div className="flex items-start justify-between gap-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  {t('header.search_catalogue')}
                </p>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t('header.close_search')}
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                >
                  {t('common.close')} ✕
                </button>
              </div>
              <div className="mt-6">
                <SearchInput
                  locale={locale}
                  variant="overlay"
                  onClose={close}
                  autoFocus
                />
              </div>
            </div>
            <div className="rule-accent" aria-hidden />
          </div>
        </div>
      ) : null}
    </>
  );
}
