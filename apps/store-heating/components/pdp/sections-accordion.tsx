/**
 * Server component. Renders the long-form `content.sections_en` (or DE
 * fallback) as a rich accordion. Each section may carry sanitized HTML which
 * we render via `dangerouslySetInnerHTML` — the upstream sanitiser runs in
 * `agent/sync/sanitize-body.ts` before write.
 */
import type { ContentSection } from "@gberg/product-schema";
import { cn } from "@gberg/ui";

export interface SectionsAccordionProps {
  sections: ContentSection[];
  /**
   * When the EN translation hasn't run yet we fall back to DE; show a small
   * notice so users know what they're seeing.
   */
  source: "en" | "de" | null;
  className?: string;
}

export function SectionsAccordion({ sections, source, className }: SectionsAccordionProps) {
  if (!sections.length) return null;
  return (
    <div className={cn("space-y-3", className)}>
      {source === "de" ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Translation pending — viewing source content (DE).
        </p>
      ) : null}
      <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {sections.map((section, i) => (
          <details
            key={`${section.title || "section"}-${i}`}
            className="group [&_summary::-webkit-details-marker]:hidden"
            // First section open by default to show the page isn't empty even
            // before the user interacts.
            open={i === 0}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-left font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]">
              <span className="flex-1">{section.title || `Section ${i + 1}`}</span>
              <span aria-hidden className="text-[var(--color-text-muted)] transition group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="prose prose-sm max-w-none pb-4 pr-2 pt-1 text-[var(--color-text)]">
              {section.html ? (
                <div dangerouslySetInnerHTML={{ __html: section.html }} />
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
