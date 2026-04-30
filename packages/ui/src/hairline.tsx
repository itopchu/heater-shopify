import type {HTMLAttributes} from "react";
import {cn} from "./cn";

export type HairlineOrientation = "horizontal" | "vertical";
export type HairlineTone = "default" | "accent";

export interface HairlineProps extends HTMLAttributes<HTMLSpanElement> {
  /** Default `horizontal`. */
  orientation?: HairlineOrientation;
  /**
   * `default` paints the muted border token; `accent` paints the brand
   * accent rule (red on the heating skin) — used for editorial dividers.
   */
  tone?: HairlineTone;
}

/**
 * Single-pixel rule. Width / height is the caller's responsibility — pair
 * with `w-full`, `h-6`, etc., depending on context. Renders as a `<span>`
 * with `role="separator"` and `aria-orientation` so assistive tech reads
 * the divider correctly.
 *
 * Use cases: section dividers, footer rules, vertical separators inside
 * the TrustStrip, eyebrow underlines.
 */
export function Hairline({
  orientation = "horizontal",
  tone = "default",
  className,
  ...rest
}: HairlineProps) {
  const colorClass =
    tone === "accent"
      ? "bg-[var(--color-rule-accent,var(--color-primary))]"
      : "bg-[var(--color-rule,var(--color-border))]";
  const sizeClass = orientation === "horizontal" ? "h-px w-full" : "w-px h-full";
  return (
    <span
      role="separator"
      aria-orientation={orientation}
      className={cn("block", sizeClass, colorClass, className)}
      {...rest}
    />
  );
}
