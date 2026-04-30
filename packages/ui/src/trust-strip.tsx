import type {ReactNode} from "react";
import {cn} from "./cn";
import {Hairline} from "./hairline";

export interface TrustItem {
  /** Pre-built icon node — caller passes e.g. `<TrustWarrantyIcon />`. */
  icon: ReactNode;
  /** Uppercase 11px tracked headline. */
  label: string;
  /** Optional sentence-case sublabel. */
  sublabel?: string;
}

export interface TrustStripProps {
  items: TrustItem[];
  /**
   * When true, paints white text on charcoal — for the dark UtilityBar.
   * Default is charcoal text on white surface (used below the buy-box,
   * inside the footer, etc.).
   */
  inverse?: boolean;
  className?: string;
}

/**
 * Horizontal flex row of 3-4 trust marks. Each item: icon (24px), label
 * (uppercase 11px tracked), optional sublabel. Wraps to a 2-col grid below
 * the `sm` breakpoint. Vertical hairline separates items at `sm+` only.
 *
 * Icon-agnostic: the caller provides the icon node, so the same strip
 * works for warranty/return/delivery/secure-checkout/heat-pump-ready/etc.
 */
export function TrustStrip({items, inverse = false, className}: TrustStripProps) {
  if (!items.length) return null;
  const itemColor = inverse
    ? "text-[var(--color-text-inverse,#fff)]"
    : "text-[var(--color-text)]";
  const sublabelColor = inverse
    ? "text-white/70"
    : "text-[var(--color-text-muted)]";
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-5 sm:flex sm:flex-wrap sm:items-stretch sm:gap-0",
        itemColor,
        className,
      )}
    >
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          className={cn(
            "flex items-center gap-3 sm:flex-1 sm:px-5 sm:first:pl-0 sm:last:pr-0",
            "min-w-0",
          )}
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 flex-none items-center justify-center"
          >
            {item.icon}
          </span>
          <span className="min-w-0 flex flex-col gap-0.5">
            <span className="text-[var(--text-eyebrow-sm,0.6875rem)] uppercase tracking-[0.14em] font-semibold leading-none">
              {item.label}
            </span>
            {item.sublabel ? (
              <span
                className={cn(
                  "text-[12px] leading-snug truncate",
                  sublabelColor,
                )}
              >
                {item.sublabel}
              </span>
            ) : null}
          </span>
          {i < items.length - 1 ? (
            <Hairline
              orientation="vertical"
              tone="default"
              className={cn(
                "hidden sm:block self-stretch ml-auto",
                inverse && "bg-white/20",
              )}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
