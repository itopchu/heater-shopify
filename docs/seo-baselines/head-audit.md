# Phase 0.3 — Head / Meta Audit (current state)

> Read-only audit of every `<meta>`, `<link rel="canonical">`, `<link rel="alternate">`, `<title>`, OG tag, and JSON-LD currently emitted by the Hydrogen storefront. Per-route grouping. Gaps noted inline against `docs/seo-ai-readiness-plan.md`.

**Blocker:** Lighthouse / live-crawl baselines (Phase 0.1, 0.2) deferred — storefront is currently behind an Oxygen access gate. Re-run once the gate is lifted; expected fail list pre-Phase-1: missing canonical, missing hreflang, no OG/Twitter, no JSON-LD.

---

## `app/root.tsx` — global head

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<html lang>` | Yes — hard-coded `"en"` | `app/root.tsx:146` | **BUG** — never reflects route locale. Same value for `/de`, `/nl`, `/fr`, etc. |
| `<html data-brand>` | Yes — `"heating"` | `app/root.tsx:146` | Fine. |
| `<meta charSet="utf-8">` | Yes | `app/root.tsx:148` | Fine. |
| `<meta name="viewport">` | Yes | `app/root.tsx:149` | Fine. |
| `<link rel="stylesheet" href={tailwindCss}>` | Yes | `app/root.tsx:150` | Fine. |
| `<Meta />` | Yes | `app/root.tsx:151` | React Router meta-export aggregator. |
| `<Links />` | Yes | `app/root.tsx:152` | React Router links-export aggregator. |
| `<link rel="preconnect" href="https://cdn.shopify.com">` | Yes | `app/root.tsx:46` | Fine. |
| `<link rel="preconnect" href="https://fonts.googleapis.com">` | Yes | `app/root.tsx:47` | Fine. |
| `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">` | Yes | `app/root.tsx:48` | Fine. |
| `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">` | Yes | `app/root.tsx:49-52` | Fonts: Inter + Fraunces. |
| `<link rel="icon" type="image/svg+xml" href={favicon}>` | Yes | `app/root.tsx:53` | Fine. |
| `<title>` | No | — | No root-level fallback title. Each route owns its own; if a route returns no `meta()`, the `<head>` is title-less. |
| `<meta name="description">` | No | — | Same — per-route. |
| `<link rel="canonical">` | **No** | — | **GAP** plan §1.1 |
| `<link rel="alternate" hreflang="…">` × 8 | **No** | — | **GAP** plan §1.1 |
| `<link rel="alternate" hreflang="x-default">` | **No** | — | **GAP** plan §1.1 |
| `<meta property="og:*">` | **No** | — | **GAP** plan §1.3 |
| `<meta name="twitter:*">` | **No** | — | **GAP** plan §1.3 |
| `<meta name="theme-color">` | **No** | — | Minor; nice-to-have. |
| JSON-LD `Organization` | **No** | — | **GAP** plan §2.1 |
| JSON-LD `WebSite` (with `SearchAction`) | **No** | — | **GAP** plan §2.1 |
| Skip-to-content link | **No** | — | **GAP** plan §1.8. Nothing matches `/skip|Skip/i` in `root.tsx`. |
| `fetchpriority="high"` on hero `<img>` | **No** | — | **GAP** plan §1.7 |

---

## `($locale)._index.tsx` — homepage

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `"G-Berg Heizung — Premium European radiators"` | `app/routes/($locale)._index.tsx:21` | Hard-coded EN string. Not localized through Translate & Adapt. |
| `<meta name="description">` | Yes — 168 chars | `app/routes/($locale)._index.tsx:22-26` | At length cap (>160). Trim or accept. |
| `<link rel="canonical">` | **No** | — | **GAP** |
| `<link rel="alternate" hreflang="…">` | **No** | — | **GAP** |
| OG / Twitter tags | **No** | — | **GAP** |
| JSON-LD | **No** | — | **GAP** (`Organization` + `WebSite` would live in `root.tsx`; homepage itself needs nothing extra). |
| Hero `Image` priority hint | **No** | `app/routes/($locale)._index.tsx:174-181` | No `loading="eager"`, no `fetchpriority` on the homepage hero `<Image>`. **GAP** plan §1.7. |
| `HOMEPAGE_FAQS` source | TSX literal | `app/routes/($locale)._index.tsx:65-83` | **GAP** plan §3.7 — violates merchant-editable rule, blocks `FAQPage` JSON-LD wiring later. |

---

## `($locale).products.$handle.tsx` — PDP

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — falls back through `seo.override_title → product.seo.title → product.title → "Product"` | `app/routes/($locale).products.$handle.tsx:51-54` | Final fallback `"Product"` is bad UX/SEO. |
| `<meta name="description">` | Yes — chains to `''` | `app/routes/($locale).products.$handle.tsx:55-63` | **GAP** plan §1.10 — empty-string final fallback. Synthesize from `key_facts`. |
| `<link rel="canonical">` | **No** | — | **GAP** |
| `<link rel="alternate" hreflang="…">` | **No** | — | **GAP** |
| OG / Twitter tags | **No** | — | **GAP** plan §1.3 — should include `og:type=product`, `og:image=product.featuredImage`. |
| JSON-LD `Product` | **No** | — | **GAP** plan §2.3 |
| JSON-LD `BreadcrumbList` | **No** | — | **GAP** plan §2.2 (visible breadcrumb already at line 132). |
| JSON-LD `FAQPage` | **No** | — | **GAP** plan §2.4 (FAQ already SSR via `<details>`). |
| First gallery image priority hint | **No** | `app/components/gberg/pdp/gallery.tsx` (no `fetchpriority` / `loading` on `<Image>`) | **GAP** plan §1.7 |

---

## `($locale).collections.$handle.tsx` — PLP

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `col.seo?.title ?? col.title` (else `data.handle ?? 'Collection'`) | `app/routes/($locale).collections.$handle.tsx:27-32` | OK; final fallback `'Collection'` should be locale-aware. |
| `<meta name="description">` | Yes — `col.seo?.description ?? col.description ?? ''` | `app/routes/($locale).collections.$handle.tsx:31` | **GAP** — empty-string final fallback. Plan §1.10 covers PLP. |
| `<link rel="canonical">` | **No** | — | **GAP** |
| `<link rel="alternate" hreflang="…">` | **No** | — | **GAP** |
| OG / Twitter tags | **No** | — | **GAP** |
| JSON-LD `BreadcrumbList` | **No** | — | **GAP** plan §2.2 |
| JSON-LD `ItemList` | **No** | — | **GAP** plan §2.5 |

---

## `($locale).collections._index.tsx` — collections index

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | **No `meta()` export** | `app/routes/($locale).collections._index.tsx` | **GAP** — page renders `<h1>Collections</h1>` only, no `meta()`. Falls back to whatever the parent supplies — currently nothing. |
| `<meta name="description">` | **No** | — | **GAP** |
| Canonical / hreflang / OG / JSON-LD | **No** | — | **GAP** |
| Branding | **None** | `app/routes/($locale).collections._index.tsx:43-74` | Skeleton-leftover render: `<h1>Collections</h1>`, no Eyebrow, no description. PLP-index page is a leaky-skeleton page. |

---

## `($locale).collections.all.tsx` — redirect-only

| Tag | Notes |
|---|---|
| 301 redirect to `/products` | Fine, no `<head>` to audit. |

---

## `($locale).products._index.tsx` — shop-all

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `"Shop all radiators"` | `app/routes/($locale).products._index.tsx:13` | Hard-coded EN. |
| `<meta name="description">` | Yes — 100 chars | `app/routes/($locale).products._index.tsx:14-18` | OK length. |
| Canonical / hreflang / OG / JSON-LD | **No** | — | **GAP** |
| `ItemList` JSON-LD | **No** | — | **GAP** plan §2.5 should also cover shop-all. |

---

## `($locale).pages.$handle.tsx` — Shopify Pages + fallbacks

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `page.seo?.title ?? page.title` (else `'Page'`) | `app/routes/($locale).pages.$handle.tsx:30-33` | OK. |
| `<meta name="description">` | Yes — `page.seo?.description ?? page.intro ?? ''` | `app/routes/($locale).pages.$handle.tsx:33` | Empty-string final fallback. |
| Canonical / hreflang / OG / JSON-LD | **No** | — | **GAP** |
| `LocalBusiness` JSON-LD on `/pages/contact` | **No** | — | **GAP** plan §2.7 (gated). |

---

## `($locale).policies.$handle.tsx` — legal pages

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — **literal `"Hydrogen | …"`** | `app/routes/($locale).policies.$handle.tsx:10` | **BUG** — skeleton-leftover prefix. Brands site as "Hydrogen" in SERP for `/policies/privacy-policy` etc. Replace with `"G-Berg | …"` or just the policy title. |
| Canonical / hreflang / OG | **No** | — | **GAP** |
| Render | Skeleton-leftover | `app/routes/($locale).policies.$handle.tsx:51-65` | `<div className="policy">` with no Eyebrow, no display heading; another leaky-skeleton page. |

---

## `($locale).policies._index.tsx` — policies index

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | **No `meta()` export** | — | **GAP** — also disallowed by `robots.txt` (`Disallow: /policies/`), so noindex implied — but missing `<title>` still hurts. |

---

## `($locale).blogs._index.tsx` — news index

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `"News"` | `app/routes/($locale).blogs._index.tsx:18` | Bare-word title; no brand suffix. |
| `<meta name="description">` | Yes — 102 chars | `app/routes/($locale).blogs._index.tsx:19-23` | OK. |
| Canonical / hreflang / OG / JSON-LD | **No** | — | **GAP** |

---

## `($locale).blogs.$blogHandle._index.tsx` — blog landing

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `` `Hydrogen | ${blog.title} blog` `` | `app/routes/($locale).blogs.$blogHandle._index.tsx:7` | **BUG** — skeleton-leftover `Hydrogen |` brand. |
| `<meta name="description">` | **No** | — | **GAP** — `meta()` only sets title. |
| Canonical / hreflang / OG / JSON-LD | **No** | — | **GAP** |

---

## `($locale).blogs.$blogHandle.$articleHandle.tsx` — article

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `` `Hydrogen | ${article.title} article` `` | `app/routes/($locale).blogs.$blogHandle.$articleHandle.tsx:6` | **BUG** — skeleton-leftover `Hydrogen | … article` suffix. SERP-poison. |
| `<meta name="description">` | **No** | — | **GAP** (article has `seo.description` in the query but `meta()` doesn't read it). |
| Canonical / hreflang / OG / JSON-LD | **No** | — | **GAP** plan §2.6 (`Article` JSON-LD). |

---

## `($locale).search.tsx` — search results

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — context-aware | `app/routes/($locale).search.tsx:12-17` | Good. |
| `<meta name="description">` | Yes — context-aware | `app/routes/($locale).search.tsx:18-23` | Good. |
| `<meta name="robots" content="noindex,follow">` | Yes | `app/routes/($locale).search.tsx:24` | Good — already correct per plan §1.1. |
| Canonical / hreflang | **No** | — | OK to omit (noindex). |

---

## `($locale).cart.tsx` — cart

| Tag | Emitted? | Source / line | Notes |
|---|---|---|---|
| `<title>` | Yes — `` `Hydrogen | Cart` `` | `app/routes/($locale).cart.tsx:7` | **BUG** — skeleton-leftover `Hydrogen |` prefix. |
| `<meta name="robots" content="noindex">` | **No** | — | **GAP** — already disallowed in `robots.txt` but plan §1.1 wants belt+braces. |

---

## `($locale).$.tsx` — 404 catch-all

| Tag | Emitted? | Notes |
|---|---|---|
| `<title>` | None | Throws a `404 Response`; rendering handed to `ErrorBoundary` in `root.tsx`. ErrorBoundary doesn't emit a `meta()` either, so 404 page gets no `<title>`. |

---

## Summary — gaps to fix in Phase 1

1. Hard-coded `<html lang="en">` (`root.tsx:146`).
2. No canonical or hreflang on any route.
3. No OG / Twitter tags on any route.
4. Skeleton-leftover `Hydrogen |` titles on policies, blogs blog-landing, articles, cart.
5. Empty-string description fallbacks on PDP, PLP, page.
6. `collections._index.tsx` and `policies._index.tsx` have no `meta()` at all.
7. No skip-to-content link.
8. No `fetchpriority="high"` / `loading="eager"` on homepage hero or PDP gallery first image.
9. Zero JSON-LD anywhere (`grep "application/ld+json"` returns 0 hits in `app/`).
10. Homepage FAQ literal blocks `FAQPage` JSON-LD wiring (plan §3.7).
