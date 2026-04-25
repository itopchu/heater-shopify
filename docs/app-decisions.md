# App / Tooling Decisions

Track every decision to use (or skip) a third-party app. Required by principle #4: native-first, free-first.

Template for each entry:

```
## <App name>

**Decision:** USE (free tier) | USE (paid) | SKIP
**Date:** YYYY-MM-DD
**Replaces native feature:** <none | specific Shopify feature>
**Reason:** <why native didn't fit, or why native is preferred>
**Revisit when:** <trigger condition>
```

---

## Shopify Translate & Adapt — USE (free)

**Decision:** USE (free native)
**Date:** 2026-04-22
**Replaces:** n/a (native)
**Reason:** Bilingual DE/EN is required. Translate & Adapt handles sections, products, collections, pages, metaobjects without a paid app.

## Shopify Search & Discovery — USE (free)

**Decision:** USE (free native)
**Date:** 2026-04-22
**Replaces:** Boost Search & Filter, Fast Simon, Searchanise
**Reason:** Catalog size at launch (20–40 SKUs) is well within Search & Discovery's capabilities for filters on metafields (Breite, Höhe, Wattage, Farbe, Anschluss).
**Revisit when:** SKU count > 1000 or user reports search quality issues.

## Shopify Customer Privacy API / Privacy & Compliance — USE (free)

**Decision:** USE (free native)
**Date:** 2026-04-22
**Replaces:** Cookiebot, Usercentrics paid
**Reason:** Native DSGVO consent banner gates analytics pre-consent — sufficient for pure B2C storefront.
**Revisit when:** TCF 2.2 framework becomes required (e.g., running Meta Ads campaigns demanding IAB framework).

## Matrixify — SKIP

**Decision:** SKIP
**Date:** 2026-04-22
**Replaces:** n/a
**Reason:** MVP catalog is 20–40 SKUs — native CSV import fits within 15 MB limit. No bulk metafield mutation volume that justifies Matrixify.
**Revisit when:** SKU count exceeds 500 or we need Excel round-trip editing of metafields.

## Trusted Shops Rechtstexter — SKIP

**Decision:** SKIP
**Date:** 2026-04-22
**Replaces:** n/a
**Reason:** Legal text will be user-supplied (lawyer draft or eRecht24/IT-Recht Kanzlei starter) and maintained as normal Shopify Pages. Paid auto-update is not worth €30–100/year at this scale.
**Revisit when:** BGB/DSGVO major updates cause maintenance pain, or user explicitly wants hands-off legal text sync.

## Judge.me — TENTATIVE USE (free tier)

**Decision:** TENTATIVE USE (free tier)
**Date:** 2026-04-23
**Replaces:** Shopify Product Reviews (legacy / EOL), custom review collection
**Reason:** PDP requires a review UI (rating + count + recent reviews) matching xxl-heizung's anatomy. Shopify's first-party Product Reviews app is retired. Judge.me's free tier covers unlimited products, email requests, rich snippets — which Shopify-native does not replicate without custom build. Custom `product_review` metaobject is possible but would reinvent the review-collection-and-moderation UX.
**Revisit when:** User decides they want to own the review pipeline fully (custom metaobject path) or wants a paid Shopify-certified alternative (Stamped, Loox).

## Google Gemini (Nano Banana Pro) — USE (pay-per-image)

**Decision:** USE (pay-per-image via `@google/genai` SDK)
**Date:** 2026-04-23
**Replaces:** Manual product photography, local Stable Diffusion pipeline, OpenAI gpt-image-1
**Reason:** Catalog-sync pipeline regenerates product imagery because xxl-heizung source photos must never land in our Shopify Files. Gemini's image models accept a source image as `inlineData` plus a text prompt and return a newly generated image — perfect for pose/shape-preserving re-renders in our lifestyle context. User preference (2026-04-23): Google/Anthropic over OpenAI for external AI dependencies. Default model is `gemini-2.5-flash-image` (Nano Banana — fast, cheap, strong quality); swap to `gemini-3-pro-image-preview` (Nano Banana Pro, highest fidelity) via `GEMINI_IMAGE_MODEL` env var for premium runs. Cost envelope: ~$0.04 × 300 products × 3 images ≈ $36 one-time on Nano Banana, or ~$135 on Pro. Incremental near-zero (manifest cache keyed on source URL).
**Revisit when:** Image quality regressions across runs, cost climbs unexpectedly (IMAGE_GEN_CAP + image-budget guard gate this), or Google launches a next-gen model that replaces Nano Banana.

## Reviews — Judge.me free tier (Sprint 5.4)

**Decision:** USE Judge.me free tier (zero monthly cost, unlimited reviews, 50 review-request emails/month).
**Date:** 2026-04-25
**Replaces:** Custom `product_review` metaobject + Shopify Forms review-collection flow.
**Reason:** ~30 minutes to ship vs. ~4–6 hours for a custom build; Judge.me auto-emits `aggregateRating` JSON-LD compatible with Google rich results, which is the trust-signal payoff. Data is exportable if we outgrow the free tier. Aligns with project principle #4 (Shopify-native / free-first).
**Trade-off accepted:** Judge.me-hosted data + branded "Powered by Judge.me" footer text on the widget. Acceptable for a launch; can swap to Yotpo or a custom metaobject later without losing reviews (Judge.me exports CSV).
**Theme integration:** Judge.me injects itself via Theme App Extensions — no theme code change needed. Our [theme/snippets/structured-data.liquid](../theme/snippets/structured-data.liquid) Product block reads `product.metafields.reviews.rating` and emits `aggregateRating` once Judge.me posts it (gated on review_count > 0, per Google's zero-review policy).
**Revisit when:** Free-tier limits hit (unlikely at launch volume), or we want native Shopify ownership of review data for compliance reasons.

## GitHub Actions (catalog sync) — USE (free)

**Decision:** USE (free)
**Date:** 2026-04-23
**Replaces:** n8n Cloud, self-hosted cron, Shopify Flow
**Reason:** Sync pipeline must run external to the user's machine. GitHub Actions is free for this repo's usage pattern (weekly + manual runs), exposes a "Run workflow" button with typed inputs (dry-run, limit, collection filter), uploads reports as artifacts, and stores all history in-repo. No separate host, no separate billing. Shopify Flow cannot scrape external sites; n8n would add a second runtime without clear benefit given the sync logic already lives in TypeScript.
**Revisit when:** Sync needs real-time triggers (webhooks from xxl-heizung — unavailable) or concurrency/state beyond one-run-at-a-time.
