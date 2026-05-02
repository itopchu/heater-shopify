/**
 * Customer reviews block — full list with aggregate header.
 *
 * Pulls JudgemeData from the PDP loader and renders inside a
 * CollapsibleSection at the bottom of the PDP. Per the project
 * convention: the parent only renders this block when there's at
 * least one published review.
 *
 * Text-only per spec (no photo or video review attachments).
 */
import {useT} from '~/lib/gberg/i18n';
import type {JudgemeData} from '~/lib/gberg/judgeme';
import {StarBadge} from './star-badge';

export interface ReviewsBlockProps {
  data: JudgemeData;
}

const FIVE_STARS = '★★★★★';

function StarRow({rating}: {rating: number}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      aria-label={`${rating}/5`}
      className="relative inline-block font-mono text-[14px] leading-none tracking-[-0.05em]"
    >
      <span className="text-[var(--color-border-strong,#d1d5db)]">{FIVE_STARS}</span>
      <span
        className="absolute inset-0 overflow-hidden text-[var(--color-primary)]"
        style={{width: `${pct}%`}}
      >
        {FIVE_STARS}
      </span>
    </span>
  );
}

function formatDate(iso: string, intl: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(intl, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

function buildDistribution(reviews: JudgemeData['reviews']): number[] {
  const counts = [0, 0, 0, 0, 0]; // index 0 = 5★, index 4 = 1★
  for (const r of reviews) {
    const i = Math.max(1, Math.min(5, Math.round(r.rating)));
    counts[5 - i]++;
  }
  return counts;
}

export function ReviewsBlock({data}: ReviewsBlockProps) {
  const t = useT();
  if (!data || data.aggregate.count === 0) return null;
  const distribution = buildDistribution(data.reviews);
  const intl = 'en-GB'; // PDP route already passes locale; keep date format stable here

  return (
    <div className="space-y-8">
      {/* Aggregate card */}
      <div className="grid gap-6 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:grid-cols-[auto_1fr] md:gap-10 md:p-6">
        <div>
          <div className="font-[var(--font-display)] text-4xl font-semibold leading-none text-[var(--color-text)]">
            {data.aggregate.rating.toFixed(1)}
          </div>
          <div className="mt-2">
            <StarBadge rating={data.aggregate.rating} count={data.aggregate.count} />
          </div>
          <div className="mt-1 text-[12px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            {data.aggregate.count === 1
              ? t('pdp.review_count_singular', {count: data.aggregate.count})
              : t('pdp.review_count_plural', {count: data.aggregate.count})}
          </div>
        </div>
        <ul className="space-y-1.5 text-[13px]">
          {distribution.map((c, i) => {
            const star = 5 - i;
            const pct = data.aggregate.count
              ? (c / data.aggregate.count) * 100
              : 0;
            return (
              <li key={star} className="flex items-center gap-3">
                <span className="w-6 tabular-nums text-[var(--color-text-muted)]">
                  {star}★
                </span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--color-primary)]"
                    style={{width: `${pct}%`}}
                  />
                </span>
                <span className="w-8 text-right tabular-nums text-[var(--color-text-muted)]">
                  {c}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Review list */}
      <ul className="divide-y divide-[var(--color-border)]">
        {data.reviews.map((r) => (
          <li key={r.id} className="py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-3">
                <StarRow rating={r.rating} />
                {r.title ? (
                  <span className="font-semibold text-[var(--color-text)]">
                    {r.title}
                  </span>
                ) : null}
              </div>
              {r.createdAt ? (
                <span className="text-[12px] text-[var(--color-text-muted)]">
                  {formatDate(r.createdAt, intl)}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              <span>{r.reviewerName}</span>
              {r.verifiedBuyer ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-medium text-[var(--color-success,#15803d)]">
                    {t('pdp.review_verified_buyer')}
                  </span>
                </>
              ) : null}
            </div>
            {r.body ? (
              <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[var(--color-text)]">
                {r.body}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
