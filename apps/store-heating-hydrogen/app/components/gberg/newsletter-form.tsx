/**
 * Client component. Newsletter inline form. Submission wires to Shopify
 * Customer Marketing in Phase 2 — for now we no-op the submit.
 */
import {useState} from 'react';
import {cn} from '@gberg/ui';

export interface NewsletterFormProps {
  dark?: boolean;
}

export function NewsletterForm({dark = false}: NewsletterFormProps) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  const inputBase =
    'flex-1 bg-transparent px-0 py-3 text-base outline-none transition-colors placeholder:text-current/60';
  const inputColors = dark
    ? 'text-white border-b-2 border-white/30 focus:border-[var(--color-primary)]'
    : 'text-[var(--color-text)] border-b-2 border-[var(--color-text)] focus:border-[var(--color-primary)]';

  const buttonColors = dark
    ? 'bg-white text-[var(--color-text)] hover:bg-[var(--color-primary)] hover:text-white'
    : 'bg-[var(--color-text)] text-white hover:bg-[var(--color-primary)]';

  return (
    <form
      className="flex items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={cn(inputBase, inputColors)}
      />
      <button
        type="submit"
        className={cn(
          'shrink-0 rounded-[2px] px-6 pt-[15px] pb-[13px] text-sm font-semibold uppercase leading-none tracking-[0.06em] transition-colors',
          buttonColors,
        )}
      >
        {done ? 'Thanks!' : 'Subscribe'}
      </button>
    </form>
  );
}
