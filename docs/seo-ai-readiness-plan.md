# G-Berg Heizung — SEO & AI-Crawler Readiness Plan

> **Status:** Plan only. Nothing in here is implemented. Treat each task as a TODO ready to be picked up.
> **Scope:** Hydrogen storefront under `apps/store-heating-hydrogen/` running on Shopify Oxygen at `https://www.gberg-heizung.de`.
> **Catalog:** 55 products, 170 product images, 8 footer pages, 8 supported locales (EN primary; DE / NL / FR / ES / IT / PL / DA secondary).

---

## Executive summary

### What's already in place (audited)

| Area | Status | Where |
|---|---|---|
| `robots.txt` route | Exists (Hydrogen template defaults) | `app/routes/[robots.txt].tsx` |
| Sitemap index + sub-sitemap routes | Exist (Shopify Hydrogen helpers) | `app/routes/($locale).[sitemap.xml].tsx`, `app/routes/($locale).sitemap.$type.$page[.xml].tsx` |
| `<main>` landmark | Yes, in `root.tsx` (`<main id="main">`) | `app/root.tsx:184` |
| Server-rendered PDP content (title, gallery, BuyBox, Quick Facts, AiBlock, specs, FAQ, related) | Yes, all SSR via React Router loaders | `app/routes/($locale).products.$handle.tsx` |
| Visible "AI block" with entity summary, key facts, compatibility, customer-question summary | Yes, server-rendered | `app/components/gberg/pdp/ai-block.tsx` |
| Visible Quick Facts (icon-decorated specs table) | Yes, driven by metafields | `app/components/gberg/pdp/quick-facts.tsx`, `app/lib/gberg/heating-derived.ts` |
| Visible specs table with EN 442 power data, dimensions, etc. | Yes, on PDP | `app/routes/($locale).products.$handle.tsx:218-228` |
| Breadcrumb (visible) | Yes, on PDP | `app/routes/($locale).products.$handle.tsx:132` |
| FAQ accordion on PDP and homepage | Yes, server-rendered `<details>` | `app/components/gberg/pdp/sections-accordion.tsx`, homepage `HOMEPAGE_FAQS` |
| Language switcher | UI exists, but only EN actually routes | `app/components/gberg/language-switcher.tsx`, `app/routes/($locale).tsx` |
| Font preconnect | Yes (`fonts.googleapis.com`, `fonts.gstatic.com`) | `app/root.tsx:48-49` |
| Skip-to-content link | **No** | — |
| 404 / `($locale).$.tsx` catch-all | Exists | `app/routes/($locale).$.tsx` |

### What's missing (the work this plan covers)

1. **No structured data anywhere.** No `Product`, `BreadcrumbList`, `ItemList`, `FAQPage`, `Organization`, `WebSite`, or `Article` JSON-LD on any route. A grep for `application/ld+json` returns zero hits in `app/`.
2. **No canonical or hreflang tags.** `root.tsx`'s `<head>` only emits `<Meta />` + `<Links />` + viewport + a hard-coded `lang="en"` (the route `$locale` param never feeds back into `<html lang>`). All 8 locales currently advertise themselves as English to crawlers.
3. **Sitemap mis-configured.** `($locale).sitemap.$type.$page[.xml].tsx` ships with the skeleton's `locales: ['EN-US', 'EN-CA', 'FR-CA']` instead of the project's actual EN/DE/NL/FR/ES/IT/PL/DA + `de-DE` / `nl-NL` country pairings.
4. **`robots.txt` has no AI-crawler policy.** No directives for `GPTBot`, `Google-Extended`, `ClaudeBot`, `PerplexityBot`, `Applebot-Extended`, `Bytespider`, `CCBot`, `Amazonbot`, `Meta-ExternalAgent`. The decision (allow / partial / block) hasn't been made.
5. **No `/llms.txt`.** The emerging Anthropic / Cloudflare convention isn't served.
6. **Per-page `meta()` is title + description only.** No OG, no Twitter card, no `og:image`, no `og:type`, no `og:locale[:alternate]`.
7. **`root.tsx` hardcodes `<html lang="en">` regardless of route locale** (`app/root.tsx:146`). This bug also breaks accessibility tools.
8. **PDP heading hierarchy has a latent bug.** `demoteEmbeddedHeadings()` only demotes one level, so an `<h1 class="m-product-title">` from xxl-heizung's `body_html` becomes an `<h2>` — fine — but then the next nested `<h2>` becomes `<h3>` — also fine — yet pre-existing `<h4>`/`<h5>` in source HTML stay un-demoted (regex only covers h1-h3). Catalog audit needed.
9. **Homepage FAQ block is hard-coded in TSX** (`HOMEPAGE_FAQS` literal). Violates the "merchant-editable" rule from `CLAUDE.md` and isn't backed by a `faq_group` metaobject.
10. **No analytics / monitoring wiring beyond `Analytics.Provider`** from Hydrogen. No GSC / Bing verification, no GA4, no RUM for CWV.
11. **Hero image lacks `fetchpriority="high"`** — `Image` component is rendered but the priority hint is not set, hurting LCP on the homepage.
12. **Cookie banner risk:** `withPrivacyBanner: false` in `root.tsx`, so no banner is currently rendered. When enabled later, must NOT block render of body content for crawlers.
13. **The hard-coded `<html lang="en">` plus EN-only `($locale)` whitelist mean DE/NL/FR/ES/IT/PL/DA URLs would 404 today.** Route loader rejects unsupported locales — but `SUPPORTED_LOCALES` already lists all 8. So the `($locale)` route accepts them; we just don't yet have the Translate & Adapt content wired into queries via the `@inContext` directive country/language pair (see `lib/gberg/i18n.ts:localeToInContext` — the country is hardcoded `NL` for every locale, which is wrong for DE shoppers and breaks per-country VAT/pricing).

### Phasing logic

We sequence by risk × yield:

- **Phase 0** = audit & baseline (read-only; no shipping risk; sets numbers we'll regress against).
- **Phase 1** = head/meta/sitemap/robots quick wins. Pure additive HTML; can ship in a day each. Single biggest crawler-yield jump.
- **Phase 2** = JSON-LD structured data. Higher LOE; needs strict parity with visible content.
- **Phase 3** = AI-crawler-specific surface (`/llms.txt`, AI-bot policy, summary metaobject wiring).
- **Phase 4** = monitoring (GSC, Bing, GA4, CWV dashboard).

Each phase is independently shippable. A phase is "done" only when the **Acceptance** bullets at its tail validate green.

### What this plan does NOT include

See the [Won't do / out of scope](#wont-do--out-of-scope) section at the end.

---

## Phase 0 — Audit & baseline

**Goal:** Capture the current state so every later phase has a measurable before/after. No code shipped. Effort total: **S**.

### 0.1 — Lighthouse + PSI baseline (S)

- Run Lighthouse mobile (throttled 4G, Moto G4 profile) against three URLs: `/`, `/collections/wohnraumheizkoerper`, and one PDP (e.g. `/products/heizkoerper-vertikal-twister`).
- Capture: Performance, Accessibility, Best Practices, SEO, plus the four Core Web Vitals (LCP, INP, CLS, FCP) and TBT.
- Capture each JSON report; commit to `docs/seo-baselines/` (gitignored screenshots, committed JSON).
- **Why:** the project's non-negotiable Lighthouse ≥95 perf/a11y/SEO target needs a starting point.

### 0.2 — Crawl baseline (S)

- Run a single-machine Screaming Frog SEO Spider crawl (or `lychee` for link checking + a free alternative like `rg-crawler`) limited to 500 URLs against production.
- Export: indexable URLs, response codes, title length, description length, h1 count per page, canonical (will be empty), hreflang coverage (will be empty).
- Commit summary to `docs/seo-baselines/crawl-baseline.md`.

### 0.3 — Catalog of head bugs (S)

- Re-read `app/root.tsx`, `app/routes/($locale)._index.tsx`, `app/routes/($locale).products.$handle.tsx`, `app/routes/($locale).collections.$handle.tsx`, `app/routes/($locale).pages.$handle.tsx`, and `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx` looking for:
  - hard-coded `lang` attributes
  - missing `<title>` (any route falling back to "Product" or "Page")
  - description shorter than 70 chars or longer than 160 chars
  - PDPs whose `seo.override_*` metafield is empty (per `docs/metafields.md`)
- Output: `docs/seo-baselines/head-audit.md`.

### 0.4 — Locale × URL matrix (S)

- Enumerate every URL pattern × every locale → 8 × ~70 URLs ≈ 560 hreflang relationships needed.
- Document the URL pattern table in `docs/seo-baselines/url-matrix.md`.

**Acceptance:** baseline files committed; numbers logged.

---

## Phase 1 — Quick wins (head, sitemap, robots)

**Goal:** Single-pass additive changes that flip the storefront from "indexable English-only" to "fully indexable, multi-locale, with social previews." No new data dependencies; everything pulls from already-loaded route data. Effort total: **M-L**.

### 1.1 — Per-route canonical, hreflang, x-default (M)

- **Why:** Without canonical, market/locale dupes compete with each other. Without hreflang, Google never serves DE shoppers the DE URL. With 8 locales × ~70 URLs the absence of hreflang costs us the entire German organic funnel.
- **What:**
  - Add a shared `buildSeoLinks(routePathname, locale)` helper that emits `<link rel="canonical">`, `<link rel="alternate" hreflang="…">` × 8 locales, plus `<link rel="alternate" hreflang="x-default" href="…/en…">`.
  - Wire it into every route's `meta()` via React Router's `links` / `meta` exports — Hydrogen's `<Meta />` component renders both arrays.
  - Strip query params (`?sort_by`, `?filter.*`) from canonicals; keep clean path.
- **Files to touch:**
  - new `app/lib/gberg/seo.ts` (helpers: `canonicalFor`, `hreflangsFor`, `buildSeoLinks`)
  - `app/root.tsx` — set `<html lang>` from route data instead of hard-coded `"en"` (lift locale to root via a root-level `useMatches()` lookup or a context provider)
  - `app/routes/($locale)._index.tsx`
  - `app/routes/($locale).products.$handle.tsx`
  - `app/routes/($locale).collections.$handle.tsx`
  - `app/routes/($locale).collections._index.tsx`
  - `app/routes/($locale).pages.$handle.tsx`
  - `app/routes/($locale).policies.$handle.tsx`
  - `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx`
  - `app/routes/($locale).blogs.$blogHandle._index.tsx`
  - `app/routes/($locale).search.tsx` — should emit `noindex` not canonical
  - `app/routes/($locale).cart.tsx` — `noindex` (already implicitly disallowed in robots, but belt + braces)
- **Effort:** M.

### 1.2 — Fix `<html lang>` to track route locale (S)

- **Why:** A11y + SEO + Translate-&-Adapt all hinge on a correct `<html lang>`. Currently fixed to `"en"`.
- **What:** Drop a root context that exposes `locale` to `Layout()`, derived from the `($locale)` param via `useMatches()`. Update `root.tsx:146` to use it.
- **File:** `app/root.tsx` only.
- **Effort:** S.

### 1.3 — Per-route Open Graph + Twitter Card (M)

- **Why:** Without OG/Twitter tags, every share / Slack / WhatsApp / DM preview is the bare URL. Google also reads `og:image` as a hint. A product hero used as `og:image` is the cheapest social-share win we'll ever ship.
- **What:** add to the same `seo.ts` helper an `ogTagsFor({type, title, description, image, url, locale})` returning the React Router `meta` array. Wire into every route.
- **Per route:**
  - Home → `og:type=website`, `og:image` = PUBLIC_URL/og/home.jpg (or hero variant generated below)
  - PDP → `og:type=product`, `og:image` = product.featuredImage
  - PLP → `og:type=website`, `og:image` = first product hero
  - Page / policy / article → `og:type=article` with `og:image` = featured image or default
  - All routes also emit `twitter:card=summary_large_image`, `twitter:site=@gberg`, and `og:locale[:alternate]` × secondary locales.
- **Files:** all `meta()` callsites in `app/routes/`.
- **Effort:** M.

### 1.4 — Default OG image asset (S)

- **What:** add a single default OG asset under `public/og/default.jpg` (1200×630, brand colors, logo + tagline). Used as a fallback when a route has no specific image.
- **File:** `public/og/default.jpg` (and document its source in `docs/og-images.md`).
- **Effort:** S. Asset creation only — no code.

### 1.5 — Fix Hydrogen sitemap locale list (S)

- **Why:** `app/routes/($locale).sitemap.$type.$page[.xml].tsx` still ships the skeleton's `locales: ['EN-US', 'EN-CA', 'FR-CA']`. We need our 8 locales, expressed in the language-COUNTRY pairs Shopify uses (e.g. `EN`, `DE-DE`, `NL-NL`, `FR-FR`, etc.). Confirm exact naming with the live store's `localization` query.
- **What:**
  - Replace the locales array with the project's set, derived from `SUPPORTED_LOCALES` in `lib/gberg/i18n.ts`.
  - Verify `getLink` produces `/{locale}/{type}/{handle}` (already correct).
  - Verify the index sitemap (`($locale).[sitemap.xml].tsx`) auto-discovers the new sub-sitemaps.
- **Files:** `app/routes/($locale).sitemap.$type.$page[.xml].tsx`, optionally `app/routes/($locale).[sitemap.xml].tsx`.
- **Effort:** S.

### 1.6 — `robots.txt` upgrades (S)

- **Why:** the current robots disallows the right things (cart, account, sort/filter dupes) but says nothing about AI crawlers.
- **What (Phase 1 part — generic SEO only):**
  - Add `Sitemap:` line to point at `https://www.gberg-heizung.de/sitemap.xml`.
  - Add per-locale sitemap declarations (e.g. `Sitemap: https://www.gberg-heizung.de/de/sitemap.xml`) once Phase 1.5 is in.
  - Disallow `/api/predictive-search` (already needed; it's an internal JSON endpoint that has zero indexable value).
  - Keep crawl-delay rules for Ahrefs / MJ12.
- **File:** `app/routes/[robots.txt].tsx`.
- **Effort:** S.
- **Note:** AI-crawler rules deferred to Phase 3.

### 1.7 — `<picture>` + `fetchpriority="high"` for hero images (S)

- **Why:** LCP target < 2.5s. Hydrogen's `<Image>` accepts `loading="eager"` but not natively `fetchpriority`. We need to set the attribute on the underlying `<img>` for the homepage hero and PDP gallery first image.
- **What:**
  - Homepage hero (`app/routes/($locale)._index.tsx:174`) — wrap or extend so the rendered `<img>` carries `fetchpriority="high"` and `loading="eager"`.
  - PDP gallery first image (`app/components/gberg/pdp/gallery.tsx`) — same.
  - Below-the-fold images explicitly `loading="lazy"` (already default but document).
- **Files:** `app/components/gberg/pdp/gallery.tsx`, `app/routes/($locale)._index.tsx`.
- **Effort:** S.

### 1.8 — Skip-to-content link (S)

- **Why:** A11y baseline. Lighthouse SEO ≥95 needs a11y green.
- **What:** Add a visually hidden `<a href="#main">Skip to main content</a>` as the first focusable element inside `<body>`, becoming visible on focus.
- **File:** `app/root.tsx` (just before `<UtilityBar />` in the `App()` return).
- **Effort:** S.

### 1.9 — `removed product` 410 strategy (S)

- **Why:** The catalog-sync pipeline can deactivate / unpublish products. A deactivated product currently 404s through `($locale).$.tsx`. For known-removed handles we want **410 Gone** so Google removes them from the index in days, not months.
- **What:**
  - Maintain a `removed_handles` metaobject (or a `redirects.csv` we mirror via Shopify Markets URL Redirects — Shopify-native) listing `{handle, replacement_handle?, removedAt}`.
  - In `app/routes/($locale).products.$handle.tsx` loader: if `fetchProductByHandle` returns null AND `handle` is in the removed list AND has a `replacement_handle`, 301 to the replacement; else 410.
  - The catch-all `($locale).$.tsx` keeps the generic 404 for genuinely unknown URLs.
- **Files:** `app/routes/($locale).products.$handle.tsx`, optionally `app/lib/gberg/queries.ts` (new `fetchRemovedHandles` query against the metaobject).
- **Effort:** S.

### 1.10 — Wire `meta()` description fallbacks (S)

- **Why:** Phase 0.3 catalogs PDPs with empty `seo.override_description`. Today they fall through to `product.seo.description ?? product.common.custom?.short_description ?? product.common.custom?.subtitle ?? ''`. The empty-string final fallback is wrong — better to synthesize from key facts.
- **What:** In `app/routes/($locale).products.$handle.tsx` `meta()`, add a `synthesizeDescription(product)` fallback that builds a 150-char string from `key_facts` (e.g. `"BERG-MARI Twister vertical radiator. 1500 W output, 1800×500×80 mm, EN 442 certified, 10-year warranty."`). Same for collections.
- **Files:** `app/routes/($locale).products.$handle.tsx`, `app/routes/($locale).collections.$handle.tsx`, new helper in `app/lib/gberg/seo.ts`.
- **Effort:** S.

**Phase 1 acceptance:**

- All routes return 200 with non-empty `<title>`, `<description>`, `<link rel="canonical">`, `<link rel="alternate" hreflang="…">` × 8 + `x-default`, `og:title`/`og:description`/`og:image`, and `twitter:card`.
- `<html lang>` matches the route's locale on every render.
- Sitemap index lists 8 locale sub-sitemaps; each sub-sitemap returns valid XML containing 55 product URLs and the right hreflang annotations.
- Lighthouse SEO ≥ 95 on home, PDP, PLP.
- Hero LCP < 2.5s on throttled mobile.

---

## Phase 2 — Structured data (JSON-LD)

**Goal:** Server-rendered JSON-LD on every key route, in **strict parity** with the visible content. No "schema-only" claims. Effort total: **L**.

### 2.1 — `Organization` + `WebSite` on root (M)

- **Why:** Lets Google show site-link search box, knowledge-panel hooks, and assigns brand identity to the homepage.
- **What:**
  - Single `<script type="application/ld+json">` block in `root.tsx` that contains BOTH `Organization` and `WebSite` (using `@graph` array).
  - `Organization`: G-Berg GmbH, `legalName`, `url`, `logo` (asset under `public/`), `address` (Hagen, DE — match `docs/legal-checklist.md`), `contactPoint` for sales / customer service, `sameAs` for any social profiles, `vatID` once registered.
  - `WebSite`: `url`, `name`, `inLanguage` × 8, plus a `SearchAction` pointing at `/search?q={search_term_string}`.
- **Files:** new `app/lib/gberg/jsonld.ts` exporting `organizationJsonLd()` and `websiteJsonLd()`; `app/root.tsx` to inject.
- **Source-of-truth fields:** brand name from theme tokens (`@gberg/theme-tokens`), legal name from `docs/legal-checklist.md`, address from same.
- **Effort:** M.

### 2.2 — `BreadcrumbList` on PDP, PLP, article, page (M)

- **Why:** Rich snippet eligibility; the visible breadcrumb on PDP already exists, so JSON-LD just mirrors it.
- **What:** A `breadcrumbJsonLd(items)` helper that takes the same items used by `<Breadcrumb>`. Inject on:
  - PDP — uses `buildBreadcrumb(product, locale)` (already imported).
  - PLP — derive from collection title.
  - Article — derive from blog handle + article title.
  - Page — `Home → {page.title}`.
- **Files:** `app/lib/gberg/jsonld.ts`, callsites in each route file.
- **Visible mirror:** the rendered `<Breadcrumb>` component must show the SAME items (no JSON-LD-only crumbs).
- **Effort:** M.

### 2.3 — `Product` JSON-LD on PDP (L)

- **Why:** Highest-yield rich result for a commerce site (price, availability, ratings, brand, image carousel).
- **What:** `productJsonLd(product, locale)` that emits, mirroring exact visible fields:
  - `@type: "Product"`
  - `name` ← `product.title` (visible as `<h1>`)
  - `description` ← `product.common.custom?.short_description` (visible in `DescriptionSection`)
  - `image` ← `galleryImages(product)` (already used by `<Gallery>`)
  - `sku` ← `initialVariant.sku`
  - `mpn` ← `product.common.custom?.mpn` (metafield)
  - `gtin13` ← `product.common.custom?.gtin13` (metafield) when present
  - `brand` ← `{ "@type": "Brand", "name": "G-Berg" }` plus the manufacturer brand metafield when distinct (e.g. xxl-original SKUs ship with their own manufacturer)
  - `additionalProperty[]` ← every `specs.*` field that's also visible in `<SpecsTable>` (heat output, pipe spacing, dimensions, max pressure, etc.) — keep field order identical to the visible table
  - `offers` (or `aggregateOffer` if multiple variants) with `priceCurrency: EUR`, `price` from variant, `availability`, `priceValidUntil`, `itemCondition: NewCondition`, `seller` (Organization)
  - **No** `aggregateRating` until reviews exist (Phase 4)
- **Strict rules:**
  - Don't emit a property in JSON-LD that isn't visible on the rendered page.
  - When `specs.heat_pump_compatible == true`, the visible `<SpecsTable>` row "Heat-pump compatible: Yes" must be rendered.
  - VAT-inclusive price stays in the JSON-LD (Shopify Markets handles it per country); add a visible "incl. VAT" string near the price (it already is — see `BuyBox`).
- **Files:** `app/lib/gberg/jsonld.ts`, `app/routes/($locale).products.$handle.tsx`.
- **Effort:** L.

### 2.4 — `FAQPage` JSON-LD on PDP and `/pages/faq` (M)

- **Why:** Google still surfaces FAQs in some verticals + AI crawlers love them. Drives the "common questions" rich result.
- **What:**
  - On PDP — when `buildFaqsFromSections(sections)` returns ≥3 items, emit `FAQPage` mirroring those items 1:1.
  - On `/pages/faq` — read the `faq_group` metaobject (`docs/metafields.md`); emit a separate `FAQPage`.
- **Files:** `app/routes/($locale).products.$handle.tsx`, `app/routes/($locale).pages.$handle.tsx`, plus a `faqPageJsonLd(items)` helper.
- **Visible mirror:** `<FaqAccordion>` already renders the questions and answers as plain text in `<details>` — no hidden-only Q/A allowed.
- **Effort:** M.

### 2.5 — `ItemList` on PLP / collections index (M)

- **Why:** PLP eligibility for Google's product carousel. Also helps AI crawlers understand "list of products in this category."
- **What:** `itemListJsonLd(products, baseUrl, locale)` emitting `@type: "ItemList"` with `itemListElement[]` of `ListItem` referencing each product URL (and a nested `Product` if we want richer cards — start without).
- **Files:** `app/routes/($locale).collections.$handle.tsx`, `app/routes/($locale).collections._index.tsx` (and possibly `($locale).collections.all.tsx`).
- **Effort:** M.

### 2.6 — `Article` + `Person` (or `Organization`) on blog routes (S)

- **Why:** Article rich result; required if we ever publish buying guides as Shopify articles.
- **What:** `articleJsonLd(article)` with `headline`, `image`, `datePublished`, `dateModified`, `author` (Person if `article.author?.name`, else Organization), `publisher` (Organization), and `mainEntityOfPage` = canonical URL.
- **Files:** `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx`.
- **Effort:** S.

### 2.7 — `LocalBusiness` if/when Hagen showroom exists (S — gated)

- **Why:** If there's any walk-in / showroom for G-Berg GmbH, `LocalBusiness` unlocks Maps presence.
- **What:** New `localBusinessJsonLd()` injected on `/pages/contact` with `address`, `geo`, `openingHours`, `telephone`. Skip if there's no physical commerce.
- **File:** `app/routes/($locale).pages.$handle.tsx` conditional on `params.handle === 'contact'`.
- **Effort:** S — gated on user confirming whether Hagen address is a customer-facing location.

### 2.8 — Guard rails: parity tests (M)

- **Why:** JSON-LD that lies to Google is worse than no JSON-LD. Build a regression test.
- **What:**
  - A vitest test under `app/lib/gberg/__tests__/jsonld-parity.test.ts` that, for a fixture `HeatingProduct`, runs `productJsonLd()` and asserts every emitted `additionalProperty` name and `offers.price` exists in the React tree rendered by the PDP component. Use `@testing-library/react` to render and string-match.
  - Same for `BreadcrumbList`, `FAQPage`, `ItemList`.
- **Files:** new tests + an exported `getVisibleSpecLabels(product)` helper.
- **Effort:** M.

**Phase 2 acceptance:**

- Google Rich Results Test green for `Product`, `Breadcrumb`, `FAQPage` (where applicable), `ItemList` (where applicable), `Organization`, `WebSite`, `Article`.
- Schema.org validator (validator.schema.org) zero errors.
- Parity tests pass in CI.

---

## Phase 3 — AI-readiness layer

**Goal:** Surfaces specifically aimed at GPTBot / ClaudeBot / PerplexityBot / Applebot-Extended / Google-Extended. Not the same as Phase 2; AI crawlers value clean Markdown summaries, allowlists, and per-page LLM-friendly content. Effort total: **M-L**.

### 3.1 — AI-crawler policy decision (S — non-code, blocking)

- **Why:** This is a **policy choice**, not a code task. We need an explicit answer before robots gets touched. Decision matrix:
  | Bot | What it does | Recommend |
  |---|---|---|
  | `GPTBot` | OpenAI training crawler | Allow (free LLM training brand exposure) |
  | `ChatGPT-User` | ChatGPT browse-on-demand | Allow (real-time citations) |
  | `OAI-SearchBot` | OpenAI's SearchGPT crawler | Allow |
  | `Google-Extended` | Gemini training opt-in | Allow |
  | `ClaudeBot` | Anthropic training | Allow |
  | `claude-web`, `Claude-User` | Anthropic on-demand | Allow |
  | `PerplexityBot`, `Perplexity-User` | Answer-engine citations | Allow |
  | `Applebot-Extended` | Apple Intelligence training | Allow |
  | `Bytespider` | TikTok/ByteDance scrape | Block (no commerce upside, heavy load) |
  | `CCBot` | Common Crawl | Allow (well-behaved, fuels open models) |
  | `Amazonbot` | Alexa/Amazon | Allow |
  | `Meta-ExternalAgent` | Meta AI training | Allow (with `crawl-delay`) |
  | `Diffbot` | Generic scrape | Block unless we take their money |
- **Output:** decision logged in `docs/seo-baselines/ai-crawler-policy.md` with rationale (mirrors `docs/app-decisions.md` style).
- **Effort:** S; user-blocking.

### 3.2 — `robots.txt` AI-crawler rules (S)

- **Why:** Encode 3.1's decision.
- **What:** Add per-bot `User-agent: …` blocks to `app/routes/[robots.txt].tsx`. For allowed bots, emit just `Allow: /` plus the same generic disallow rules used for `*`. For blocked bots, single `Disallow: /`. Add `Crawl-delay: 5` for `Meta-ExternalAgent`.
- **File:** `app/routes/[robots.txt].tsx`.
- **Effort:** S.

### 3.3 — `/llms.txt` route (M)

- **Why:** The emerging convention (Anthropic-flavored, but adopted by Cloudflare, Vercel, others) is that AI agents fetch `/llms.txt` to discover the canonical, ingestion-friendly content map of a site. For commerce, that's: brand summary → category list → top products → key policies.
- **What:**
  - New route `app/routes/[llms.txt].tsx` returning `text/plain` (Markdown body served as plain text to maximise compatibility).
  - Content sections:
    1. `# G-Berg Heizung` — H1 with one-line brand description.
    2. `## About` — 2-3 sentence company summary (sourced from a `support_block` metaobject with `kind = "brand_summary"`).
    3. `## Categories` — bulleted list of collections with one-line description each, fetched from Storefront API.
    4. `## Featured products` — bulleted list of 12-20 top products, each linking to `/products/{handle}` with a one-line factual summary (sourced from `product.common.aix.entity_summary` metafield, which already exists).
    5. `## Policies` — direct links to /pages/shipping, /pages/returns, /pages/warranty, /pages/imprint, /pages/privacy, /pages/terms.
    6. `## Contact` — single line.
  - Cache header: `Cache-Control: max-age=3600` (revalidate hourly; catalog sync runs weekly).
  - Optional companion `/llms-full.txt` with the full Markdown body of every product (heavier; defer to Phase 3.5 if value warrants).
- **Files:** `app/routes/[llms.txt].tsx`, new helper `app/lib/gberg/llms-content.ts`, possibly `app/lib/gberg/queries.ts` for the new "all-products-with-summary" query.
- **Effort:** M.

### 3.4 — `ai_summary_block` metaobject wiring per product (M)

- **Why:** The metaobject exists per the project context. Today the PDP renders `aix.entity_summary` but doesn't yet expose the metaobject's structured Markdown summary. We want a clean Markdown blob crawlers can ingest without fighting our DOM.
- **What:**
  - Verify the `ai_summary_block` metaobject reference field (suspected: `product.metafields.aix.summary_block`).
  - Render the Markdown verbatim inside the existing `<AiBlock>`, BELOW `customerQuestionSummary`. Use a small Markdown renderer (`marked` or `micromark`) — server-side only.
  - Same Markdown blob is also surfaced inside `/llms.txt` per product (deduplicated; the per-product summary bullet links to PDP, but the full Markdown only ships in `/llms-full.txt` if we build it).
- **Files:** `app/lib/gberg/queries.ts` (extend product query), `app/components/gberg/pdp/ai-block.tsx`, optionally `app/lib/gberg/jsonld.ts` if we add a `description` field on `Product` JSON-LD that uses the summary.
- **Effort:** M.

### 3.5 — Anti-AI-confounding hygiene (S)

- **Why:** AI crawlers struggle with content gated behind cookie banners, JS-only price rendering, infinite scroll, or hidden-by-default tabs.
- **What — verify each item:**
  - Cookie banner: today disabled (`withPrivacyBanner: false`). When enabled: must NOT block render of body content. Banner should be a fixed overlay; body content remains in initial HTML.
  - Price: confirm `<BuyBox>` SSRs the price (it does, via loader-fetched `priceRange`). No JS-rendered "loading…" placeholder for crawlers.
  - Sections accordion: today first section is `open={i === 0}`. Server-rendered `<details>` content is in the DOM regardless of `open` state — good. Verify with a `view-source:` check post-deploy.
  - Pagination: PLP uses `<PaginatedResourceSection>` (cursor-based, not infinite scroll) → already crawler-safe. Document this.
  - PDP "Documents" section that renders PDF links — server-rendered, good.
- **Output:** `docs/seo-baselines/ai-confounding-audit.md` listing each pattern as Pass / Fix-needed.
- **Files:** docs only; any "Fix-needed" items become Phase 3.6 tickets.
- **Effort:** S.

### 3.6 — Content gaps for AI-readiness on PDP (M)

- **Why:** Today PDP is missing two factual blocks the AI checklist demands.
- **What:**
  - **"Who is this for?"** — short paragraph derived from `room_type` (metafield) + `room_coverage_m2` (metafield). E.g. _"Sized for living rooms and bedrooms up to 18 m²."_ Add as new component `app/components/gberg/pdp/who-its-for.tsx`, slotted between `<AiBlock>` and `<DescriptionSection>`.
  - **"Compatibility"** — paragraph + bulleted list derived from `radiator_compatibility_guide` metaobject reference. Add as new component `app/components/gberg/pdp/compatibility.tsx`. Keep the visible mirror — feed the same string into `Product.additionalProperty` JSON-LD.
  - **"Delivery and returns"** summary — the small aside is in place but plain text. Wire it to a `support_block` metaobject (handle: `delivery-returns-summary`) so a merchant can edit it once and have it propagate.
  - **Dimensions string** — already covered by `<SpecsTable>` (W/H/D rows). Ensure `dimensions_w_h_d_mm` metafield is the source so AI crawlers pick up a single canonical "1800×500×80 mm" string in addition to individual rows.
- **Files:** new PDP components above; loader extension in `app/routes/($locale).products.$handle.tsx`; metaobject query in `app/lib/gberg/queries.ts`.
- **Effort:** M.

### 3.7 — Homepage FAQ → metaobject (S)

- **Why:** `HOMEPAGE_FAQS` is a TSX literal — violates merchant-editable rule. Also we want the same content powering homepage `FAQPage` JSON-LD AND `/llms.txt`.
- **What:** Replace the literal with a query against a `faq_group` metaobject keyed by handle `homepage`. Loader fetches it; render via `<FaqAccordion>` (already supports the shape).
- **Files:** `app/routes/($locale)._index.tsx`, possibly extend `app/lib/gberg/queries.ts`.
- **Effort:** S.

**Phase 3 acceptance:**

- `/robots.txt` returns explicit per-AI-bot rules matching the documented policy.
- `/llms.txt` returns ≥1 KB of valid Markdown listing all categories + ≥12 products.
- Every PDP renders Quick Facts + AI block + Who-it's-for + Compatibility + Dimensions + FAQ — visible, server-side.
- Curl-fetched HTML (no JS) of PDP / PLP / homepage contains every fact later asserted in JSON-LD.

---

## Phase 4 — Monitoring

**Goal:** From "we shipped good SEO" to "we measure SEO and act on it." Effort total: **M**.

### 4.1 — Google Search Console + Bing Webmaster Tools verification (S)

- **Why:** Submit sitemaps, get coverage/queries/CTR data, get notified of manual actions / Core Web Vital regressions.
- **What:**
  - GSC: TXT-record verification at the registrar (preferred over meta tag — survives storefront platform swap). Add property for **all 8 locale subdirectories** as separate GSC properties OR a single domain-level property (recommend domain-level on registrar TXT).
  - Bing: same pattern; XML key file or DNS TXT.
  - Submit `https://www.gberg-heizung.de/sitemap.xml` to both.
  - Document in `docs/seo-baselines/search-console-setup.md`.
- **Effort:** S — but **user-action-required** (only the user can complete the OAuth/registrar handshake).

### 4.2 — GA4 (M)

- **Why:** Aggregate user behavior, conversion attribution, search-source breakdowns.
- **What:** Decision: GA4 via Shopify Customer Events pixel **vs** native gtag.js in `root.tsx`. Recommend Shopify Customer Events — keeps consent enforcement aligned with Shopify Privacy API and avoids double-loading.
- **Files:** Shopify Admin (Customer Events, **user UI clicks needed**); zero code if we go with the Shopify-native path.
- **Effort:** M (mostly Admin clicks + tag verification).

### 4.3 — RUM for Core Web Vitals (S)

- **Why:** Lab numbers (Lighthouse) lie. Real-user RUM is the only honest CWV view.
- **What:**
  - Option A — Shopify-native: Web Vitals via Shopify Analytics (already wired by `Analytics.Provider` in `root.tsx`); confirm in Admin.
  - Option B — `web-vitals` npm package, send to GSC's CrUX (free) plus a small endpoint we own (`api/rum`). Defer this; CrUX alone via GSC is enough.
- **Effort:** S — ship Option A.

### 4.4 — Indexing / coverage dashboard (S)

- **Why:** A single weekly view: indexed-URL count, top queries, CTR, average position, CWV pass-rate.
- **What:**
  - Either a Looker Studio dashboard pulling GSC + GA4 (free), OR a weekly Slack/email digest powered by the GSC API.
  - Defer the digest; ship the Looker Studio template first.
  - Commit the share link to `docs/seo-baselines/dashboard.md`.
- **Effort:** S.

### 4.5 — Schema regression in CI (M)

- **Why:** Catch JSON-LD breakage before it ships.
- **What:**
  - Add a CI step that runs `npx schema-dts-gen` or, simpler, `npx structured-data-testing-tool --url=…` against a deployed preview URL.
  - Alternative for hermetic CI: serialize the React tree of a fixture PDP, extract the JSON-LD `<script>` content, validate against schema-dts types.
  - Block CI on schema errors.
- **Effort:** M.

**Phase 4 acceptance:**

- GSC + Bing both verified; sitemaps submitted and processed without errors.
- GA4 (or Shopify Customer Events) recording purchases.
- Looker Studio dashboard shareable link in `docs/seo-baselines/dashboard.md`.
- CI fails on a deliberately-broken JSON-LD fixture.

---

## Won't do / out of scope

- **Hand-translation of content.** Project policy: Translate & Adapt does NL/DE/FR/ES/IT/PL/DA. We only make the EN source pristine.
- **Server-side A/B testing of meta titles.** Adds infra; defer until catalog grows past 200 products.
- **AMP.** Deprecated.
- **`HowTo` schema.** Reserved for buying-guide articles; a `buying_guide` metaobject exists but no content yet. Ship in a follow-up plan when the first guide goes live.
- **`Recipe`-style schema, `Course`, `Event`.** Not commerce-relevant.
- **Manual `<link rel="prerender">` / `<link rel="prefetch">` of next pages.** Hydrogen + React Router 7 already does the right thing.
- **Service worker for offline PDPs.** Out of SEO scope; revisit under "PWA polish".
- **Rich product reviews schema (`aggregateRating`).** Blocked on having ≥1 review per product. Reviews are a separate workstream (`docs/app-decisions.md` should track app choice).
- **Multi-domain ccTLD strategy** (`gberg-heizung.nl`, etc.). One domain per the current setup; Markets handles country variants.
- **AI-crawler hard-block.** Not unless commercial reason emerges.
- **Image alt-text strategy.** Owned by the image-pipeline-curator workstream — we only verify alt exists; we don't author it here.
- **DE-entity-only "imprint" lawfulness review.** Owned by `docs/legal-checklist.md` workstream.
- **Product reviews ingestion / migration from xxl-heizung.de.** Out of catalog-sync scope.
- **PageSpeed budget enforcement at build time** (e.g. `size-limit`, Lighthouse CI budgets in PR checks). Sensible follow-up but not part of this plan; falls under build/CI workstream.

---

## Recommended order of operations (high-impact first)

1. Phase 0.1 + 0.3 (baseline measurement) — half day.
2. Phase 1.2 (`<html lang>` fix) + 1.5 (sitemap locale list) + 1.6 (robots Sitemap line) — half day; immediate Google indexing health gain.
3. Phase 1.1 (canonical + hreflang) — one day; the single biggest unlock for non-English markets.
4. Phase 1.10 (description fallbacks) + 1.3/1.4 (OG/Twitter + default image) — one day; social previews + SERP CTR.
5. Phase 1.7 (LCP `fetchpriority`) + 1.8 (skip-to-content) — half day; Lighthouse score guard.
6. Phase 2.1 (`Organization` + `WebSite`) + 2.2 (`BreadcrumbList`) — one day; foundation for all other JSON-LD.
7. Phase 2.3 (`Product` JSON-LD) + 2.8 (parity tests) — two days; the rich-result jackpot for a commerce site.
8. Phase 2.4 (`FAQPage`) + 2.5 (`ItemList`) — one day.
9. Phase 3.1 (AI policy decision) → 3.2 (robots AI rules) → 3.3 (`/llms.txt`) — one day end-to-end.
10. Phase 3.6 (PDP "Who is this for" / Compatibility) + 3.4 (AI summary metaobject) + 3.7 (homepage FAQ → metaobject) — two days.
11. Phase 4 in parallel with 3 once 1+2 are stable — half-day setup + ongoing.
12. Phase 1.9 (410 strategy) — half day; only valuable once catalog churn produces removed handles.

Total ballpark from kickoff to Phase 4 green: **~10 working days** spread across ~3 calendar weeks (sequential per phase, parallel within a phase where files don't collide).

---

## File index — everything this plan will eventually touch

(For future implementation reference; no edits yet.)

- `app/root.tsx`
- `app/routes/[robots.txt].tsx`
- `app/routes/[llms.txt].tsx` *(new)*
- `app/routes/($locale)._index.tsx`
- `app/routes/($locale).tsx`
- `app/routes/($locale).products.$handle.tsx`
- `app/routes/($locale).collections.$handle.tsx`
- `app/routes/($locale).collections._index.tsx`
- `app/routes/($locale).collections.all.tsx`
- `app/routes/($locale).pages.$handle.tsx`
- `app/routes/($locale).policies.$handle.tsx`
- `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx`
- `app/routes/($locale).blogs.$blogHandle._index.tsx`
- `app/routes/($locale).blogs._index.tsx`
- `app/routes/($locale).search.tsx`
- `app/routes/($locale).cart.tsx`
- `app/routes/($locale).[sitemap.xml].tsx`
- `app/routes/($locale).sitemap.$type.$page[.xml].tsx`
- `app/components/gberg/pdp/ai-block.tsx`
- `app/components/gberg/pdp/quick-facts.tsx`
- `app/components/gberg/pdp/sections-accordion.tsx`
- `app/components/gberg/pdp/gallery.tsx`
- `app/components/gberg/pdp/who-its-for.tsx` *(new)*
- `app/components/gberg/pdp/compatibility.tsx` *(new)*
- `app/lib/gberg/i18n.ts`
- `app/lib/gberg/queries.ts`
- `app/lib/gberg/heating-derived.ts`
- `app/lib/gberg/seo.ts` *(new)*
- `app/lib/gberg/jsonld.ts` *(new)*
- `app/lib/gberg/llms-content.ts` *(new)*
- `app/lib/gberg/__tests__/jsonld-parity.test.ts` *(new)*
- `public/og/default.jpg` *(new asset)*
- `docs/seo-baselines/*` *(new)*
- `docs/app-decisions.md` *(append AI-crawler decision row)*

---

*Plan author: SEO / AI-Readiness Auditor. Reviewed against `docs/metafields.md`, `docs/legal-checklist.md`, project `CLAUDE.md`, and the live route tree under `apps/store-heating-hydrogen/app/`.*
