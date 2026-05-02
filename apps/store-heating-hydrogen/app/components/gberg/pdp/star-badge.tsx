/**
 * Compact star rating + review count badge.
 *
 * Renders nothing when there are zero reviews (per the empty-section
 * rule used elsewhere — never render a hardcoded "no reviews yet" or
 * skeleton). Once Judge.me starts returning a non-zero count, the
 * badge appears automatically.
 *
 * Pure CSS stars (overlay technique): a grey row of 5 stars covered
 * by a primary-coloured row clipped to `(rating/5)*100%`. No image
 * assets, no SVGs to maintain.
 */
import {useT} from '~/lib/gberg/i18n';

export interface StarBadgeProps {
  rating: number; // 0–5
  count: number; // total review count
  /** Render as a link to the in-page reviews block when an anchor is provided. */
  href?: string;
  className?: string;
}

const FIVE_STARS = '★★★★★';

export function StarBadge({rating, count, href, className}: StarBadgeProps) {
  const t = useT();
  if (!count || count <= 0) return null;
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const label = t('pdp.review_aria', {rating: rating.toFixed(1), count});

  const inner = (
    <>
      <span
        aria-hidden
        className="relative inline-block font-mono text-[15px] leading-none tracking-[-0.05em]"
      >
        <span className="text-[var(--color-border-strong,#d1d5db)]">{FIVE_STARS}</span>
        <span
          className="absolute inset-0 overflow-hidden text-[var(--color-primary)]"
          style={{width: `${pct}%`}}
        >
          {FIVE_STARS}
        </span>
      </span>
      <span className="text-[12px] tabular-nums text-[var(--color-text-muted)]">
        {rating.toFixed(1)}
      </span>
      <span className="text-[12px] tabular-nums text-[var(--color-text-muted)]">
        ({count})
      </span>
    </>
  );

  const containerClass = `inline-flex items-center gap-1.5 ${className ?? ''}`;

  if (href) {
    return (
      <a
        href={href}
        aria-label={label}
        className={`${containerClass} group transition-colors hover:text-[var(--color-text)]`}
      >
        {inner}
      </a>
    );
  }
  return (
    <span className={containerClass} aria-label={label}>
      {inner}
    </span>
  );
}
