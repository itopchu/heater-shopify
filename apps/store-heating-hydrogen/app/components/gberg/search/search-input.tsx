/**
 * Search input — used by the header overlay and the search page.
 * Hydrogen port. Replaces next/router → react-router useNavigate.
 */
import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router';
import {Image} from '@shopify/hydrogen';
import {localeHref} from '~/lib/gberg/href';
import {formatLocaleFromRoute, formatMoney} from '~/lib/gberg/format';
import {useT} from '~/lib/gberg/i18n';

interface PredictiveProduct {
  id: string;
  handle: string;
  title: string;
  featuredImage: {url: string; altText: string | null} | null;
  price: {amount: string; currencyCode: string};
}

interface PredictiveResult {
  products: PredictiveProduct[];
  collections: Array<{id: string; handle: string; title: string}>;
  queries: string[];
}

export interface SearchInputProps {
  locale: string;
  initialQuery?: string;
  variant?: 'page' | 'overlay';
  onClose?: () => void;
  autoFocus?: boolean;
}

export function SearchInput({
  locale,
  initialQuery = '',
  variant = 'page',
  onClose,
  autoFocus = false,
}: SearchInputProps) {
  const [query, setQuery] = useState(initialQuery);
  const [predictive, setPredictive] = useState<PredictiveResult | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const intl = formatLocaleFromRoute(locale);
  const t = useT();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPredictive(null);
      return;
    }
    let cancelled = false;
    setPending(true);
    const timer = setTimeout(() => {
      fetch(
        `/api/predictive-search?q=${encodeURIComponent(trimmed)}&locale=${encodeURIComponent(locale)}`,
        {cache: 'no-store'},
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: PredictiveResult | null) => {
          if (!cancelled) {
            setPredictive(data);
            setPending(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPredictive(null);
            setPending(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, locale]);

  function navigateToResults(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate(`${localeHref(locale, '/search')}?q=${encodeURIComponent(trimmed)}`);
    onClose?.();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (query) setQuery('');
      else onClose?.();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateToResults(query);
    }
  }

  const showResults =
    variant === 'overlay' &&
    predictive &&
    (predictive.products.length > 0 || predictive.queries.length > 0);

  return (
    <div className="w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigateToResults(query);
        }}
        className="flex min-w-0 items-center gap-2 border-b-2 border-[var(--color-text)] focus-within:border-[var(--color-primary)] transition-colors"
      >
        <span aria-hidden className="shrink-0 text-base text-[var(--color-text-muted)] md:text-xl">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder={t('common.search')}
          aria-label={t('search.aria_label')}
          className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] md:py-3 md:text-base"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('search.clear')}
            className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] md:text-xs"
          >
            {t('common.clear')}
          </button>
        ) : null}
        <button
          type="submit"
          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text)] hover:text-[var(--color-primary)] md:text-xs"
        >
          {t('common.go')}
        </button>
      </form>

      {variant === 'overlay' ? (
        <div className="mt-6 min-h-[6rem]">
          {pending && !predictive ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('search.searching')}</p>
          ) : null}

          {showResults && predictive ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_2fr]">
              {predictive.queries.length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    {t('search.suggestions')}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {predictive.queries.slice(0, 6).map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => {
                            setQuery(s);
                            navigateToResults(s);
                          }}
                          className="link-accent text-left text-sm text-[var(--color-text)]"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {predictive.products.length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    {t('search.products')}
                  </p>
                  <ul className="mt-3 grid grid-cols-2 gap-4">
                    {predictive.products.map((p) => (
                      <li key={p.id}>
                        <Link
                          to={localeHref(locale, `/products/${p.handle}`)}
                          onClick={onClose}
                          className="group flex items-center gap-3"
                        >
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-[var(--color-surface-muted)]">
                            {p.featuredImage ? (
                              <Image
                                data={p.featuredImage}
                                alt={p.featuredImage.altText ?? p.title}
                                aspectRatio="1/1"
                                sizes="64px"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                              {p.title}
                            </p>
                            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
                              {formatMoney(p.price, intl)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {predictive &&
          predictive.products.length === 0 &&
          predictive.queries.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t('search.no_quick_matches')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
