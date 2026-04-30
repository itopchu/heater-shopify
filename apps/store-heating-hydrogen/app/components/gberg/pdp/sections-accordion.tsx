/**
 * Long-form sections rendered as a rich accordion.
 */
import type {ContentSection} from '@gberg/product-schema';
import {cn} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

export interface SectionsAccordionProps {
  sections: ContentSection[];
  source: 'en' | 'de' | null;
  className?: string;
}

export function SectionsAccordion({sections, source, className}: SectionsAccordionProps) {
  const t = useT();
  if (!sections.length) return null;
  return (
    <div className={cn('space-y-3', className)}>
      {source === 'de' ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          {t('pdp.translation_pending_de')}
        </p>
      ) : null}
      <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {sections.map((section, i) => (
          <details
            key={`${section.title || 'section'}-${i}`}
            className="group [&_summary::-webkit-details-marker]:hidden"
            open={i === 0}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-left font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]">
              <span className="flex-1">{section.title || t('pdp.section_fallback', {n: i + 1})}</span>
              <span
                aria-hidden
                className="text-[var(--color-text-muted)] transition group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="prose prose-sm max-w-none pb-4 pr-2 pt-1 text-[var(--color-text)]">
              {section.html ? (
                <div dangerouslySetInnerHTML={{__html: section.html}} />
              ) : section.text ? (
                section.text
                  .split(/\n\s*\n/)
                  .map((para, idx) => <p key={idx}>{para}</p>)
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
