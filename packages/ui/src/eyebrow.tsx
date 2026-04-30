import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface EyebrowProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /**
   * Visual tone. `accent` (default) = brand red. `muted` falls back to the
   * old neutral muted styling for places where red would over-emphasise.
   */
  tone?: "accent" | "muted";
  /**
   * When true, render a 2px × 1.5rem rule beneath the kicker. Inherits
   * `currentColor`, so an `accent` eyebrow paints a red rule and a
   * `muted` eyebrow paints a muted-charcoal rule. Off by default for
   * backward compatibility with existing call sites.
   */
  withRule?: boolean;
}

/**
 * Small uppercase kicker above a section heading. Defaults to brand-accent
 * (red on the heating skin) so red bleeds through every section without
 * additional work — this is one of the main "premium living" moves.
 */
export function Eyebrow({
  children,
  className,
  tone = "accent",
  withRule = false,
  ...rest
}: EyebrowProps) {
  return (
    <span
      className={cn(
        // `text-[length:...]` and `text-[color:...]` type hints are required
        // for Tailwind v4 — without them, two `text-[var(...)]` classes on the
        // same element are treated as ambiguous and the size rule never compiles.
        // Symptom: the eyebrow rendered at 16px charcoal on the home hero
        // even though the tokens were correct.
        "inline-block text-[length:var(--text-eyebrow-sm,0.6875rem)] uppercase tracking-[0.18em] font-semibold leading-none",
        tone === "accent"
          ? "text-[color:var(--color-eyebrow,var(--color-primary))]"
          : "text-[color:var(--color-text-muted)]",
        className,
      )}
      {...rest}
    >
      {children}
      {withRule ? (
        <span
          aria-hidden
          className="mt-2 block h-[2px] w-6 bg-current"
        />
      ) : null}
    </span>
  );
}
