"use client";

/**
 * Client component. Buy-box wraps variant selector + add-to-cart so they share
 * the currently selected variant. Server PDP renders this with its initial variant.
 */
import { useState } from "react";
import type { ProductOption, ProductVariant, Money } from "@gberg/product-schema";
import { VariantSelector } from "./variant-selector";
import { AddToCart } from "./add-to-cart";
import { PriceBlock } from "./price-block";

export interface BuyBoxProps {
  options: ProductOption[];
  variants: ProductVariant[];
  initialVariant: ProductVariant | null;
  locale: string;
  fallbackPrice: Money;
}

export function BuyBox({
  options,
  variants,
  initialVariant,
  locale,
  fallbackPrice,
}: BuyBoxProps) {
  const [variant, setVariant] = useState<ProductVariant | null>(initialVariant);
  const price = variant?.price ?? fallbackPrice;
  const compareAt = variant?.compareAtPrice ?? null;
  const available = variant?.availableForSale ?? false;

  return (
    <div className="space-y-6">
      <PriceBlock price={price} compareAtPrice={compareAt} locale={locale} />
      <VariantSelector
        options={options}
        variants={variants}
        onVariantChange={setVariant}
      />
      <AddToCart variantId={variant?.id ?? null} available={available} />
    </div>
  );
}
