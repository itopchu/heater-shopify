# Next to-do — sequenced

Last updated: 2026-05-01.

Tracks everything between "i18n wiring sprint in progress" and "ready for marketing push." Bucketed by urgency, not chronology — so we can pick the right work in any spare cycle.

## A — In flight right now (~30 min from now)

| | |
|---|---|
| Subagent D (search components) | search-overlay, search-input, SearchForm, SearchResults, SearchResultsPredictive |
| Subagent E (Hydrogen scaffold) | Header.tsx, PageLayout.tsx, ProductForm.tsx, PaginatedResourceSection.tsx |

Will land 2 commits with another ~80–100 strings wired. After this, ~80% of customer-visible UI is localized.

## B — Immediately after the current sprint (main thread, ~30 min)

### B1. Route `meta()` exports + remaining page bodies

The route files mostly had their `meta()` exports done in SEO Phase 1, but a few still hold hard-coded English literals:
- `app/routes/($locale)._index.tsx` — homepage hero copy + utility-strip references (already partially wired via UtilityBar; sweep for any missed)
- `app/routes/($locale).blogs._index.tsx` — newsletter promise + page heading
- `app/routes/($locale).blogs.$blogHandle._index.tsx` — listing layout
- `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx` — article frame
- `app/routes/($locale).policies.$handle.tsx` — policy page chrome
- `app/routes/($locale).policies._index.tsx` — policies index
- `app/routes/($locale).pages.$handle.tsx` — generic page wrapper
- `app/routes/($locale).products.$handle.tsx` — PDP body chrome (around the gberg components)
- `app/routes/($locale).cart.tsx` — cart page wrapper

**Pattern:** loaders/meta() use `tFor(locale)` (server-safe, pulls locale from `params.locale`). Component bodies use `useT()`. Both already wired in earlier passes.

### B2. Final typecheck + build sanity

After all wiring lands: `pnpm typecheck` + `pnpm --filter store-heating-hydrogen build:cf` and confirm the 54-error baseline is unchanged.

## C — Product content translation (separate domain, ~30–60 min agent run)

**Goal:** translate every customer-visible product/page/metaobject string in Shopify so Storefront API queries with `@inContext(language: DE)` actually return German content (not just English fallback).

**Mechanics** (already documented in earlier dispatched-but-ratelimited agent prompt):
1. Promote EN to source for each Product (currently the `title` field holds German). Strategy A: translate German → English, set as `product.title`, register German as a translation alongside.
2. For each of 7 locales, register translations for: `Product.{title, descriptionHtml}`, `Collection.{title, descriptionHtml}`, `Page.{title, body}`, metaobject text fields (faq_item, faq_group, buying_guide, support_block, ai_summary_block), shop policies (refund/privacy/terms/shipping/contact).
3. Use `translationsRegister` Admin GraphQL mutation. Always re-fetch `translatableContentDigest` immediately before registering — Shopify rejects stale digests.
4. Cache `(digest, source, locale) → translated` triple at `.translation-cache/prod.json` for idempotent re-runs.

**Tooling:** Gemini via existing `GOOGLE_API_KEY` in `.env.local`. Cap at 2000 calls per run. Build a single prod-targeted runner `agent/scripts/prod-translate-content.mjs` if not already done.

**Skips:** product handles (URL slugs stay canonical), spec metafields (raw_source JSON, width_mm, etc.), SKUs.

## D — QA pass (per [docs/qa-checklist-post-i18n.md](qa-checklist-post-i18n.md))

`pnpm qa:full` runs both:
- **Unlighthouse** — full-site sitemap-driven Lighthouse crawl, sortable HTML dashboard at `.unlighthouse-reports/`
- **Pa11y CI** — WCAG2AA via axe + HTMLCS across 22 representative URLs

Plus manual functional / visual / content / network passes from the checklist. Output to `docs/qa-results-YYYY-MM-DD.md` with P0/P1/P2 severity tags.

Triage and fix what's findable. Re-run.

## E — SEO Phase 2 (JSON-LD)

Adds structured data so Google can build rich SERP results (product cards with price + stock + ratings, breadcrumbs, FAQ accordions, etc.).

- New `app/lib/gberg/jsonld.ts` with builders: `Organization`, `WebSite` + `SearchAction`, `BreadcrumbList`, `Product` (+ `Offer`, `additionalProperty` from metafields), `FAQPage`, `ItemList`, `Article`.
- **Strict visible-content parity rule:** every claim in JSON-LD must be visible on the rendered page. Vitest test `app/lib/gberg/__tests__/jsonld-parity.test.ts` enforces this — JSON-LD can never silently lie.
- Wire builders into `meta()` exports across all routes.
- Defer `aggregateRating` until real reviews exist.
- Defer `LocalBusiness` until G-Berg has finalized in-store hours / address consistency.

Acceptance: Google Rich Results Test passes for 1 PDP, 1 PLP, 1 article, the homepage.

## F — SEO Phase 3 (AI crawler readiness)

Specific to AI-bot traffic — separate from generic SEO.

- `robots.txt` per-bot policy: explicit Allow/Block for GPTBot, Google-Extended, ClaudeBot, PerplexityBot, Applebot-Extended, CCBot, anthropic-ai, ChatGPT-User. Recommend Allow on all (we want our content in AI training/retrieval — radiator info is timeless and the more it gets cited, the better).
- `/llms.txt` route — Anthropic-proposed convention. Lists canonical content URLs in a clean machine-friendly index.
- `ai_summary_block` metaobject — wire its content into PDP rendering as a clean factual block AI crawlers can ingest unambiguously. One per product, plain prose (no marketing fluff), 50–80 words.
- New PDP components: "Who is this for?" (metafield-driven from `room_type` + `room_coverage_m2`) and "Compatibility" (from `radiator_compatibility_guide` metaobject).
- Anti-AI-confounding hygiene: no JS-only price rendering, no cookie banner that blocks crawl, no infinite scroll hiding products.

Acceptance: visiting `/llms.txt` returns a clean URL index. Curl with each AI bot user-agent succeeds and gets unambiguous facts (not a rendered SPA shell).

## G — SEO Phase 4 (monitoring)

- **GSC verification** via DNS TXT record at Namecheap (or `<meta name="google-site-verification">` in root.tsx — pick DNS for permanence).
- **Bing Webmaster Tools** verification (same flow).
- **Submit each locale sitemap** to GSC — 8 sitemap URLs + 1 root sitemap index.
- **GA4** via Shopify Customer Events (preferred over manual gtag — captures cart/checkout funnel automatically). Or **Plausible** if we want zero cookies.
- **Lighthouse CI** — point existing `.github/workflows/lighthouse.yml` at the prod URL. Set per-URL thresholds matching `qa/unlighthouse.config.ts`. Fail PRs that regress.
- **RUM** via the existing `Analytics.Provider` in root.tsx — pipe Web Vitals to Plausible/Cloudflare Web Analytics.
- **Schema regression test** in CI — re-run the JSON-LD parity vitest on every PR so we can't ship a parity break.
- **Looker Studio dashboard** combining GSC clicks + GA4 conversions + RUM CWV.

## H — Pre-marketing operational hardening

- [ ] Set up Shopify Payments + Klarna + PayPal (KYC, user-only)
- [ ] Verify VAT rates per market in Shopify Admin (DE/NL/BE/LU/AT/FR/ES/IT/PL/DK)
- [ ] Customize transactional emails — sender name "G-Berg Heizung", logo, brand red — Settings → Notifications
- [ ] Rotate `gberg-agent` client secret (Dev Dashboard → gberg-agent → Settings → Credentials → Rotate). The old secret was pasted in chat earlier.
- [ ] Change the `online@g-berg-gmbh.de` Shopify password (same exposure reason)
- [ ] Set billing company name to "G-Berg GmbH" in Settings → General → Billing address
- [ ] Uptime monitoring — UptimeRobot or Better Uptime free tier on home + 3 PDPs + cart
- [ ] Backup verification — Shopify auto-backups everything; spot-check one product restore path works

## I — Optional / future enhancements

| Item | Effort | Value |
|---|---|---|
| Real search index (Algolia / Shopify Search & Discovery) — replace the in-memory PLP filter | M | Medium (only matters when catalog grows past 100+ products) |
| Geo-IP country detection via `cf-ipcountry` header — Belgian visitor on `/en/` gets BE VAT not DE VAT | S | High once we expand BE marketing |
| Customer accounts UI fully wired (orders / returns / addresses) | M | Medium — current scaffold works, full UI is polish |
| Email marketing — wire newsletter form to Shopify Email or Klaviyo, capture into a list | S | High once we have content to send |
| Product reviews / ratings — Loox, Stamped, or Shopify-native Reviews | M | Critical eventually but not Day 1 |
| Google Merchant Center / Shopping feed | S | High once paid acquisition starts |
| Meta Pixel / TikTok Pixel | S | Same |
| WhatsApp Business API beyond the bubble (auto-replies, catalog) | M | Wait for traffic to justify |
| AddToCart Phase 2 — properly wire the buy-box quantity stepper if it has its own state separate from the AddToCart component | S | Already works; this is polish |

## Re-evaluation triggers

If the user says any of:
- "What's left?" / "Where are we?" / "Status?" — reply with sections A–C if pre-QA, A–D if QA done, A–G if pre-marketing, A–H if pre-launch.
- "Why is X slow?" — point at SEO Phase 4 monitoring (GSC / RUM) for the data.
- "Customers can't find German content" — that's still C (product content translation) if not yet run.
- "Looking flat in Google" — that's E (JSON-LD) + F (AI readiness) + G (monitoring to measure).

## Dependencies

```
A (in flight)  →  B (route meta)  →  D (QA pass) ────────────────┐
                                                                  ↓
        ┌─→  E (JSON-LD)  ─┬──┐                            triage + fix
        │                  │  └──→  G (monitoring)  ─→  steady-state ops
   C (product translation) │  │
        │                  └──┘
        │
        └─→  F (AI readiness) — independent of E, can parallel
```

C is independent of all SEO phases — can run any time. E + F are independent of each other. G depends on both being done first because the Looker dashboard pulls from each.
