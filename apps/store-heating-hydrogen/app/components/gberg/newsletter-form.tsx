/**
 * Client component. Newsletter inline form. Submission wires to Shopify
 * Customer Marketing in Phase 2 — for now we no-op the submit.
 */
import {useState} from 'react';
import {cn} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

export interface NewsletterFormProps {
  dark?: boolean;
}

export function NewsletterForm({dark = false}: NewsletterFormProps) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  // Stack vertically on phones, side-by-side from `sm` up. The old
  // always-row layout (input `flex-1` + a wide uppercase "Subscribe"
  // button) overflowed ~360px viewports — the button got clipped by the
  // body's `overflow-x: clip`. `flex-col` on mobile makes both controls
  // full-width block elements, so it can't overflow regardless of locale
  // string length.
  const inputBase =
    'w-full min-w-0 bg-transparent px-0 py-3 text-base outline-none transition-colors placeholder:text-current/60 sm:flex-1';
  const inputColors = dark
    ? 'text-white border-b-2 border-white/30 focus:border-[var(--color-primary)]'
    : 'text-[var(--color-text)] border-b-2 border-[var(--color-text)] focus:border-[var(--color-primary)]';

  const buttonColors = dark
    ? 'bg-white text-[var(--color-text)] hover:bg-[var(--color-primary)] hover:text-white'
    : 'bg-[var(--color-text)] text-white hover:bg-[var(--color-primary)]';

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        {t('newsletter.email_label')}
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        autoComplete="email"
        placeholder={t('newsletter.email_placeholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={cn(inputBase, inputColors)}
      />
      <button
        type="submit"
        className={cn(
          'w-full shrink-0 rounded-[2px] px-6 pt-[15px] pb-[13px] text-sm font-semibold uppercase leading-none tracking-[0.06em] transition-colors sm:w-auto',
          buttonColors,
        )}
      >
        {done ? t('newsletter.subscribed_thanks') : t('newsletter.subscribe')}
      </button>
    </form>
  );
}
