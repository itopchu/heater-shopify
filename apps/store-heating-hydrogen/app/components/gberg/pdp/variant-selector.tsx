/**
 * Variant option selector.
 *
 * Design Refresh — April 2026 (Complaint #2: "Size, color, specs wrong-aligned —
 * want a scrollable dropdown when necessary"):
 *  - Inline `<select>` replaced with the polished `<SelectField>` atom
 *    (visible chevron, focus ring, scrollable native option panel).
 *  - Dropdown threshold lowered from 6 → 5 values per the brief.
 *  - Pill row gap upgraded to `gap-2 sm:gap-3` for breathing room and the
 *    pill min-height bumped to 44px so iOS thumb targets clear the AAA bar.
 *  - The `selected` state machine + variant-resolver are unchanged.
 *
 * Track B (April 2026):
 *  - Per-variant price next to each option label/value.
 *  - Per-variant OOS state — pill is muted+strike-through, select option
 *    appends " — sold out". OOS values stay clickable so Shopify's
 *    disabled-ATC pattern can take over.
 *  - Caption above the SelectField shows "8 sizes available, 1 sold out".
 *  - Two-axis combos: when computing per-value resolution, intersect
 *    against the OTHER axis's currently-selected value.
 */
import {useEffect, useState} from 'react';
import type {Money, ProductOption, ProductVariant} from '@gberg/product-schema';
import {cn, SelectField} from '@gberg/ui';
import {formatMoney} from '~/lib/gberg/format';
import {useT} from '~/lib/gberg/i18n';

export interface VariantSelectorProps {
  options: ProductOption[];
  variants: ProductVariant[];
  /** Locale string consumed by Intl.NumberFormat. */
  locale?: string;
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

/**
 * For a given option (`optName`) + candidate value (`optValue`), find the
 * variant that matches by intersecting against `selected` for every OTHER
 * option. Returns `null` when no such combo exists.
 */
function resolveVariantForValue(
  variants: ProductVariant[],
  selected: Record<string, string>,
  optName: string,
  optValue: string,
): ProductVariant | null {
  const target = {...selected, [optName]: optValue};
  return (
    variants.find((v) =>
      v.selectedOptions.every((so) => target[so.name] === so.value),
    ) ?? null
  );
}

/**
 * Per-axis count of in-stock vs sold-out values, used by the SelectField
 * caption. A value is "sold out" if its (intersected) variant is OOS or
 * doesn't exist for the current cross-axis selection.
 */
function countAvailability(
  opt: ProductOption,
  variants: ProductVariant[],
  selected: Record<string, string>,
): {available: number; soldOut: number} {
  let available = 0;
  let soldOut = 0;
  for (const v of opt.values) {
    const resolved = resolveVariantForValue(variants, selected, opt.name, v);
    if (resolved && resolved.availableForSale) available++;
    else soldOut++;
  }
  return {available, soldOut};
}

function priceLabel(money: Money | null | undefined, locale?: string): string {
  if (!money) return '';
  return formatMoney(money, locale ?? 'en-EU');
}

export function VariantSelector({
  options,
  variants,
  locale,
  onVariantChange,
}: VariantSelectorProps) {
  const t = useT();
  const initial =
    variants[0]?.selectedOptions.reduce<Record<string, string>>(
      (acc, so) => ({...acc, [so.name]: so.value}),
      {},
    ) ?? {};

  const [selected, setSelected] = useState<Record<string, string>>(initial);

  useEffect(() => {
    onVariantChange?.(findVariant(variants, selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selected)]);

  const firstOption = options[0];
  if (
    !options?.length ||
    (options.length === 1 && (firstOption?.values.length ?? 0) <= 1)
  ) {
    return null;
  }

  return (
    <div className="space-y-4">
      {options.map((opt) => {
        // Threshold lowered 6 → 5: at 5+ values the pill row wraps awkwardly
        // and a scrollable dropdown reads cleaner.
        const useDropdown = opt.values.length > 5;
        const fieldId = `opt-${opt.id}`;

        if (useDropdown) {
          const {available, soldOut} = countAvailability(opt, variants, selected);
          // Caption mirrors the brief: "8 sizes available, 1 sold out".
          // Singular/plural handled inline; opt.name is merchant-named so we
          // suffix it as-is (e.g. "8 Höhe x Breite available").
          const caption =
            soldOut > 0
              ? t('pdp.variant_available_with_sold_out', {available, soldOut})
              : t('pdp.variant_available_only', {available});
          return (
            <div key={opt.id}>
              <p
                className="mb-1 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
                aria-hidden
              >
                {caption}
              </p>
              <SelectField
                id={fieldId}
                label={opt.name}
                value={selected[opt.name] ?? ''}
                onChange={(e) =>
                  setSelected((prev) => ({...prev, [opt.name]: e.target.value}))
                }
              >
                {opt.values.map((value) => {
                  const v = resolveVariantForValue(
                    variants,
                    selected,
                    opt.name,
                    value,
                  );
                  const isSoldOut = !v || !v.availableForSale;
                  const price = v ? priceLabel(v.price, locale) : '';
                  // Native <option> can't be styled, so we encode state
                  // textually: " — €87.54" or " — sold out".
                  const suffix = isSoldOut
                    ? t('pdp.variant_value_sold_out_suffix')
                    : price
                      ? ` — ${price}`
                      : '';
                  return (
                    <option key={`${opt.id}-${value}`} value={value}>
                      {value}
                      {suffix}
                    </option>
                  );
                })}
              </SelectField>
            </div>
          );
        }

        // Pill grid (≤5 values).
        return (
          <div key={opt.id}>
            <label
              htmlFor={fieldId}
              id={fieldId}
              className="mb-2 block text-sm font-medium"
            >
              {opt.name}
              <span className="text-[var(--color-text-muted)] font-normal">
                : {selected[opt.name]}
              </span>
            </label>
            <div
              role="radiogroup"
              aria-labelledby={fieldId}
              className="flex flex-wrap gap-2 sm:gap-3"
            >
              {opt.values.map((value) => {
                const isSelected = selected[opt.name] === value;
                const v = resolveVariantForValue(
                  variants,
                  selected,
                  opt.name,
                  value,
                );
                const isSoldOut = !v || !v.availableForSale;
                const price = v ? priceLabel(v.price, locale) : '';
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={isSoldOut || undefined}
                    key={`${opt.id}-${value}`}
                    onClick={() =>
                      setSelected((prev) => ({...prev, [opt.name]: value}))
                    }
                    className={cn(
                      // 44px iOS thumb-target floor.
                      'inline-flex min-h-[2.75rem] min-w-[56px] flex-col items-center justify-center rounded-[var(--radius-md)] border px-3 py-1.5 text-sm transition-colors',
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg,white)]'
                        : isSoldOut
                          ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]',
                    )}
                  >
                    <span
                      className={cn(
                        isSoldOut && !isSelected ? 'line-through' : '',
                      )}
                    >
                      {value}
                    </span>
                    {price ? (
                      <span
                        className={cn(
                          'mt-0.5 text-[11px] tabular-nums',
                          isSelected
                            ? 'text-[var(--color-primary-fg,white)] opacity-90'
                            : isSoldOut
                              ? 'text-[var(--color-text-muted)]'
                              : 'text-[var(--color-text-muted)]',
                        )}
                      >
                        {isSoldOut ? '—' : price}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
