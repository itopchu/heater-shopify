import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Semantic badge pill used in PDP and PLP cards.
 * Color tokens are read from CSS vars so brand themes can override them.
 *
 * Spec ref: shop/02_wireframes_page_blueprints.md "Heating product card contents"
 *  → bestseller pill, electric chip, new/sale pills.
 */
export type BadgeTone = "bestseller" | "electric" | "new" | "sale" | "eco" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  bestseller:
    "bg-[var(--color-primary)] text-[var(--color-primary-fg,white)] border-transparent",
  sale:
    "bg-[var(--color-primary)] text-[var(--color-primary-fg,white)] border-transparent",
  new: "bg-[var(--color-primary)] text-[var(--color-primary-fg,white)] border-transparent",
  electric:
    "bg-[var(--color-text,#111111)] text-white border-transparent",
  eco:
    "bg-[var(--color-success,#0f7a4a)] text-white border-transparent",
  neutral:
    "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]",
};

const KNOWN_TONES = new Set<string>([
  "bestseller",
  "sale",
  "new",
  "electric",
  "eco",
]);

/** Map a free-form badge label (`"bestseller"`, `"sale"`) to a known tone. */
export function badgeTone(label: string): BadgeTone {
  const k = label.trim().toLowerCase();
  if (KNOWN_TONES.has(k)) return k as BadgeTone;
  return "neutral";
}

/** Pretty label for built-in badges. Unknown labels pass through unchanged. */
export function badgeLabel(label: string): string {
  const k = label.trim().toLowerCase();
  switch (k) {
    case "bestseller":
      return "Bestseller";
    case "electric":
      return "Electric";
    case "new":
      return "New";
    case "sale":
      return "Sale";
    case "eco":
      return "Eco";
    default:
      return label;
  }
}

export interface BadgePillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function BadgePill({ tone = "neutral", children, className, ...rest }: BadgePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
