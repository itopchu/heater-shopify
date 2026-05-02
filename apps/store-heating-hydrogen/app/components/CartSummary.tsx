import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Money, type OptimisticCart} from '@shopify/hydrogen';
import {useEffect, useId, useRef, useState} from 'react';
import {useFetcher} from 'react-router';
import {useT} from '~/lib/gberg/i18n';
import {PaymentMethodStrip} from '~/components/gberg/payment-method-strip';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
};

export function CartSummary({cart, layout}: CartSummaryProps) {
  const t = useT();
  const summaryId = useId();
  const discountsHeadingId = useId();
  const discountCodeInputId = useId();
  const giftCardHeadingId = useId();
  const giftCardInputId = useId();
  const isPage = layout === 'page';

  return (
    <div
      aria-labelledby={summaryId}
      className="flex flex-col gap-5"
    >
      <h2
        id={summaryId}
        className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[var(--color-primary)]"
      >
        {t('cart.totals')}
      </h2>

      {/* Subtotal — large, prominent. Other lines (shipping/taxes) come after checkout. */}
      <dl role="group" className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-4">
        <dt className="text-[14px] font-medium text-[var(--color-text)]">{t('cart.subtotal')}</dt>
        <dd className="font-[var(--font-display)] text-[1.5rem] font-semibold text-[var(--color-text)]">
          {cart?.cost?.subtotalAmount?.amount ? (
            <Money data={cart?.cost?.subtotalAmount} />
          ) : (
            '—'
          )}
        </dd>
      </dl>

      <CartDiscounts
        discountCodes={cart?.discountCodes}
        discountsHeadingId={discountsHeadingId}
        discountCodeInputId={discountCodeInputId}
      />
      <CartGiftCard
        giftCardCodes={cart?.appliedGiftCards}
        giftCardHeadingId={giftCardHeadingId}
        giftCardInputId={giftCardInputId}
      />

      <CartCheckoutActions checkoutUrl={cart?.checkoutUrl} />

      {isPage && <PaymentMethodStrip className="mt-2 border-t border-[var(--color-border)] pt-5" />}
    </div>
  );
}

function CartCheckoutActions({checkoutUrl}: {checkoutUrl?: string}) {
  const t = useT();
  if (!checkoutUrl) return null;

  return (
    <a
      href={checkoutUrl}
      target="_self"
      className="inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-4 text-center text-[14px] uppercase tracking-[0.12em] font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong,#8A0B1F)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
    >
      {t('cart.continue_to_checkout')}
    </a>
  );
}

function CartDiscounts({
  discountCodes,
  discountsHeadingId,
  discountCodeInputId,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
  discountsHeadingId: string;
  discountCodeInputId: string;
}) {
  const t = useT();
  const codes: string[] =
    discountCodes
      ?.filter((discount) => discount.applicable)
      ?.map(({code}) => code) || [];

  return (
    <section aria-label={t('cart.discounts')} className="space-y-3">
      <p
        id={discountsHeadingId}
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
      >
        {t('cart.discounts')}
      </p>

      {/* Applied codes — chips with remove × */}
      {codes.length > 0 ? (
        <UpdateDiscountForm>
          <ul className="flex flex-wrap gap-2" aria-labelledby={discountsHeadingId}>
            {codes.map((code) => (
              <li
                key={code}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)]/10 px-3 py-1.5 text-[13px] font-medium text-[var(--color-primary)]"
              >
                <span className="font-mono">{code}</span>
                <button
                  type="submit"
                  aria-label={t('cart.discount_remove_aria')}
                  className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
                >
                  <span aria-hidden className="text-base leading-none">×</span>
                </button>
              </li>
            ))}
          </ul>
        </UpdateDiscountForm>
      ) : null}

      {/* Input + Apply — single segmented control */}
      <UpdateDiscountForm discountCodes={codes}>
        <div className="flex h-11 overflow-hidden rounded-sm border border-[var(--color-border)] focus-within:border-[var(--color-text)]">
          <label htmlFor={discountCodeInputId} className="sr-only">
            {t('cart.discount_code')}
          </label>
          <input
            id={discountCodeInputId}
            type="text"
            name="discountCode"
            placeholder={t('cart.discount_code_placeholder')}
            className="flex-1 min-w-0 bg-transparent px-3 text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          <button
            type="submit"
            aria-label={t('cart.discount_apply_aria')}
            className="shrink-0 bg-[var(--color-text)] px-5 text-[12px] uppercase tracking-[0.12em] font-semibold text-white transition-colors hover:bg-[var(--color-primary)]"
          >
            {t('common.apply')}
          </button>
        </div>
      </UpdateDiscountForm>
    </section>
  );
}

function UpdateDiscountForm({
  discountCodes,
  children,
}: {
  discountCodes?: string[];
  children: React.ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.DiscountCodesUpdate}
      inputs={{
        discountCodes: discountCodes || [],
      }}
    >
      {children}
    </CartForm>
  );
}

function CartGiftCard({
  giftCardCodes,
  giftCardHeadingId,
  giftCardInputId,
}: {
  giftCardCodes: CartApiQueryFragment['appliedGiftCards'] | undefined;
  giftCardHeadingId: string;
  giftCardInputId: string;
}) {
  const t = useT();
  const giftCardCodeInput = useRef<HTMLInputElement>(null);
  const removeButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const previousCardIdsRef = useRef<string[]>([]);
  const giftCardAddFetcher = useFetcher({key: 'gift-card-add'});
  const [removedCardIndex, setRemovedCardIndex] = useState<number | null>(null);

  useEffect(() => {
    if (giftCardAddFetcher.data) {
      if (giftCardCodeInput.current !== null) {
        giftCardCodeInput.current.value = '';
      }
    }
  }, [giftCardAddFetcher.data]);

  useEffect(() => {
    const currentCardIds = giftCardCodes?.map((card) => card.id) || [];

    if (removedCardIndex !== null && giftCardCodes) {
      const focusTargetIndex = Math.min(
        removedCardIndex,
        giftCardCodes.length - 1,
      );
      const focusTargetCard = giftCardCodes[focusTargetIndex];
      const focusButton = focusTargetCard
        ? removeButtonRefs.current.get(focusTargetCard.id)
        : null;

      if (focusButton) {
        focusButton.focus();
      } else if (giftCardCodeInput.current) {
        giftCardCodeInput.current.focus();
      }

      setRemovedCardIndex(null);
    }

    previousCardIdsRef.current = currentCardIds;
  }, [giftCardCodes, removedCardIndex]);

  const handleRemoveClick = (cardId: string) => {
    const index = previousCardIdsRef.current.indexOf(cardId);
    if (index !== -1) {
      setRemovedCardIndex(index);
    }
  };

  return (
    <section aria-label={t('cart.gift_cards')} className="space-y-3">
      <p
        id={giftCardHeadingId}
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
      >
        {giftCardCodes && giftCardCodes.length > 0
          ? t('cart.gift_card_applied')
          : t('cart.gift_cards')}
      </p>

      {giftCardCodes && giftCardCodes.length > 0 ? (
        <ul className="space-y-2" aria-labelledby={giftCardHeadingId}>
          {giftCardCodes.map((giftCard) => (
            <li
              key={giftCard.id}
              className="flex items-center justify-between gap-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px]"
            >
              <span className="flex items-center gap-2 font-mono text-[var(--color-text)]">
                <span aria-hidden>***{giftCard.lastCharacters}</span>
                <span className="font-sans text-[var(--color-text-muted)]">
                  · <Money data={giftCard.amountUsed} />
                </span>
              </span>
              <RemoveGiftCardForm
                giftCardId={giftCard.id}
                lastCharacters={giftCard.lastCharacters}
                onRemoveClick={() => handleRemoveClick(giftCard.id)}
                buttonRef={(el: HTMLButtonElement | null) => {
                  if (el) {
                    removeButtonRefs.current.set(giftCard.id, el);
                  } else {
                    removeButtonRefs.current.delete(giftCard.id);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <AddGiftCardForm fetcherKey="gift-card-add">
        <div className="flex h-11 overflow-hidden rounded-sm border border-[var(--color-border)] focus-within:border-[var(--color-text)]">
          <label htmlFor={giftCardInputId} className="sr-only">
            {t('cart.gift_card_label')}
          </label>
          <input
            id={giftCardInputId}
            type="text"
            name="giftCardCode"
            placeholder={t('cart.gift_card_placeholder')}
            ref={giftCardCodeInput}
            className="flex-1 min-w-0 bg-transparent px-3 text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={giftCardAddFetcher.state !== 'idle'}
            aria-label={t('cart.gift_card_apply_aria')}
            className="shrink-0 bg-[var(--color-text)] px-5 text-[12px] uppercase tracking-[0.12em] font-semibold text-white transition-colors hover:bg-[var(--color-primary)] disabled:opacity-50"
          >
            {t('common.apply')}
          </button>
        </div>
      </AddGiftCardForm>
    </section>
  );
}

function AddGiftCardForm({
  fetcherKey,
  children,
}: {
  fetcherKey?: string;
  children: React.ReactNode;
}) {
  return (
    <CartForm
      fetcherKey={fetcherKey}
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesAdd}
    >
      {children}
    </CartForm>
  );
}

function RemoveGiftCardForm({
  giftCardId,
  lastCharacters,
  onRemoveClick,
  buttonRef,
}: {
  giftCardId: string;
  lastCharacters: string;
  onRemoveClick?: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const t = useT();
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{
        giftCardCodes: [giftCardId],
      }}
    >
      <button
        type="submit"
        aria-label={t('cart.gift_card_remove_aria', {last: lastCharacters})}
        onClick={onRemoveClick}
        ref={buttonRef}
        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
      >
        {t('common.remove')}
      </button>
    </CartForm>
  );
}
