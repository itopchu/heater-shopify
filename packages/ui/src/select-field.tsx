import {forwardRef, type HTMLAttributes, type SelectHTMLAttributes} from "react";
import {cn} from "./cn";
import {ChevronDownIcon} from "./icons/chevron-down";

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Optional visible label. Pair with `id` to wire `htmlFor`. */
  label?: string;
  /** Optional muted helper line below the field. */
  helperText?: string;
  /** Forces error styling + adds aria-invalid. */
  invalid?: boolean;
  /** Wrapper class. The inner `<select>` accepts its own `className`. */
  wrapperClassName?: string;
}

/**
 * Polished native `<select>` with a visible custom chevron.
 *
 *  - Native option panel is preserved on purpose: it auto-scrolls when
 *    the option list is long, satisfies the user's "scrollable dropdown"
 *    requirement, and stays free + accessible without JS.
 *  - The chevron is rendered as a non-interactive `<span>` overlay so
 *    keyboard navigation, screen-reader announcements, and form-reset
 *    behavior all match the platform default.
 *  - Custom-thumb scrollbar tokens are applied; most browsers ignore
 *    them on `<select>` but they cost nothing if so.
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    {
      label,
      helperText,
      invalid = false,
      className,
      wrapperClassName,
      id,
      "aria-describedby": ariaDescribedBy,
      ...rest
    },
    ref,
  ) {
    const helperId = helperText && id ? `${id}-help` : undefined;
    const describedBy = [ariaDescribedBy, helperId].filter(Boolean).join(" ") || undefined;
    return (
      <div className={cn("flex flex-col gap-2", wrapperClassName)}>
        {label ? (
          <label
            htmlFor={id}
            className="text-sm font-medium text-[var(--color-text)]"
          >
            {label}
          </label>
        ) : null}
        <span className="relative inline-block w-full">
          <select
            ref={ref}
            id={id}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              "w-full appearance-none cursor-pointer",
              "bg-[var(--color-surface)] text-[var(--color-text)]",
              "border rounded-[var(--radius-md)]",
              invalid
                ? "border-[var(--color-error)]"
                : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
              "px-3 pr-10 py-2 text-sm font-medium leading-tight",
              "focus:outline-none focus-visible:border-[var(--color-primary)]",
              "focus-visible:ring-2 focus-visible:ring-[var(--color-focus,var(--color-primary))]",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "[scrollbar-width:thin] [scrollbar-color:var(--scrollbar-thin-color)_transparent]",
              "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thin-color)]",
              className,
            )}
            {...rest}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          >
            <ChevronDownIcon width={16} height={16} />
          </span>
        </span>
        {helperText ? (
          <p
            id={helperId}
            className={cn(
              "text-xs leading-relaxed",
              invalid
                ? "text-[var(--color-error)]"
                : "text-[var(--color-text-muted)]",
            )}
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

export interface DropdownPanelProps extends HTMLAttributes<HTMLDivElement> {}

/**
 * Scrollable, hairline-bounded panel for any future custom listbox
 * (e.g. an autocomplete or a faceted-filter overlay). The native
 * `<select>` covers the "long option list" case via SelectField; this
 * primitive is for cases where the panel needs custom rendering.
 */
export function DropdownPanel({className, ...rest}: DropdownPanelProps) {
  return (
    <div
      className={cn(
        "max-h-[28rem] overflow-y-auto",
        "rounded-[var(--radius-md)] border border-[var(--color-border)]",
        "bg-[var(--color-surface)] shadow-[var(--shadow-md)]",
        "[scrollbar-color:var(--scrollbar-thin-color)_transparent] [scrollbar-width:thin]",
        "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thin-color)]",
        className,
      )}
      {...rest}
    />
  );
}
