/**
 * Server component. PDP "quick facts" chip row.
 * Spec ref: shop/11_google_search_ai_readiness_checklist.md — surface 4-6
 * factual chips above the fold so AI snippets and on-page answers can lift
 * them. Renders nothing (no DOM) when the list is empty.
 */
import type { QuickFact } from "@/lib/heating-derived";

export interface QuickFactsProps {
  facts: QuickFact[];
}

export function QuickFacts({ facts }: QuickFactsProps) {
  if (!facts.length) return null;
  return (
    <dl
      aria-label="Quick facts"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {facts.map((f) => (
        <div
          key={`${f.label}-${f.value}`}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
        >
          <dt className="text-[0.7rem] uppercase tracking-wide text-[var(--color-text-muted)]">
            {f.label}
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-[var(--color-text)]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
