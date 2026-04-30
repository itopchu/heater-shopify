/**
 * "Also available in: <Color1> · <Color2>" cross-link row.
 *
 * Track B (April 2026): the catalog has 3 colour-sibling families whose
 * physical model is identical but ship as separate Shopify handles
 * (KASKA Anthrazit / Schwarz / Weiß is the canonical example). Surfacing
 * the siblings inline keeps the customer in the funnel.
 *
 * Source of truth: products in `candidates` (typically the storefront's
 * full product list, fetched once by the route loader) whose
 * `editorial.series` matches but whose `color` differs. We render
 * inert when there are no siblings — never an empty row.
 */
import {Link} from 'react-router';
import {colorFamilyHex, type SiblingColor} from '~/lib/gberg/heating-derived';
import {normalizeColorForLocale} from '~/lib/gberg/normalize';
import {localeHref} from '~/lib/gberg/href';

export interface SiblingColorsProps {
  siblings: SiblingColor[];
  locale: string;
  className?: string;
}

export function SiblingColors({siblings, locale, className}: SiblingColorsProps) {
  if (!siblings.length) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        Also available in
      </p>
      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {siblings.map((s, i) => {
          const label = normalizeColorForLocale(s.rawColor, locale);
          const hex = colorFamilyHex(s.rawColor) ?? '#cccccc';
          return (
            <li key={s.handle} className="flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden className="text-[var(--color-text-muted)]">
                  ·
                </span>
              ) : null}
              <Link
                to={localeHref(locale, `/products/${s.handle}`)}
                className="inline-flex items-center gap-2 text-sm text-[var(--color-text)] underline-offset-2 hover:text-[var(--color-primary)] hover:underline"
                title={s.title}
              >
                <span
                  aria-hidden
                  style={{backgroundColor: hex}}
                  className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/15"
                />
                {label || s.color}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
