# i18n Integration Sketch

This is the planned shape of the `t()` / `useT()` helper that the
next pass will land in `app/lib/gberg/i18n.ts`. The locale
dictionaries (`app/locales/*.json` + `app/locales/index.ts`) are
already in place; the wiring pass adds the helper and rewrites every
JSX literal to call it.

## Goals

1. **Zero context plumbing.** Components don't import the locale
   prop — they call `useT()` and the helper resolves the active
   locale from the React Router location.
2. **EN fallback always.** A missing key in the active locale falls
   through to `en.json`. A missing key in `en.json` returns the key
   string itself (e.g. `"pdp.unknown_key"`) — never a blank string,
   so the bug is visible.
3. **No runtime fetch.** All 8 dictionaries are imported at build
   time via `app/locales/index.ts`. Total payload is ~25 KB minified
   per locale; the bundler tree-shakes per-locale chunks.
4. **ICU placeholders, no library.** The catalog uses `{name}` and
   `{count}` placeholders. We do the substitution ourselves — no
   `intl-messageformat` dep — because all our placeholders are
   single-token, non-pluralised. Pluralisation is handled with two
   keys (`*_singular`, `*_plural`) selected by the caller.

## Helper shape

```ts
// app/lib/gberg/i18n.ts (additions only — keep existing primitives)

import {useLocation} from 'react-router';
import {LOCALE_DICT, FALLBACK_DICT, type Dict} from '~/locales';
import {detectLocaleFromPath} from './seo';

// Resolve "namespace.key" against a dict. Returns undefined when the
// key is absent (so the caller can fall through to EN).
function lookup(dict: Dict, key: string): string | undefined {
  const dot = key.indexOf('.');
  if (dot < 0) return undefined;
  const ns = key.slice(0, dot);
  const sub = key.slice(dot + 1);
  return dict[ns]?.[sub];
}

// Substitute {placeholder} tokens with values from `vars`. Tokens
// without a matching var are left in place (visible bug, not silent
// blank). Identity for empty `vars`.
function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : `{${name}}`,
  );
}

// The factory the rest of the app calls. Pure — no React context.
// Callers use `useT()` (below) which wires this up to the active
// locale automatically.
export function makeT(locale: Locale) {
  const active = LOCALE_DICT[locale] ?? FALLBACK_DICT;
  return function t(
    key: string,
    vars?: Record<string, string | number>,
  ): string {
    const value = lookup(active, key) ?? lookup(FALLBACK_DICT, key);
    return interpolate(value ?? key, vars);
  };
}

// React hook — reads the locale from the URL via useLocation, so
// any component below the router gets the right active dictionary
// without prop drilling.
export function useT() {
  const {pathname} = useLocation();
  const locale = detectLocaleFromPath(pathname) ?? DEFAULT_LOCALE;
  return makeT(locale);
}
```

## Usage in a component (next pass)

```tsx
// Before
<button>Add to cart</button>

// After
const t = useT();
return <button>{t('pdp.add_to_cart')}</button>;
```

For interpolation:

```tsx
// Before
<p>{count} of {total} products</p>

// After
<p>{t('plp.results_count', {shown: count, total})}</p>
```

## Server-side rendering

Routes that emit text in `meta()` or `loader()` (where there is no
hook context) call `makeT(locale)` directly with the locale they
already resolve via `normalizeLocale(params.locale)`. Example:

```ts
export const meta: Route.MetaFunction = ({data, location}) => {
  const locale = detectLocaleFromPath(location.pathname) ?? 'en';
  const t = makeT(locale);
  return [{title: t('home.meta_title')}];
};
```

## Pluralisation pattern

Two keys, one selector at the call site:

```tsx
const t = useT();
const key = count === 1 ? 'cart.items_ready_singular' : 'cart.items_ready_plural';
return <p>{t(key, {count})}</p>;
```

## Ordering of named-substring HTML

A handful of lines (the homepage hero, the bestseller heading)
splice an `<em>` italic word into a sentence. We split those into
three keys — `*_lead`, `*_em`, `*_tail` — and reassemble in JSX:

```tsx
<h2>
  {t('home.shop_by_room_title_lead')}{' '}
  <em className="...">{t('home.shop_by_room_title_em')}</em>{' '}
  {t('home.shop_by_room_title_tail')}
</h2>
```

This trades a tiny amount of JSX for translation freedom — the
em-fragment can be reordered or moved to a different word in
locales where the syntax demands it (e.g. French often promotes the
emphasized word to a different position).

## What we are NOT building

- No locale switching at runtime without a URL change. The locale
  IS the URL prefix; `useT` keys off `useLocation`.
- No nested namespace shorthand (`t('pdp', 'add_to_cart')`) — single
  dotted-string key only.
- No type-safe key autocomplete in this pass. The wiring pass
  generates a `type TKey = 'pdp.add_to_cart' | …` union from the
  English JSON shape and tightens `t(key: TKey)`.
- No translation memory or TMS integration. Dictionaries are
  hand-curated JSON, edited in PRs, reviewed like any other code.
