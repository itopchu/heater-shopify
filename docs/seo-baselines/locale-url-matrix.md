# Phase 0.4 — Locale × URL Pattern Matrix

> Every public URL pattern × 8 locales (en / de / nl / fr / es / it / pl / da). One row per route pattern (not per handle — 55 product handles roll up into one `/products/[handle]` row). Per `app/lib/gberg/i18n.ts:13` `SUPPORTED_LOCALES = ['en', 'de', 'nl', 'fr', 'es', 'it', 'pl', 'da']`. EN is unprefixed (root) AND prefixed (`/en/...`) per Hydrogen's `($locale)` optional-segment convention; canonical strategy must collapse those two forms.

**Domain:** `https://www.gberg-heizung.de`
**Hreflang scope:** every row marked `Identical content` needs `<link rel="alternate" hreflang>` × 8 + `x-default` per plan §1.1.

---

## URL pattern × locale matrix

Legend:
- `Y` = renders identical content per locale (modulo Translate & Adapt strings) → needs canonical + hreflang.
- `N/A` = route not applicable per locale (cart, search, action endpoints) → noindex / no hreflang.
- `R` = redirect-only route (no head to audit).

| Pattern | en (default + `/en`) | de (`/de`) | nl (`/nl`) | fr (`/fr`) | es (`/es`) | it (`/it`) | pl (`/pl`) | da (`/da`) | Hreflang? |
|---|---|---|---|---|---|---|---|---|---|
| `/` (homepage) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes — × 8 + x-default** |
| `/products/[handle]` (× 55) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** — 55 × 8 = 440 hreflang entries per handle's `<head>` |
| `/products` (shop-all) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/collections/[handle]` (× ~12, e.g. `wohnraumheizkoerper`, `badheizkoerper`, `badheizkoerper-elektrisch`, `austauschheizkoerper`, `fussbodenheizung`, `accessories`, `bad`*, `fussbodenheizungsrohre`*, …) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/collections` (collections index) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/collections/all` | R → `/products` | R | R | R | R | R | R | R | n/a (redirect) |
| `/pages/[handle]` (× 8 footer pages: `imprint`, `privacy-policy`, `shipping`, `returns`, `warranty`, `contact`, `about`, `faq`) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/policies/[handle]` (× 4–5: `privacy-policy`, `shipping-policy`, `terms-of-service`, `refund-policy`, possibly `subscription-policy`) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** but currently `Disallow: /policies/` in `robots.txt` (line 80) — reconsider in Phase 1.6. |
| `/policies` (policies index) | Y | Y | Y | Y | Y | Y | Y | Y | Same as above — `Disallow: /policies/` covers it. |
| `/blogs` (news index) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/blogs/[blogHandle]` (× n) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/blogs/[blogHandle]/[articleHandle]` (× n) | Y | Y | Y | Y | Y | Y | Y | Y | **Yes** |
| `/cart` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No — cart is per-session; `Disallow: /cart` |
| `/cart/[lines]` (deeplink) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No |
| `/search` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No — already `noindex,follow` (`search.tsx:24`); also `Disallow: /search` in robots. |
| `/discount/[code]` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No — action route. |
| `/api/predictive-search` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No — JSON endpoint; plan §1.6 will explicitly disallow. |
| `/sitemap.xml` (index) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No — sitemap itself. |
| `/sitemap/[type]/[page].xml` (sub-sitemaps × 4 types: `products`, `collections`, `pages`, `articles`) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Locale fan-out happens INSIDE the sitemap as `<xhtml:link>` annotations, not at this level. **Plan §1.5** — fix the skeleton's `['EN-US', 'EN-CA', 'FR-CA']` literal. |
| `/robots.txt` | N/A | — single global file | — | — | — | — | — | — | n/a |
| `/llms.txt` *(new, Phase 3.3)* | One file at root or per-locale TBD | — | — | — | — | — | — | — | TBD; recommend single root file with cross-locale links. |

\* `bad` and `fussbodenheizungsrohre` are single-product collections that 301-redirect to PDP per `collections.$handle.tsx:21-25`. They still need canonical+hreflang on the destination PDP.

---

## Hreflang counts

- 8 locales × 1 homepage = **8 entries** per homepage `<head>` + 1 `x-default` = **9**.
- 8 locales × 55 PDPs = **440** annotations across the catalogue.
- 8 locales × ~12 collections = **96** annotations.
- 8 locales × ~8 pages = **64** annotations.
- 8 locales × 1 shop-all = **8**.
- Plus blog index, blog handles, articles (TBD count once content ships).

Total hreflang `<link rel="alternate">` tags emitted across the site ≈ **~620** distinct annotations, distributed one bundle per page-render.

---

## Canonical strategy notes

- **EN double-form risk.** With Hydrogen's `($locale)` optional segment, both `/products/foo` and `/en/products/foo` render the same content. Pick one as canonical (recommendation: unprefixed `/products/foo`) and emit a self-canonical there; `/en/products/foo` should `<link rel="canonical">` to the unprefixed URL.
- **Filter / sort dupes.** `/collections/wohnraumheizkoerper?sort_by=price-asc` already disallowed (`robots.txt` line 64-69); canonical on the clean path will reinforce.
- **Single-product redirect collections** (`bad`, `fussbodenheizungsrohre`) — destination PDP is canonical for the collection URL.
- **Trailing slash.** Hydrogen routes do not use trailing slashes. Confirm CDN normalises `/products/foo/` → `/products/foo`.

---

## Country / language pairing for `@inContext`

Currently `app/lib/gberg/i18n.ts:84` hardcodes `country: 'NL'` for every locale. **BUG** — see `head-bugs.md`. For canonical+hreflang to make sense, `localeToInContext` must return a locale-appropriate country (`de` → `DE`, `fr` → `FR` or `BE`, `es` → `ES`, etc.). Hreflang pairs should match the country in `<link rel="alternate" hreflang="de-DE">` style, not bare `de`.

---

## Out of scope for this matrix

- Per-product handle enumeration (55 rows × 8 locales = 440-row table) — not useful as a single document; the sitemap output will be the source of truth.
- Per-collection handle enumeration — same logic.
- Article handle enumeration — content not yet published.
