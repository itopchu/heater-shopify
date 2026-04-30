"use client";

/**
 * Client component. Add-to-cart button + quantity stepper.
 * Cart wiring (Storefront Cart API mutations) lands in Phase 2 — this is a
 * placeholder that disables on out-of-stock and shows a "coming soon" state.
 */
import { useState } from "react";
import { Button, cn } from "@gberg/ui";

export interface AddToCartProps {
  variantId: string | null;
  available: boolean;
  className?: string;
}

export function AddToCart({ variantId, available, className }: AddToCartProps) {
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(false);

  async function handleAdd() {
    if (!variantId || !available) return;
    setAdding(true);
    // TODO: wire to Storefront Cart API (Phase 2).
    // For now: simulate a brief delay so the UX is reviewable.
    await new Promise((r) => setTimeout(r, 500));
    setAdding(false);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <div
          className="inline-flex h-12 items-center rounded-[var(--radius-md)] border border-[var(--color-border)]"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-3 text-lg disabled:opacity-50"
            disabled={qty <= 1}
          >
            −
          </button>
          <span className="min-w-[2rem] text-center font-medium" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty((q) => q + 1)}
            className="px-3 text-lg"
          >
            +
          </button>
        </div>
        <Button
          type="button"
          size="lg"
          variant="primary"
          loading={adding}
          disabled={!available || !variantId}
          onClick={handleAdd}
          className="flex-1"
        >
          {!available ? "Out of stock" : done ? "Added" : "Add to cart"}
        </Button>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Cart wiring lands in Phase 2 — this button currently stages the request only.
      </p>
    </div>
  );
}
