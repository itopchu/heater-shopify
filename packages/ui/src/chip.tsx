import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ChipTone = "neutral" | "spec";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  selected?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  /**
   * Visual tone:
   *  - `neutral` (default): white surface + hairline border. Reads as an
   *    interactive filter / selectable label.
   *  - `spec`: warm-muted surface, transparent border. Reads as data
   *    (a stat tile inside the structured spec block) rather than as
   *    a tappable filter.
   */
  tone?: ChipTone;
}

/** Small selectable label. Used for filter chips, badges, spec chips. */
export function Chip({
  children,
  selected = false,
  removable = false,
  onRemove,
  tone = "neutral",
  className,
  ...rest
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm",
        selected
          ? "bg-[var(--color-primary)] text-[var(--color-primary-fg,white)] border-transparent"
          : tone === "spec"
            ? "bg-[var(--color-surface-muted)] border-transparent text-[var(--color-text)]"
            : "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]",
        className,
      )}
      {...rest}
    >
      {children}
      {removable && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
