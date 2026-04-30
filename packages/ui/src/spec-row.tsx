import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "./cn";

export interface SpecRowProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional 24px leading icon. Inherits muted color so the row reads as
   * data; pass a coloured node to override per-row.
   */
  icon?: ReactNode;
  /** Uppercase 11px tracked label rendered above the value. */
  label: string;
  /** Primary value — 17px medium charcoal. */
  value: ReactNode;
  /** Optional inline unit, rendered after the value. */
  unit?: string;
  /** Optional second-line muted note (13px). */
  helpText?: ReactNode;
}

/**
 * Editorial spec row used inside the new PDP description block.
 * Layout is intentionally NOT a `<table>` — `SpecsTable` covers the
 * tabular case. `SpecRow` is for narrative rows where the value sits
 * below the label and (optionally) carries a help note. Hairline
 * border-bottom collapses on `:last-child`.
 *
 * If the row is given an `onClick`, it switches to `role="button"`
 * with hover-tinted surface — reserved for accessory upsells, not
 * for static spec dumps.
 */
export function SpecRow({
  icon,
  label,
  value,
  unit,
  helpText,
  className,
  onClick,
  ...rest
}: SpecRowProps) {
  const interactive = typeof onClick === "function";
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      className={cn(
        "flex items-start gap-[var(--spec-row-gap,1rem)] border-b border-[var(--color-border)] py-4 last:border-b-0",
        interactive && "cursor-pointer hover:bg-[var(--color-surface-muted)] transition-colors",
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span
          aria-hidden
          className="inline-flex h-[var(--spec-icon-size,1.5rem)] w-[var(--spec-icon-size,1.5rem)] flex-none items-center justify-center text-[var(--color-text-muted)]"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[var(--spec-label-size,0.6875rem)] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-muted)] leading-none">
          {label}
        </p>
        <p className="mt-1 text-[var(--spec-value-size,1.0625rem)] font-medium text-[var(--color-text)] leading-snug">
          {value}
          {unit ? (
            <span className="ml-1 font-normal text-[var(--color-text-muted)]">
              {unit}
            </span>
          ) : null}
        </p>
        {helpText ? (
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)] leading-relaxed">
            {helpText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
