/**
 * AI-readable factual block.
 */
import type {AiKeyFact} from '@gberg/product-schema';
import {Eyebrow} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

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
  const t = useT();
  if (!entitySummary && !(keyFacts && keyFacts.length) && !compatibilitySummary) {
    return null;
  }
  return (
    <section
      aria-label={t('pdp.product_overview')}
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <Eyebrow>{t('pdp.product_overview')}</Eyebrow>
      {entitySummary ? (
        <p className="mt-3 text-[var(--color-text)] leading-relaxed">{entitySummary}</p>
      ) : null}

      {keyFacts && keyFacts.length > 0 ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">{t('pdp.key_facts')}</p>
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
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">{t('pdp.compatibility')}</p>
          <p className="mt-1 text-sm text-[var(--color-text)]">{compatibilitySummary}</p>
        </div>
      ) : null}

      {customerQuestionSummary ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">{t('pdp.most_asked')}</p>
          <p className="mt-1 text-sm text-[var(--color-text)]">{customerQuestionSummary}</p>
        </div>
      ) : null}
    </section>
  );
}
