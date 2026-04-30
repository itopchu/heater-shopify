import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/**
 * Variant treatment — see packages/theme-tokens/src/heating.css.
 *
 * primary    : charcoal fill / white text. Hover -> pure black. A 2px red
 *              bottom-rule animates in on hover (premium tailoring detail).
 * secondary  : white fill / charcoal text / 1px charcoal border. Hover swaps
 *              to inverse (charcoal fill / white text).
 * tertiary   : transparent / charcoal text / red 2px underline that grows
 *              on hover (left-to-right CSS gradient draw).
 * ghost      : transparent / charcoal text / muted hover surface.
 * destructive: error fill — kept for parity with the rest of the system.
 *
 * All variants ship sharp 2px corners (radius-sm) — round corners read soft
 * and SaaS-y; sharp edges read editorial.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-[var(--color-cta,#111)] text-[var(--color-cta-text,#fff)]",
    "border border-[var(--color-cta,#111)]",
    "hover:bg-[var(--color-cta-hover,#000)] hover:border-[var(--color-cta-hover,#000)]",
    // Animated 2px red underline on hover (G-Berg accent move).
    "relative overflow-hidden",
    "after:absolute after:left-0 after:right-0 after:bottom-0 after:h-[2px]",
    "after:bg-[var(--color-primary)] after:translate-y-full",
    "hover:after:translate-y-0 after:transition-transform after:duration-300 after:ease-out",
  ),
  secondary: cn(
    "bg-[var(--color-surface)] text-[var(--color-text)]",
    "border border-[var(--color-text)]",
    "hover:bg-[var(--color-text)] hover:text-[var(--color-text-inverse)]",
  ),
  tertiary: cn(
    "bg-transparent text-[var(--color-text)] border border-transparent",
    // Inline accent underline drawn with a background-image so it animates
    // on hover (left -> right) without layout shift.
    "bg-[linear-gradient(var(--color-primary),var(--color-primary))] bg-no-repeat",
    "[background-position:0_100%] [background-size:0%_2px]",
    "hover:[background-size:100%_2px] transition-[background-size] duration-300",
  ),
  ghost:
    "bg-transparent text-[var(--color-text)] border border-transparent hover:bg-[var(--color-surface-muted)]",
  destructive:
    "bg-[var(--color-error)] text-white border border-[var(--color-error)] hover:opacity-90",
};

/**
 * Size scale — deliberate, not Tailwind defaults.
 *
 *   sm: 16/8   — chips, inline filter actions
 *   md: 24/14  — default form buttons (newsletter, etc.)
 *   lg: 32/16  — hero CTAs, PDP buy-box add-to-cart
 *
 * Inter has a tall x-height and feels top-heavy at symmetric padding. We use
 * `leading-none` + small asymmetric `pt`/`pb` (md/lg) to optically center the
 * cap-line. Result: the type sits visually centered without visible math.
 */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-4 pt-[7px] pb-[5px] text-[13px] leading-none tracking-[0.02em]",
  md: "px-6 pt-[15px] pb-[13px] text-sm leading-none tracking-[0.04em]",
  lg: "px-8 pt-[18px] pb-[16px] text-[15px] leading-none tracking-[0.06em]",
  // xl: sticky-mobile add-to-cart. Reads as the page's primary action even
  //     after scrolling — fuller padding + 16px type so thumb-targets
  //     comfortably exceed the 44px iOS minimum.
  xl: "px-10 pt-[20px] pb-[18px] text-base leading-none tracking-[0.06em]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        // Structure
        "inline-flex items-center justify-center gap-2",
        "font-semibold uppercase",
        // Sharp edges — premium editorial vs. soft SaaS.
        "rounded-[2px]",
        // Motion + states
        "transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus,currentColor)] focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-cta,#111)]",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {leadingIcon ? <span aria-hidden className="relative z-10">{leadingIcon}</span> : null}
      <span className="relative z-10">{loading ? "Loading…" : children}</span>
      {trailingIcon ? <span aria-hidden className="relative z-10">{trailingIcon}</span> : null}
    </button>
  );
});
