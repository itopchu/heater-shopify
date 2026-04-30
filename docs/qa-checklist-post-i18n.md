# Post-i18n QA pass

Run this after the current i18n-wiring sprint + product-content translation
land. The storefront is publicly accessible at
`https://www.gberg-heizung.de`. Lighthouse + crawls run from any host.

## 1. Lighthouse — performance, a11y, SEO, best-practices

Run on **mobile + desktop**, 3 representative URLs × 8 locales.

| Page | Path | Expectation |
|---|---|---|
| Home | `/` and `/de`, `/nl`, `/fr`, `/es`, `/it`, `/pl`, `/da` | Perf ≥ 95, A11y ≥ 95, SEO ≥ 95, BP warn-only |
| PLP | `/collections/wohnraumheizkoerper` (across locales) | Same |
| PDP | `/products/konrad-ventilheizkorper-typ-22` (across locales) | Perf ≥ 85 (LCP image budget), A11y ≥ 95, SEO ≥ 95 |
| Cart | `/cart` | A11y ≥ 95 |
| Page | `/pages/imprint`, `/pages/faq`, `/pages/terms` | A11y ≥ 95, SEO ≥ 95 |

CWV gates from CLAUDE.md: LCP < 2.5s, INP < 200ms, CLS < 0.1.

The Lighthouse CI workflow at `.github/workflows/lighthouse.yml` already
defines per-URL thresholds against the dev store — re-point it at the
prod URL. Expect the gate to fail initially if any of the SEO Phase 1
fixes regressed perf; iterate.

## 2. Functional smoke — every customer journey works

Test in a real browser at desktop **and** mobile widths.

- [ ] Home → click a category card → lands on PLP with products
- [ ] PLP → product card → PDP loads with hero image, price, variant picker, ATC
- [ ] PDP variant picker — color, size — both axes update price + image
- [ ] PDP "Add to cart" — drawer opens, line item shows, total updates
- [ ] Cart page — quantity stepper works, "Remove" works, checkout button hits Shopify
- [ ] Header — mobile menu opens, nav links work
- [ ] Header — language switcher dropdown opens, picking DE flips URL to `/de/...` and content
- [ ] Search overlay — opens, types query, returns predictive results, clicks through
- [ ] WhatsApp bubble — opens wa.me with German pre-filled message
- [ ] Newsletter form — accepts email, submits, shows "Thanks!"
- [ ] Footer — every nav link → 200 OK page, not 404
- [ ] All 8 footer pages render (no empty bodies)
- [ ] Cart drawer dismiss + reopen retains state
- [ ] Variant picker disables out-of-stock combos
- [ ] PDP gallery — thumbnails switch, lightbox opens
- [ ] Skip-to-content link appears on Tab keyboard focus

## 3. Design / visual issues

Walk every locale (8) on home + 1 PDP + 1 PLP + cart and look for:

- [ ] Mojibake (`Ã¶` instead of `ö`) — re-decode source if found
- [ ] Truncated/clipped text (especially long German compound words: "Handtuchwärmer", "Mittelanschluss")
- [ ] Image aspect ratios — no stretched / squashed product photos
- [ ] Color contrast — primary red `#C8102E` on white passes WCAG AA, on charcoal too
- [ ] Mobile responsive breakpoints — 360px, 414px, 768px, 1024px, 1280px
- [ ] Sticky header doesn't overlap content on scroll
- [ ] Sticky mobile ATC bar doesn't block prices
- [ ] Loading states (Suspense fallbacks) don't flash empty
- [ ] Empty cart UI is friendly, not generic
- [ ] 404 / 410 pages have nav back to shop, not just an error code

## 4. Content gaps

- [ ] Every product has at least 1 image (170 uploaded for 55 products — sanity check)
- [ ] Product titles are coherent, not raw German strings on EN locale
- [ ] Product descriptions render (not empty, not placeholder)
- [ ] FAQ entries on PDPs render correctly
- [ ] Compatibility blocks render
- [ ] Spec table on PDP has at least the standard rows (warranty, dimensions if available)
- [ ] Quick Facts panel renders (acknowledged 41/55 products have empty specs — track which still need backfill)
- [ ] Footer pages — no Lorem Ipsum, no "TODO"
- [ ] Legal pages (Imprint, Privacy, Terms) reflect real G-Berg GmbH details
- [ ] Sitemap.xml lists every product and page
- [ ] Robots.txt is correct and references the sitemap

## 5. Translation quality spot-check

For each of the 7 secondary locales, click 2–3 random PDPs and:

- [ ] Verify product title is correctly translated (not just the source DE)
- [ ] Verify body description reads naturally
- [ ] Verify metafield-driven UI (specs, FAQs) is translated
- [ ] Verify price + currency render with the **correct VAT** for that locale's country (DE 19, NL 21, FR 20, ES 21, IT 22, PL 23, DK 25)
- [ ] Verify hreflang tags point to the correct locale URLs

## 6. Network / errors

- [ ] DevTools Console → no errors on home, PLP, PDP, cart
- [ ] Network tab → no 404 on assets (images, fonts, CSS, JS)
- [ ] No 500s in `Storefront 1000133120` Oxygen runtime logs
- [ ] No CSP violations
- [ ] All third-party (Cloudflare/Shopify CDN) requests return 200

## 7. Accessibility (beyond Lighthouse)

- [ ] Keyboard-only navigation works — Tab through every interactive element
- [ ] Screen reader labels are sensible (aria-labels we wired via `t()` in Header / Add-to-cart / Language switcher / WhatsApp)
- [ ] Form errors have visible + screen-reader-accessible messages
- [ ] Focus rings visible on all interactive elements
- [ ] Modals (cart drawer, mobile menu, search overlay) trap focus
- [ ] Skip-to-content link works (Tab from address bar)

## 8. SEO surface

- [ ] Canonical URL on every route, no trailing slash inconsistencies
- [ ] Hreflang × 8 locales + x-default → all 8 valid 200-OK URLs
- [ ] OG image, OG title, OG description on every route
- [ ] Twitter Card on every route
- [ ] `<title>` is unique per route (not "Hydrogen | …" anywhere)
- [ ] `<meta name="description">` populated everywhere
- [ ] structured data (JSON-LD) present after Phase 2 (deferred — not in scope here)
- [ ] Sitemap.xml validates against XML schema, lists every public URL × every locale

## How to run

1. Lighthouse: `pnpm dlx @lhci/cli@0.13 autorun --config=.github/lighthouserc.json` (point at prod URL).
2. Functional: spawn an `Explore` or `general-purpose` subagent with this checklist; it can use Playwright if reattached.
3. Visual: take screenshots at 360/768/1280 widths via Playwright, eyeball.
4. Network: open DevTools, browse, watch for red.

When complete, write findings to `docs/qa-results-YYYY-MM-DD.md` with severity tags (P0 = blocks launch, P1 = visible bug, P2 = polish).
