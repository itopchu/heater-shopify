/**
 * PDP image gallery.
 *
 * Track B (April 2026): resilient at 1, 3, 5, 8 images.
 *  - 1 image  → hero only, centered with the same `max-w-md→lg→xl→none`
 *               ladder used elsewhere.
 *  - 2–5      → hero + thumbnail strip below.
 *  - 6+       → hero + scrollable thumb strip; if more than 5 thumbs would
 *               render, the 5th gets a `+N more` overlay that opens a
 *               lightweight modal showing every remaining image.
 *
 * Hero aspect: 3:4. Thumbnail aspect: 1:1. Thumbnails maintain object-cover;
 * the hero uses object-contain since catalog photos are studio-cut and
 * cropping the radiator out of frame on a tight aspect is worse than
 * letterboxing.
 */
import {useEffect, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {Image as ImageType} from '@gberg/product-schema';
import {cn} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

export interface GalleryProps {
  images: ImageType[];
  alt: string;
  className?: string;
}

const MAX_VISIBLE_THUMBS = 5;

export function Gallery({images, alt, className}: GalleryProps) {
  const t = useT();
  // Render an empty placeholder when no images — the catalog has 0
  // products with 0 images today, but degrade gracefully.
  if (!images?.length) {
    return (
      <div
        className={cn(
          'mx-auto aspect-[3/4] w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] sm:max-w-lg md:max-w-xl lg:mx-0 lg:max-w-none',
          className,
        )}
      />
    );
  }

  // We deliberately keep this a single-stateful component: the active
  // hero image is the only piece of internal state, set by clicking a
  // thumb or by the modal "View all" lightbox.
  const [activeIndex, setActiveIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const active = images[activeIndex] ?? images[0]!;

  const showThumbStrip = images.length > 1;
  const overflowCount = Math.max(0, images.length - MAX_VISIBLE_THUMBS);
  const visibleThumbs = images.slice(
    0,
    overflowCount > 0 ? MAX_VISIBLE_THUMBS : images.length,
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={t('pdp.gallery_open')}
        className="relative mx-auto block w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] aspect-[3/4] sm:max-w-lg md:max-w-xl lg:mx-0 lg:max-w-none"
      >
        <Image
          data={active}
          alt={active.altText ?? alt}
          aspectRatio="3/4"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 50vw"
          // PDP hero is the LCP candidate on this route — prioritise it.
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-contain"
        />
      </button>

      {showThumbStrip ? (
        <ul
          className={cn(
            'grid gap-2',
            // Up to 5 thumbs in a fixed grid; >5 collapses overflow into +N.
            visibleThumbs.length === 2 && 'grid-cols-2',
            visibleThumbs.length === 3 && 'grid-cols-3',
            visibleThumbs.length === 4 && 'grid-cols-4',
            visibleThumbs.length === 5 && 'grid-cols-5',
          )}
        >
          {visibleThumbs.map((img, i) => {
            const isLast = i === visibleThumbs.length - 1;
            const showOverflowChip = isLast && overflowCount > 0;
            const isActive = i === activeIndex;
            return (
              <li
                key={`${img.url}-${i}`}
                className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-muted)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (showOverflowChip) {
                      setModalOpen(true);
                    } else {
                      setActiveIndex(i);
                    }
                  }}
                  aria-label={
                    showOverflowChip
                      ? t('pdp.gallery_view_more', {count: overflowCount})
                      : t('pdp.gallery_show_image', {index: i + 1})
                  }
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'absolute inset-0 h-full w-full',
                    isActive
                      ? 'ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-surface)]'
                      : 'opacity-90 hover:opacity-100',
                  )}
                >
                  <Image
                    data={img}
                    alt={img.altText ?? `${alt} (view ${i + 2})`}
                    aspectRatio="1/1"
                    sizes="120px"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {showOverflowChip ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                      {t('pdp.gallery_view_more_label', {count: overflowCount})}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <GalleryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        images={images}
        alt={alt}
        startIndex={activeIndex}
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
 * Lightweight modal/lightbox for the gallery. ESC closes; backdrop click
 * closes. We don't ship full keyboard navigation (←/→) because Hydrogen's
 * server-render-first contract means this only mounts after hydration —
 * good enough for the +N overflow case the brief calls out.
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
  const active = images[index] ?? images[0]!;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pdp.gallery_aria')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pdp.gallery_close')}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-[var(--color-text)] shadow-md hover:bg-white"
        >
          {t('common.close')}
        </button>
        <div className="aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] sm:aspect-square">
          <Image
            data={active}
            alt={active.altText ?? alt}
            aspectRatio="1/1"
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="h-full w-full object-contain"
          />
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
                  className={cn(
                    'absolute inset-0 h-full w-full',
                    i === index
                      ? 'ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-black/60'
                      : 'opacity-80 hover:opacity-100',
                  )}
                >
                  <Image
                    data={img}
                    alt={img.altText ?? `${alt} (view ${i + 1})`}
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
