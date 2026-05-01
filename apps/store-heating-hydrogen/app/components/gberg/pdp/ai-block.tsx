/**
 * AI-readable factual block.
 *
 * Server-rendered semantic HTML pitched at LLM crawlers (GPTBot, ClaudeBot,
 * PerplexityBot) and answer engines. Mirrors visible product facts in
 * scannable headings so the page is ingestible without executing JS.
 *
 * Phase 3 wiring (2026-04-30):
 *   - `summaryBlock`: optional text from the product's `aix.summary_block`
 *     metaobject (`ai_summary_block` definition). Rendered inside its own
 *     `<section>` BELOW the customer-question summary so AI crawlers see a
 *     single, clean factual paragraph that doesn't compete with the
 *     marketing-flavoured `entitySummary`.
 *   - "Compatibility" + "Most asked" promoted from <p> wrappers to nested
 *     `<section>` + `<h3>` so semantic outline walkers (Bing, Google,
 *     screen readers) parse the structure cleanly.
 */
import type {AiKeyFact} from '@gberg/product-schema';
import {Eyebrow} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

export interface AiBlockSummaryBlock {
  /** Display title from the metaobject (optional). */
  title?: string;
  /** Plain factual paragraph for AI ingestion. */
  summary_text?: string;
  /** "diy" | "professional" | "homeowner" | … (free text). */
  audience?: string;
  /** Two-letter language hint, e.g. `en`, `de`. */
  language_code?: string;
}

export interface AiBlockProps {
  entitySummary?: string;
  keyFacts?: AiKeyFact[] | null;
  compatibilitySummary?: string;
  customerQuestionSummary?: string;
  /**
   * Optional metaobject-driven AI summary. When set, renders a dedicated
   * `<section>` with a clean factual paragraph for crawlers. Pass through
   * `undefined` to omit (no empty state — see CLAUDE.md merchant rule).
   */
  summaryBlock?: AiBlockSummaryBlock;
}

export function AiBlock({
  entitySummary,
  keyFacts,
  compatibilitySummary,
  customerQuestionSummary,
  summaryBlock,
}: AiBlockProps) {
  const t = useT();
  const hasSummaryBlock = Boolean(summaryBlock?.summary_text);
  if (
    !entitySummary &&
    !(keyFacts && keyFacts.length) &&
    !compatibilitySummary &&
    !customerQuestionSummary &&
    !hasSummaryBlock
  ) {
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
        <section className="mt-5" aria-label={t('pdp.compatibility')}>
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)]">
            {t('pdp.compatibility')}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text)]">{compatibilitySummary}</p>
        </section>
      ) : null}

      {customerQuestionSummary ? (
        <section className="mt-5" aria-label={t('pdp.most_asked')}>
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)]">
            {t('pdp.most_asked')}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text)]">{customerQuestionSummary}</p>
        </section>
      ) : null}

      {hasSummaryBlock ? (
        <section
          className="mt-5"
          aria-label={summaryBlock?.title ?? t('pdp.product_overview')}
          // The metaobject can carry its own language hint (e.g. `de` while
          // the rest of the page is `en` during a translation backfill).
          // Honouring it here keeps screen readers and Translate & Adapt
          // consistent when the merchant cross-language-stages content.
          {...(summaryBlock?.language_code
            ? {lang: summaryBlock.language_code}
            : {})}
        >
          {summaryBlock?.title ? (
            <h3 className="text-sm font-semibold text-[var(--color-text-muted)]">
              {summaryBlock.title}
            </h3>
          ) : null}
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">
            {summaryBlock?.summary_text}
          </p>
          {summaryBlock?.audience ? (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {summaryBlock.audience}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
