import type { ReactNode } from "react";
import { cn } from "./cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  className?: string;
}

export function Breadcrumb({ items, separator = "/", className }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-[var(--color-text-muted)]", className)}>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <a className="hover:text-[var(--color-text)] underline-offset-2 hover:underline" href={item.href}>
                  {item.label}
                </a>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-[var(--color-text)] font-medium" : ""}>
                  {item.label}
                </span>
              )}
              {!isLast ? <span aria-hidden className="opacity-50">{separator}</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
