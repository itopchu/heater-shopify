/**
 * AI-readable factual block.
 */
import type {AiKeyFact} from '@gberg/product-schema';
import {Eyebrow} from '@gberg/ui';

export interface AiBlockProps {
  entitySummary?: string;
  keyFacts?: AiKeyFact[] | null;
  compatibilitySummary?: string;
  customerQuestionSummary?: string;
}

export function AiBlock({
  entitySummary,
  keyFacts,
  compatibilitySummary,
  customerQuestionSummary,
}: AiBlockProps) {
  if (!entitySummary && !(keyFacts && keyFacts.length) && !compatibilitySummary) {
    return null;
  }
  return (
    <section
      aria-label="Product overview"
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <Eyebrow>Product overview</Eyebrow>
      {entitySummary ? (
        <p className="mt-3 text-[var(--color-text)] leading-relaxed">{entitySummary}</p>
      ) : null}

      {keyFacts && keyFacts.length > 0 ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">Key facts</p>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {keyFacts.map((f, i) => (
              <li
                key={`${f.label}-${i}`}
                className="flex gap-2 text-sm text-[var(--color-text)]"
              >
                <span className="min-w-[7rem] font-medium text-[var(--color-text-muted)]">
                  {f.label}
                </span>
                <span>{f.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {compatibilitySummary ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">Compatibility</p>
          <p className="mt-1 text-sm text-[var(--color-text)]">{compatibilitySummary}</p>
        </div>
      ) : null}

      {customerQuestionSummary ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">Most asked</p>
          <p className="mt-1 text-sm text-[var(--color-text)]">{customerQuestionSummary}</p>
        </div>
      ) : null}
    </section>
  );
}
