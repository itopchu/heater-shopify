# Phase 0.x — Current Structured Data Inventory

> Every JSON-LD block currently emitted by the Hydrogen storefront. Includes `app/root.tsx`, every route loader, and every component render.

---

## Inventory

| Schema type | Where | Status |
|---|---|---|
| `Organization` | — | **Not emitted anywhere** |
| `WebSite` (with `SearchAction`) | — | **Not emitted anywhere** |
| `BreadcrumbList` | — | **Not emitted anywhere** (visible breadcrumb exists at PDP `($locale).products.$handle.tsx:132`, but no JSON-LD mirror) |
| `Product` | — | **Not emitted anywhere** |
| `FAQPage` | — | **Not emitted anywhere** (visible FAQ accordion exists at PDP and homepage, but no JSON-LD mirror) |
| `ItemList` | — | **Not emitted anywhere** (PLP / shop-all / collections-index all eligible) |
| `Article` | — | **Not emitted anywhere** (article route exists but emits no `Article` schema) |
| `Person` (article author) | — | **Not emitted anywhere** |
| `LocalBusiness` | — | **Not emitted anywhere** (gated on `/pages/contact` decision per plan §2.7) |
| `OfferCatalog`, `Brand`, `aggregateRating`, etc. | — | **Not emitted anywhere** |

---

## Verification method

```
grep -rn "application/ld+json" apps/store-heating-hydrogen/app/
# → 0 matches

grep -rn "jsonLd\|jsonld\|JsonLd" apps/store-heating-hydrogen/app/
# → 0 matches

grep -rn "@type.*Product\|@type.*Organization\|@type.*FAQPage" apps/store-heating-hydrogen/app/
# → 0 matches
```

All three return zero hits as of Phase 0 audit (2026-04-30).

---

## Implication

Every Phase 2 task (`§2.1` through `§2.8`) is greenfield. There is no existing schema to migrate, regress against, or worry about colliding with. The only constraint is **strict parity with visible content** per `docs/seo-ai-readiness-plan.md` Phase 2 preamble.

The new `app/lib/gberg/jsonld.ts` helper file (per plan §2.1) will be the single source of all schema generation. No JSON-LD should live inline inside route files — only the `<script type="application/ld+json">` injection point.

---

## Visible content already in place that JSON-LD will mirror

This is the "match what's already rendered" inventory — Phase 2 must NOT add new schema fields that don't have a visible counterpart.

| Visible block | Source | JSON-LD destination |
|---|---|---|
| PDP breadcrumb | `($locale).products.$handle.tsx:132` via `<Breadcrumb>` | `BreadcrumbList` |
| PDP `<h1>` product title | `($locale).products.$handle.tsx:155-157` | `Product.name` |
| PDP description short string | `($locale).products.$handle.tsx:DescriptionSection()` | `Product.description` |
| PDP gallery images | `<Gallery>` from `galleryImages(product)` | `Product.image[]` |
| PDP price + currency | `<BuyBox>` SSR'd from `priceRange` | `Product.offers.price`, `priceCurrency` |
| PDP variant SKU | `initialVariant.sku` | `Product.sku` |
| PDP `mpn` / `gtin13` (metafields) | `product.common.custom?.mpn` etc. | `Product.mpn`, `Product.gtin13` |
| PDP brand label | Eyebrow / metafield resolved by `resolveSeriesLabel(product)` | `Product.brand` |
| PDP spec rows | `<SpecsTable>` from `buildSpecRows(product)` | `Product.additionalProperty[]` |
| PDP FAQ items | `<FaqAccordion>` from `buildFaqsFromSections(sections)` | `FAQPage.mainEntity[]` |
| PDP "Quick Facts" icon table | `<QuickFacts>` from `key_facts` metafield | Mirrors into `Product.additionalProperty[]` (deduped against SpecsTable) |
| PDP "AI block" entity summary | `<AiBlock>` | `Product.description` (long-form variant) — NOTE: only one `description` field on `Product`, pick highest-quality source |
| PLP collection title | `($locale).collections.$handle.tsx:78-83` | `CollectionPage.name` (or feed into `ItemList.name`) |
| PLP product list | `<CollectionView>` | `ItemList.itemListElement[]` |
| Article title / image / dates | `($locale).blogs.$blogHandle.$articleHandle.tsx:97-117` | `Article.headline`, `image`, `datePublished`, `dateModified` |
| Site search at `/search?q=` | `($locale).search.tsx` | `WebSite.potentialAction.SearchAction` |

---

## Items NOT in the inventory yet (Phase 3 content gaps)

Per plan §3.6 these are missing visible blocks that will need to be added FIRST before any schema can mirror them:

- "Who is this for?" paragraph (room_type + room_coverage_m2 metafields) — new component `who-its-for.tsx`.
- "Compatibility" section (radiator_compatibility_guide metaobject) — new component `compatibility.tsx`.
- "Delivery and returns" — currently a hard-coded aside at `($locale).products.$handle.tsx:233-237`; needs to read from a `support_block` metaobject.
- Canonical "Dimensions" string (`dimensions_w_h_d_mm` metafield) — currently only individual W/H/D rows, no single concatenated string.

These are content debt, not schema debt — but the schema can't reference fields that aren't visible.
