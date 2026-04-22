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
