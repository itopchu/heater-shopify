# Phase 0.3 — Head / Meta Concrete Bugs

> Each entry: file:line, current code, what's wrong, fix per `docs/seo-ai-readiness-plan.md` (NOT yet implemented). Listed in priority order (highest crawler-yield impact first).

---

## 1. `<html lang="en">` hard-coded — every locale advertises EN

- **File:** `apps/store-heating-hydrogen/app/root.tsx:146`
- **Current:**
  ```tsx
  <html lang="en" data-brand="heating">
  ```
- **What's wrong:** All 8 locale URLs (`/en`, `/de`, `/nl`, `/fr`, `/es`, `/it`, `/pl`, `/da`) render with `lang="en"`. Breaks Translate & Adapt language detection, breaks a11y screen-reader pronunciation, breaks Google's locale matching for hreflang.
- **Fix (plan §1.2):** Lift the `($locale)` param into `Layout()` via `useMatches()` or a root-level loader-data lookup; map to `htmlLang(locale)` (already exported from `lib/gberg/i18n.ts:60`).
- **Note (plan §11):** The comment at `root.tsx:5-7` says `sets <html lang="en" data-brand="heating"> per the brand spec` — that comment is stale; the brand spec doesn't pin lang to EN.

---

## 2. Sitemap fan-out: skeleton-leftover locale list

- **File:** `apps/store-heating-hydrogen/app/routes/($locale).sitemap.$type.$page[.xml].tsx:13`
- **Current:**
  ```ts
  locales: ['EN-US', 'EN-CA', 'FR-CA'],
  ```
- **What's wrong:** This is the Hydrogen skeleton's example value, not G-Berg's locale set. The sub-sitemap will emit `<xhtml:link rel="alternate" hreflang="EN-US">` annotations for every URL — totally wrong for a Europe market. Google will treat EN-CA / FR-CA as the only known alternates and ignore actual DE/NL/FR/ES/IT/PL/DA traffic.
- **Fix (plan §1.5):** Replace with the project's set, derived from `SUPPORTED_LOCALES` in `app/lib/gberg/i18n.ts:13`. Use language-COUNTRY pairs Shopify recognises:
  ```ts
  locales: ['EN', 'DE-DE', 'NL-NL', 'FR-FR', 'ES-ES', 'IT-IT', 'PL-PL', 'DA-DK'],
  ```
  (Confirm exact strings against Shopify's `localization` query before merging — language COUNTRY pair must match a configured Market.)

---

## 3. `localeToInContext` country pinned to `NL`

- **File:** `apps/store-heating-hydrogen/app/lib/gberg/i18n.ts:80-87`
- **Current:**
  ```ts
  export function localeToInContext(locale: Locale): InContextHint {
    // Single Europe market for now (country=NL); language hint flips by locale
    return {country: 'NL', language: LOCALE_TO_LANGUAGE[locale] ?? 'EN'};
  }
  ```
- **What's wrong:** Every Storefront-API query `@inContext(country: NL, language: …)` — so a German shopper visiting `/de/products/foo` gets the NL price, NL VAT, NL shipping. Currency, VAT and shipping methods are all locked to NL. Also pollutes the `consent.country` value in `root.tsx:74`.
- **Fix (no plan section yet — flag as Phase 1.0):** Add a `LOCALE_TO_COUNTRY` map alongside `LOCALE_TO_LANGUAGE`:
  - `en → DE` (storefront default), `de → DE`, `nl → NL`, `fr → FR`, `es → ES`, `it → IT`, `pl → PL`, `da → DK`.
  - Belgium / Austria / Luxembourg currently inaccessible via locale prefix — accept as known limitation; cross-locale FR→BE / DE→AT routing is a Markets-level problem, not URL-level.
- **Why this lives here, not just in the SEO plan:** Hreflang pairs (`hreflang="de-DE"`) only make sense if the storefront actually serves DE-context data. Otherwise we lie to Google.

---

## 4. `HOMEPAGE_FAQS` is a TSX literal

- **File:** `apps/store-heating-hydrogen/app/routes/($locale)._index.tsx:65-83`
- **Current:**
  ```tsx
  const HOMEPAGE_FAQS: FaqItem[] = [
    {question: 'Do you ship across Europe?', answer: 'Yes — we deliver to Germany, Belgium, Spain, Austria, the Netherlands and other EU countries. Free shipping over €500.'},
    {question: 'Are your radiators heat-pump compatible?', answer: 'Many of them are. Look for the \'Heat-pump ready\' badge…'},
    {question: "What's your return policy?", answer: '30-day returns on unused, unopened items. Bespoke orders are non-refundable…'},
  ];
  ```
- **What's wrong:** Violates `CLAUDE.md` non-negotiable §3 (zero hard-coded copy in source). Translate & Adapt can't reach these strings. Blocks `FAQPage` JSON-LD on homepage (plan §2.4) since the same strings need to power the schema.
- **Fix (plan §3.7):** Replace with a `faq_group` metaobject query keyed by handle `homepage`. Loader fetches; `<FaqAccordion>` already supports the shape.

---

## 5. No canonical URL on any route

- **Files:** every `meta()` callsite — none emit `<link rel="canonical">`.
  - `app/routes/($locale)._index.tsx:20-28`
  - `app/routes/($locale).products.$handle.tsx:50-66`
  - `app/routes/($locale).collections.$handle.tsx:27-32`
  - `app/routes/($locale).pages.$handle.tsx:30-33`
  - `app/routes/($locale).policies.$handle.tsx:10`
  - `app/routes/($locale).blogs._index.tsx:18-24`
  - `app/routes/($locale).blogs.$blogHandle._index.tsx:7`
  - `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx:6`
  - `app/routes/($locale).products._index.tsx:13-20`
  - `app/routes/($locale).search.tsx:12-25`
  - `app/routes/($locale).cart.tsx:7`
- **What's wrong:** Without canonical, dual-form URLs (`/products/foo` vs `/en/products/foo`) compete for ranking; query-param URLs (`?sort_by=…`) potentially split equity even though they're disallowed in robots.
- **Fix (plan §1.1):** Build `app/lib/gberg/seo.ts` with `canonicalFor(routePathname, locale)` and emit on every route's `meta()`.

---

## 6. No hreflang or `x-default` on any route

- **Files:** same list as #5.
- **What's wrong:** Google has no way to map a German shopper's query to `/de/products/foo`. Result: DE shoppers see EN URLs in SERP and bounce. **The single biggest blocker to non-English market acquisition.**
- **Fix (plan §1.1):** `hreflangsFor(routePathname)` emitting 8 alternates + `x-default → /en/...`.

---

## 7. No OG image / Open Graph / Twitter Card on any route

- **Files:** same list as #5.
- **What's wrong:** Every social share / Slack / WhatsApp / iMessage preview is a bare URL with the page's `<title>`, no image, no card. Google also reads `og:image` as a hint for image search.
- **Fix (plan §1.3, §1.4):** `ogTagsFor({type, title, description, image, url, locale})`. Default OG asset at `public/og/default.jpg` (1200×630).

---

## 8. Hero `<Image>` lacks `fetchpriority="high"` / `loading="eager"`

- **Files:**
  - `apps/store-heating-hydrogen/app/routes/($locale)._index.tsx:174-181` — homepage hero `<Image>` block has no priority hint.
  - `apps/store-heating-hydrogen/app/components/gberg/pdp/gallery.tsx` — gallery hero `<Image>` (no `fetchpriority` or `loading` attribute anywhere in file per grep).
- **What's wrong:** Hydrogen `<Image>` defaults to `loading="lazy"`. The above-the-fold hero is the LCP element on both routes; lazy-loading kills LCP < 2.5s target.
- **Fix (plan §1.7):** Add `loading="eager"` and `fetchpriority="high"` (set on the underlying `<img>` — Hydrogen `<Image>` may need a wrapping technique or a direct `<img>` for the priority hint).

---

## 9. Skeleton-leftover `Hydrogen | …` titles

- **Files:**
  - `apps/store-heating-hydrogen/app/routes/($locale).policies.$handle.tsx:10`
    ```ts
    return [{title: `Hydrogen | ${data?.policy.title ?? ''}`}];
    ```
  - `apps/store-heating-hydrogen/app/routes/($locale).blogs.$blogHandle._index.tsx:7`
    ```ts
    return [{title: `Hydrogen | ${data?.blog.title ?? ''} blog`}];
    ```
  - `apps/store-heating-hydrogen/app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx:6`
    ```ts
    return [{title: `Hydrogen | ${data?.article.title ?? ''} article`}];
    ```
  - `apps/store-heating-hydrogen/app/routes/($locale).cart.tsx:7`
    ```ts
    return [{title: `Hydrogen | Cart`}];
    ```
- **What's wrong:** Brand pollution in SERP / browser tabs. SEO regression (`Hydrogen | Privacy Policy` competes with the actual brand "G-Berg" for site-link queries).
- **Fix:** Drop `Hydrogen |` prefix; use plain title or `${title} — G-Berg Heizung`. Owns line in plan §1.10 by extension (description fallbacks); should be folded in.

---

## 10. `meta()` missing entirely on two routes

- **File 1:** `apps/store-heating-hydrogen/app/routes/($locale).collections._index.tsx` — no `export const meta` anywhere.
- **File 2:** `apps/store-heating-hydrogen/app/routes/($locale).policies._index.tsx` — no `export const meta` anywhere.
- **What's wrong:** `<title>` falls back to whatever React Router computes from parent — currently nothing. Browser tab shows URL.
- **Fix (plan §1.1):** Add `meta()` exports.

---

## 11. Description final fallbacks are empty strings

- **PDP:** `apps/store-heating-hydrogen/app/routes/($locale).products.$handle.tsx:55-63`
  ```ts
  content: seo?.override_description ?? product.seo.description ?? product.common.custom?.short_description ?? product.common.custom?.subtitle ?? '',
  ```
- **PLP:** `apps/store-heating-hydrogen/app/routes/($locale).collections.$handle.tsx:31`
  ```ts
  content: col.seo?.description ?? col.description ?? '',
  ```
- **Page:** `apps/store-heating-hydrogen/app/routes/($locale).pages.$handle.tsx:33`
  ```ts
  content: page.seo?.description ?? page.intro ?? '',
  ```
- **What's wrong:** Empty `<meta name="description" content="">` is worse than no description (SERP picks an arbitrary excerpt). Per plan §0.3 the catalogue audit will reveal how many products today fall through to `''`.
- **Fix (plan §1.10):** `synthesizeDescription(product)` from `key_facts`. Same for collections.

---

## 12. No skip-to-content link

- **File:** `apps/store-heating-hydrogen/app/root.tsx` (anywhere in `Layout()` / `App()` body) — grep for `/skip|Skip/i` returns 0 matches in `root.tsx` and `header.tsx`.
- **What's wrong:** A11y baseline; Lighthouse SEO ≥ 95 needs a11y green.
- **Fix (plan §1.8):** Visually hidden `<a href="#main">Skip to main content</a>` as the first focusable element inside `<body>`, becoming visible on focus. `<main id="main">` already exists at `root.tsx:184`.

---

## 13. No JSON-LD anywhere

- **Files:** entire `app/` tree — `grep -rn "application/ld+json"` returns 0 hits.
- **What's wrong:** Every Phase 2 deliverable.
- **Fix (plan §2.1–§2.7):** New `app/lib/gberg/jsonld.ts` with `organizationJsonLd`, `websiteJsonLd`, `breadcrumbJsonLd`, `productJsonLd`, `faqPageJsonLd`, `itemListJsonLd`, `articleJsonLd`. Wired into route loaders / `root.tsx`.

---

## 14. `headerMenu` rendered with `locale = DEFAULT_LOCALE` constant

- **File:** `apps/store-heating-hydrogen/app/root.tsx:170`
  ```ts
  const locale = DEFAULT_LOCALE;
  ```
- **What's wrong:** Same root cause as #1. The header / utility-bar / footer all render with `locale = 'en'` regardless of route. Language switcher widgets won't reflect "user is on /de" because the prop says "en".
- **Fix:** Bundled with #1 fix — derive from `($locale)` param via `useMatches()`.

---

## 15. `redirectIfHandleIsLocalized` misuse on non-localized handles

- **Files:**
  - `apps/store-heating-hydrogen/app/routes/($locale).blogs.$blogHandle._index.tsx` — calls it.
  - `apps/store-heating-hydrogen/app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx` — calls it.
- **What's wrong:** This Hydrogen helper redirects when a Shopify resource has a different handle in the queried locale (e.g. `de/blog-name` vs `en/blog-name`). Today the storefront serves only EN — but if Translate & Adapt ever produces a localized blog handle the redirect will fire toward a URL that doesn't yet have a hreflang counterpart, causing a SEO churn cycle. Note as a watch-item once Phase 1.1 lands.

---

## 16. Skeleton-leftover render trees

- **`($locale).collections._index.tsx:43-74`** — bare `<h1>Collections</h1>` + grid; no Eyebrow, no description, no localized strings. Visible UX bug as much as SEO bug — meta-less page also shows brand-less content.
- **`($locale).policies.$handle.tsx:51-65`** — `<div className="policy">` with `<br/><br/>` and no design system — leaky-skeleton page. Will need a redesign pass alongside SEO work; flag for the design workstream, not Phase 0/1.
- **`($locale).blogs.$blogHandle._index.tsx`** — same pattern, raw skeleton.
- **`($locale).blogs.$blogHandle.$articleHandle.tsx`** — same.
- **`($locale).cart.tsx`** — uses `CartMain` (G-Berg-branded) but title still says `Hydrogen | Cart`.

---

## Out-of-band observations (not in the plan but worth flagging)

- **a)** `consent.country` in `root.tsx:73` reads `args.context.storefront.i18n.country` — but `i18n.country` is set elsewhere in the storefront server initialisation. With `localeToInContext.country = 'NL'` hard-pinned, the consent banner would also default to NL geography. If/when the privacy banner is enabled (`withPrivacyBanner: false` today), this becomes a GDPR-config bug, not just SEO.
- **b)** `data-brand="heating"` on `<html>` — useful for CSS targeting but never read elsewhere; harmless.
- **c)** Demote-headings regex at `($locale).products.$handle.tsx:demoteEmbeddedHeadings()` only handles h1/h2/h3; pre-existing h4/h5 in xxl-heizung body_html stay un-demoted (plan §8). This is plan-aware; flag here for completeness.
