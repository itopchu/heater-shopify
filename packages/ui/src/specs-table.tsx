import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SpecsTableRow {
  label: string;
  value: ReactNode;
  /** Optional unit, rendered after value. */
  unit?: string;
  /**
   * Optional leading icon, rendered in a 24px column ahead of the label.
   * Inherits `var(--color-text-muted)` so the table reads as muted data;
   * pass a coloured icon node if you want to override per-row.
   */
  icon?: ReactNode;
}

/**
 * @deprecated Prefer `SpecsTableRow`. The bare `SpecRow` name is now used
 * by the standalone `<SpecRow>` component in `./spec-row`. This alias is
 * kept so existing route imports (`type SpecRow` from `@gberg/ui`) keep
 * compiling without churn.
 */
export type SpecRow = SpecsTableRow;

export interface SpecsTableProps {
  rows: SpecsTableRow[];
  emptyState?: ReactNode;
  className?: string;
  caption?: string;
}

/**
 * Server-rendered specs table. Always emits semantic <table>, even when empty,
 * so SEO crawlers can still see the empty-state messaging.
 */
export function SpecsTable({ rows, emptyState, className, caption }: SpecsTableProps) {
  const populated = rows.filter((r) => r.value !== undefined && r.value !== null && r.value !== "");
  if (populated.length === 0 && emptyState) {
    return (
      <div className={cn("rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 text-sm text-[var(--color-text-muted)]", className)}>
        {emptyState}
      </div>
    );
  }
  return (
    <table className={cn("w-full border-collapse text-sm", className)}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <tbody>
        {populated.map((row, i) => (
          <tr
            key={`${row.label}-${i}`}
            className="border-b border-[var(--color-border)] last:border-b-0"
          >
            {row.icon ? (
              <td
                aria-hidden
                className="w-[var(--spec-icon-size,1.5rem)] py-3 pr-3 text-[var(--color-text-muted)] align-top"
              >
                <span className="inline-flex h-[var(--spec-icon-size,1.5rem)] w-[var(--spec-icon-size,1.5rem)] items-center justify-center">
                  {row.icon}
                </span>
              </td>
            ) : null}
            <th
              scope="row"
              className="w-1/2 py-3 pr-4 text-left font-medium text-[var(--color-text-muted)] align-top"
            >
              {row.label}
            </th>
            <td className="py-3 text-[var(--color-text)]">
              {row.value}
              {row.unit ? <span className="ml-1 text-[var(--color-text-muted)]">{row.unit}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
