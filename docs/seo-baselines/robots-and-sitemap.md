# Phase 0.x — robots.txt + sitemap.xml Current State

> What the storefront emits today, with file:line references. Gaps mapped to plan sections.

---

## `/robots.txt` — current output

**File:** `apps/store-heating-hydrogen/app/routes/[robots.txt].tsx`

**Cache:** `max-age=86400` (24h) — `[robots.txt].tsx:11`.

**Body emitted (verbatim, with substitution):**

```
User-agent: *
Disallow: /cart
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: /*/collections/*filter*&*filter*
Disallow: /blogs/*+*
Disallow: /blogs/*%2B*
Disallow: /blogs/*%2b*
Disallow: /*/blogs/*+*
Disallow: /*/blogs/*%2B*
Disallow: /*/blogs/*%2b*
Disallow: /policies/
Disallow: /search
Allow: /search/
Disallow: /search/?*
Sitemap: https://www.gberg-heizung.de/sitemap.xml

# Google adsbot ignores robots.txt unless specifically named!
User-agent: adsbot-google
Disallow: /cart
Disallow: /account
Disallow: /search
Allow: /search/
Disallow: /search/?*

User-agent: Nutch
Disallow: /

User-agent: AhrefsBot
Crawl-delay: 10
Disallow: /cart
Disallow: /account
... (full disallow block repeated)
Sitemap: https://www.gberg-heizung.de/sitemap.xml

User-agent: AhrefsSiteAudit
Crawl-delay: 10
Disallow: /cart
... (full disallow block repeated)
Sitemap: https://www.gberg-heizung.de/sitemap.xml

User-agent: MJ12bot
Crawl-Delay: 10

User-agent: Pinterest
Crawl-delay: 1
```

### What's already correct

| Rule | Source | Status |
|---|---|---|
| `Sitemap: https://.../sitemap.xml` line | `[robots.txt].tsx:81` (interpolated when `sitemapUrl` truthy) | OK |
| `Disallow: /cart` | `[robots.txt].tsx:62` | OK |
| `Disallow: /account` | `[robots.txt].tsx:63` | OK (legacy account route deleted but rule retained — fine) |
| `Disallow: /collections/*sort_by*` and filter dupes | `[robots.txt].tsx:64-72` | OK |
| `Disallow: /search` + `Allow: /search/` + `Disallow: /search/?*` | `[robots.txt].tsx:78-80` | OK — matches plan §1.6 |
| `Disallow: /policies/` | `[robots.txt].tsx:79` | **Reconsider** — disallows imprint/privacy/terms which DE entities are legally required to serve crawlable. See plan §1.6 note. |
| `User-agent: Nutch / Disallow: /` | `[robots.txt].tsx:34-35` | OK |
| `Crawl-delay: 10` for AhrefsBot / AhrefsSiteAudit / MJ12bot | `[robots.txt].tsx:37-49` | OK |
| `Crawl-delay: 1` for Pinterest | `[robots.txt].tsx:51-52` | OK |

### What's missing (gap → plan section)

| Gap | Plan section |
|---|---|
| Per-locale sitemap declarations (`Sitemap: https://www.gberg-heizung.de/de/sitemap.xml`, etc.) | §1.6 |
| `Disallow: /api/predictive-search` | §1.6 |
| `Disallow: /discount/` (action route) | (out of plan — flag) |
| `Disallow: /cart/` (with trailing slash to cover `/cart/[lines]`) | (out of plan — flag) |
| AI crawler rules (`GPTBot`, `Google-Extended`, `ClaudeBot`, `PerplexityBot`, `Applebot-Extended`, `Bytespider`, `CCBot`, `Amazonbot`, `Meta-ExternalAgent`) | §3.1 (decision), §3.2 (encode) |
| `User-agent: GPTBot / Allow: /` (or block, depending on §3.1) | §3.2 |
| `User-agent: ClaudeBot / Allow: /` (recommended) | §3.2 |
| `User-agent: PerplexityBot / Allow: /` (recommended) | §3.2 |
| `User-agent: Bytespider / Disallow: /` (recommended block) | §3.2 |
| `Crawl-delay: 5` on `Meta-ExternalAgent` | §3.2 |
| Reference to `/llms.txt` (e.g. via comment line) | §3.3 |

### Bug-flag

- The `Disallow: /policies/` line at `[robots.txt].tsx:79` blocks crawlers from `/policies/privacy-policy`, `/policies/terms-of-service`, `/policies/refund-policy`, `/policies/shipping-policy`. For the `gberg-heizung.de` domain operating in DE, GDPR / TMG / DSA require these pages to be crawlable for:
  - search engines surfacing them when users search "G-Berg privacy policy"
  - AI agents looking up the imprint when verifying business legitimacy
  - regulators / linkers
  - The legitimate dupe-content concern is handled by the canonical strategy, not by hiding the page entirely. Recommend changing to `Disallow: /policies/?*` (params only) or removing the line. Flag for `docs/legal-checklist.md` review.

---

## `/sitemap.xml` — sitemap index

**File:** `apps/store-heating-hydrogen/app/routes/($locale).[sitemap.xml].tsx`

**Implementation:** Uses Hydrogen's `getSitemapIndex({storefront, request})` helper.

**Cache:** `max-age=86400` — line 11.

**What it emits:** A standard sitemap index that points at sub-sitemaps for each Shopify resource type (`products`, `collections`, `pages`, `articles`), paginated. Hydrogen's helper auto-discovers the routes from `($locale).sitemap.$type.$page[.xml].tsx`.

### What's correct

| Aspect | Status |
|---|---|
| Sitemap index structure | OK — Hydrogen helper handles it. |
| URL of root sitemap | `https://www.gberg-heizung.de/sitemap.xml` — referenced from `robots.txt`. |
| Cache TTL | OK (24h). |

### What's missing

- **Locale fan-out.** The index will contain only the EN sub-sitemaps unless the locale path is included in the URL. Plan §1.5 wants per-locale sub-sitemap entries (e.g. `https://www.gberg-heizung.de/de/sitemap.xml`).

---

## `/sitemap/[type]/[page].xml` — sub-sitemaps

**File:** `apps/store-heating-hydrogen/app/routes/($locale).sitemap.$type.$page[.xml].tsx`

**Implementation:** `getSitemap()` from `@shopify/hydrogen` with three parameters:
- `locales: ['EN-US', 'EN-CA', 'FR-CA']` — line 13
- `getLink: ({type, baseUrl, handle, locale}) => ...` — lines 14-17

**Cache:** `max-age=86400` — line 21.

### Bugs

- **Line 13 — skeleton-leftover locale list.** `['EN-US', 'EN-CA', 'FR-CA']`. Replace with the project's set per `app/lib/gberg/i18n.ts:13`: `['EN', 'DE-DE', 'NL-NL', 'FR-FR', 'ES-ES', 'IT-IT', 'PL-PL', 'DA-DK']` (or whatever Shopify Markets reports as the configured language-COUNTRY pairs).
- This bug means every URL emitted in every sub-sitemap currently has `<xhtml:link rel="alternate" hreflang="EN-US">` / `EN-CA` / `FR-CA` annotations — totally wrong for a Europe market. Any crawler that reads the sitemap-level hreflang will infer that the only language alternates are CA-region English/French.

### What's correct

- `getLink` produces `${baseUrl}/${locale}/${type}/${handle}` when locale present, else `${baseUrl}/${type}/${handle}`. Matches `($locale)` route convention.

---

## Summary

| File | Bugs | Phase fixes |
|---|---|---|
| `[robots.txt].tsx` | `/policies/` over-blocks; no AI bots; no per-locale sitemap | §1.6, §3.2 |
| `($locale).[sitemap.xml].tsx` | Index will only list EN sub-sitemaps until locale fan-out done | §1.5 |
| `($locale).sitemap.$type.$page[.xml].tsx:13` | `['EN-US', 'EN-CA', 'FR-CA']` skeleton-leftover | §1.5 — **highest-priority sitemap fix** |
