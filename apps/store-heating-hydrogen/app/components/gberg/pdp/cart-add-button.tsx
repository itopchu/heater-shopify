/**
 * Shared "Add to cart" submit button for the PDP buy box and the sticky
 * mobile buy bar. Wired inside a Hydrogen `<CartForm>` — pass it the render
 * prop's `fetcher`.
 *
 * Feedback model: the button label is *always* "Add to cart" (it never
 * sticks on "Added"). Instead, a fresh successful add shows a checkmark for
 * ~1.8s and fires `onAdded` (the callers open the cart drawer), so the user
 * gets a clear "it worked — add another if you like" signal without the
 * button losing its affordance.
 */
import {useEffect, useRef, useState} from 'react';
import type {FetcherWithComponents} from 'react-router';
import {Button, type ButtonSize} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export interface CartAddButtonProps {
  fetcher: FetcherWithComponents<unknown>;
  available: boolean;
  disabled?: boolean;
  size: ButtonSize;
  /** Label shown when the variant isn't purchasable (e.g. "Out of stock"). */
  unavailableLabel: string;
  className?: string;
  /** Fired once per successful add — callers use it to open the cart drawer. */
  onAdded?: () => void;
}

export function CartAddButton({
  fetcher,
  available,
  disabled,
  size,
  unavailableLabel,
  className,
  onAdded,
}: CartAddButtonProps) {
  const t = useT();
  const adding = fetcher.state !== 'idle';
  const [flash, setFlash] = useState(false);
  const seenRef = useRef<unknown>(undefined);

  useEffect(() => {
    const data = fetcher.data as {cart?: unknown} | undefined;
    if (fetcher.state === 'idle' && data?.cart != null && data !== seenRef.current) {
      seenRef.current = data;
      setFlash(true);
      onAdded?.();
      const id = setTimeout(() => setFlash(false), 1800);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [fetcher.state, fetcher.data, onAdded]);

  // The label never changes to "Added" — that's the bug we're fixing. The
  // signal is the checkmark + the cart drawer the caller opens via onAdded.
  const label = available ? t('pdp.add_to_cart') : unavailableLabel;

  return (
    <Button
      type="submit"
      size={size}
      variant="primary"
      loading={adding}
      disabled={disabled}
      trailingIcon={flash && available ? <CheckIcon /> : undefined}
      className={className}
    >
      {label}
      {/* SR-only transient announcement so assistive tech still hears the
          add succeeded, without it becoming the button's permanent name. */}
      {flash ? <span className="sr-only" role="status">{t('pdp.added')}</span> : null}
    </Button>
  );
}
