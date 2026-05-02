/**
 * Reusable collapsible PDP section.
 *
 * Native <details>/<summary> so it works without JS, is keyboard-accessible
 * out of the box, and SEO crawlers see the full content (collapsed
 * `<details>` markup is still in the DOM).
 *
 * Default state: closed. Open on click (or Enter/Space when focused).
 * The plus glyph rotates 45° to a × when open.
 */
import type {ReactNode} from 'react';
import {Eyebrow} from '@gberg/ui';

export interface CollapsibleSectionProps {
  /** Small uppercase muted label above the title. */
  eyebrow?: string;
  /** Section title — sits inside the summary as the heading. */
  title: string;
  /** Default-open if true; default false (collapsed). */
  defaultOpen?: boolean;
  /** Optional id for in-page anchors and for aria-controls hooks. */
  id?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  eyebrow,
  title,
  defaultOpen = false,
  id,
  children,
}: CollapsibleSectionProps) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group border-b border-[var(--color-border)] py-5 [&_summary::-webkit-details-marker]:hidden first:border-t"
    >
      <summary className="flex cursor-pointer items-start justify-between gap-4 list-none">
        <div className="flex-1">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className="mt-1 font-[var(--font-display)] text-[1.35rem] font-semibold leading-tight text-[var(--color-text)] md:text-2xl">
            {title}
          </h2>
        </div>
        <span
          aria-hidden
          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-lg leading-none text-[var(--color-text)] transition-transform duration-200 group-open:rotate-45 group-open:border-[var(--color-primary)] group-open:text-[var(--color-primary)]"
        >
          +
        </span>
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}
