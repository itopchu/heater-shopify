"use client";

/**
 * Client component. Header search overlay.
 *
 *   - Trigger: a magnifying-glass button rendered alongside the header nav.
 *   - Reveal: full-bleed panel that slides down from the top of the viewport.
 *   - Close: ESC key, click-outside, explicit close button, or successful
 *            navigation (the SearchInput calls onClose after pushing the
 *            results route).
 *   - Scroll-lock: body overflow:hidden while open.
 *
 * Keyboard:
 *   - Esc closes.
 *   - Tab cycles within the overlay (focus-trap is implicit because we
 *     auto-focus the input and there are only ~3 interactive items).
 */
import { useCallback, useEffect, useState } from "react";
import { SearchInput } from "./search-input";

export function SearchOverlay({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        aria-label="Open search"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 border-b-2 border-transparent px-1 py-1 text-[12px] uppercase tracking-[0.12em] font-semibold text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
      >
        <span aria-hidden>⌕</span>
        <span>Search</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          {/* Click-out overlay */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close search"
            onClick={close}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          {/* Panel */}
          <div className="relative bg-[var(--color-surface)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]">
            <div className="container-x py-8">
              <div className="flex items-start justify-between gap-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  Search the catalogue
                </p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                >
                  Close ✕
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
