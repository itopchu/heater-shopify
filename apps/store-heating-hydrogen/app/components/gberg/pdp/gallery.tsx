/**
 * PDP image gallery.
 *
 * Redesign (May 2026) — the previous "click the hero → opens a modal" plus a
 * fixed N-column thumbnail grid read as unclear: at 5 columns the thumbs were
 * tiny and the active-state was a faint ring, and clicking the hero doing
 * something other than "be the hero" surprised people. This version uses the
 * conventional PDP gallery pattern:
 *
 *  - Hero shows the active image (object-contain — catalog photos are
 *    studio-cut squares; cropping is worse than letterboxing).
 *  - Prev / next chevrons overlay the hero (only when there's >1 image).
 *  - A small "{n} / {total}" counter sits in the corner.
 *  - A dedicated zoom button opens the full-size lightbox (the hero itself
 *    is no longer the modal trigger).
 *  - Thumbnails are a single horizontally-scrollable rail of fixed-size
 *    squares — works at 1, 3, 5, 12 images with no squishing — and the
 *    active thumb gets a solid 2px brand-red frame (inactive thumbs are
 *    dimmed), so the selection is unmistakable. The active thumb auto-
 *    scrolls into view when you page through with the chevrons.
 *
 * Hero aspect: 1:1. Thumbnail aspect: 1:1.
 */
import {useEffect, useRef, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {Image as ImageType} from '@gberg/product-schema';
import {cn} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

export interface GalleryProps {
  images: ImageType[];
  alt: string;
  className?: string;
}

export function Gallery({images, alt, className}: GalleryProps) {
  const t = useT();
  // All hooks run unconditionally — the empty-images branch is rendered
  // *after* the hook calls so the hook order stays stable (Rules of Hooks).
  const [activeIndex, setActiveIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const activeThumbRef = useRef<HTMLLIElement>(null);

  const count = images?.length ?? 0;
  const safeIndex = count > 0 ? Math.min(activeIndex, count - 1) : 0;

  // Keep the active thumbnail visible in the scrollable rail as the user
  // pages through with the chevrons. On the first render activeIndex is 0
  // and the rail is already at scrollLeft 0, so this is a no-op.
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [safeIndex]);

  // Render an empty placeholder when no images — the catalog has 0
  // products with 0 images today, but degrade gracefully.
  if (count === 0) {
    return (
      <div
        className={cn(
          'mx-auto aspect-square w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] sm:max-w-lg md:max-w-xl lg:mx-0 lg:max-w-none',
          className,
        )}
      />
    );
  }

  const active = images[safeIndex]!;
  const hasMany = count > 1;
  const go = (delta: number) =>
    setActiveIndex((i) => (Math.min(i, count - 1) + delta + count) % count);

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-md sm:max-w-lg md:max-w-xl lg:mx-0 lg:max-w-none',
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        {/* HERO */}
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)]">
          <Image
            data={active}
            alt={active.altText ?? alt}
            // Source catalog images are 1024×1024 square. Asking the CDN
            // for a non-square crop strips the sides and upscales — keep
            // the request on a pure-resize path by matching the source
            // ratio (1:1), same as the lightbox.
            aspectRatio="1/1"
            sizes="(max-width: 1023px) 92vw, 48vw"
            // PDP hero is the LCP candidate on this route — prioritise it.
            loading="eager"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-contain"
          />

          {/* Zoom — opens the full-size lightbox. */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label={t('pdp.gallery_zoom')}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-[var(--color-text)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur-sm transition hover:bg-white"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
            </svg>
          </button>

          {hasMany ? (
            <>
              {/* Prev / next — always visible (no hover on touch). */}
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t('pdp.gallery_prev')}
                className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--color-text)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur-sm transition hover:bg-white"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t('pdp.gallery_next')}
                className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--color-text)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur-sm transition hover:bg-white"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>

              {/* Position counter. */}
              <span
                aria-hidden
                className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white"
              >
                {t('pdp.gallery_counter', {current: safeIndex + 1, total: images.length})}
              </span>
            </>
          ) : null}
        </div>

        {/* THUMBNAIL RAIL — horizontally scrollable, fixed-size squares. */}
        {hasMany ? (
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {images.map((img, i) => {
              const isActive = i === safeIndex;
              return (
                <li
                  key={`${img.url}-${i}`}
                  ref={isActive ? activeThumbRef : undefined}
                  className="shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-label={t('pdp.gallery_show_image', {index: i + 1})}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'relative block h-16 w-16 overflow-hidden rounded-[var(--radius-md)] border-2 bg-[var(--color-surface-muted)] transition sm:h-[4.5rem] sm:w-[4.5rem]',
                      isActive
                        ? 'border-[var(--color-primary)]'
                        : 'border-transparent opacity-55 hover:opacity-100',
                    )}
                  >
                    <Image
                      data={img}
                      alt=""
                      aria-hidden
                      aspectRatio="1/1"
                      sizes="80px"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <GalleryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        images={images}
        alt={alt}
        startIndex={safeIndex}
        onSelect={setActiveIndex}
      />
    </div>
  );
}

interface GalleryModalProps {
  open: boolean;
  onClose: () => void;
  images: ImageType[];
  alt: string;
  startIndex: number;
  onSelect: (i: number) => void;
}

/**
 * Full-size lightbox. ESC + backdrop click close; ←/→ page through. Only
 * mounts after hydration (Hydrogen renders server-first), which is fine —
 * it's an enhancement over the always-present inline hero + chevrons.
 */
function GalleryModal({
  open,
  onClose,
  images,
  alt,
  startIndex,
  onSelect,
}: GalleryModalProps) {
  const t = useT();
  const [index, setIndex] = useState(startIndex);
  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, images.length]);
  if (!open) return null;
  const active = images[Math.min(index, images.length - 1)] ?? images[0]!;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pdp.gallery_aria')}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop — a real <button> (natively keyboard-operable) rather
          than a <div onClick>; Escape also closes via the document
          listener above. Same pattern as the header search overlay. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('pdp.gallery_close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/80"
      />
      <div className="relative z-10 w-full max-w-4xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pdp.gallery_close')}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-[var(--color-text)] shadow-md hover:bg-white"
        >
          {t('common.close')}
        </button>
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)]">
          <Image
            data={active}
            alt={active.altText ?? alt}
            aspectRatio="1/1"
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="absolute inset-0 h-full w-full object-contain"
          />
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
                aria-label={t('pdp.gallery_prev')}
                className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--color-text)] shadow-md hover:bg-white"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => (i + 1) % images.length)}
                aria-label={t('pdp.gallery_next')}
                className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--color-text)] shadow-md hover:bg-white"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          ) : null}
        </div>
        {images.length > 1 ? (
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <li
                key={`${img.url}-modal-${i}`}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    onSelect(i);
                  }}
                  aria-label={t('pdp.gallery_show_image', {index: i + 1})}
                  aria-current={i === Math.min(index, images.length - 1) ? 'true' : undefined}
                  className={cn(
                    'absolute inset-0 h-full w-full border-2 transition',
                    i === Math.min(index, images.length - 1)
                      ? 'border-[var(--color-primary)]'
                      : 'border-transparent opacity-70 hover:opacity-100',
                  )}
                >
                  <Image
                    data={img}
                    alt=""
                    aria-hidden
                    aspectRatio="1/1"
                    sizes="64px"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
