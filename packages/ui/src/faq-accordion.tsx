import type { ReactNode } from "react";
import { cn } from "./cn";

export interface FaqItem {
  id?: string;
  question: string;
  answer: ReactNode;
}

export interface FaqAccordionProps {
  items: FaqItem[];
  /** When true, allows multiple items open at once (uses <details>). */
  className?: string;
}

/**
 * Server-renderable FAQ accordion using <details>/<summary>. Critical for SEO
 * (visible content in HTML, no JS needed) per the master-execution prompt.
 * Open one at a time is *not* enforced — that requires JS; the accessibility
 * cost of doing so on the server is fine to leave as-is.
 */
export function FaqAccordion({ items, className }: FaqAccordionProps) {
  if (!items?.length) return null;
  return (
    <div className={cn("divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]", className)}>
      {items.map((item, idx) => (
        <details
          key={item.id ?? `faq-${idx}`}
          className="group [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-left font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]">
            <span className="flex-1">{item.question}</span>
            <span aria-hidden className="text-[var(--color-text-muted)] transition group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="pb-4 pt-1 pr-8 text-[var(--color-text-muted)] leading-relaxed">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
