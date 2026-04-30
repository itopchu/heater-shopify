"use client";

/**
 * Client component. Variant option selector — heating products usually have a
 * "Size" or "Color" option. This is a minimal implementation for scaffolding;
 * once a cart client lands, this state will be lifted into a context.
 *
 * Marked client because the user must interact (URL state sync arrives in Phase 2).
 */
import { useEffect, useState } from "react";
import type { ProductOption, ProductVariant } from "@gberg/product-schema";
import { cn } from "@gberg/ui";

export interface VariantSelectorProps {
  options: ProductOption[];
  variants: ProductVariant[];
  onVariantChange?: (variant: ProductVariant | null) => void;
}

function findVariant(
  variants: ProductVariant[],
  selected: Record<string, string>,
): ProductVariant | null {
  return (
    variants.find((v) =>
      v.selectedOptions.every((so) => selected[so.name] === so.value),
    ) ?? null
  );
}

export function VariantSelector({ options, variants, onVariantChange }: VariantSelectorProps) {
  const initial = variants[0]?.selectedOptions.reduce<Record<string, string>>(
    (acc, so) => ({ ...acc, [so.name]: so.value }),
    {},
  ) ?? {};

  const [selected, setSelected] = useState<Record<string, string>>(initial);

  useEffect(() => {
    onVariantChange?.(findVariant(variants, selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selected)]);

  const firstOption = options[0];
  if (!options?.length || (options.length === 1 && (firstOption?.values.length ?? 0) <= 1)) {
    return null;
  }

  return (
    <div className="space-y-4">
      {options.map((opt) => (
        <div key={opt.id}>
          <p className="mb-2 text-sm font-medium">
            {opt.name}: <span className="text-[var(--color-text-muted)] font-normal">{selected[opt.name]}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((value) => {
              const isSelected = selected[opt.name] === value;
              return (
                <button
                  type="button"
                  key={`${opt.id}-${value}`}
                  onClick={() => setSelected((prev) => ({ ...prev, [opt.name]: value }))}
                  className={cn(
                    "min-w-[56px] rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors",
                    isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg,white)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
