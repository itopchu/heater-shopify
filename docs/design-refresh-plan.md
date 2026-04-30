# G-Berg Design Refresh Plan

Scope: aesthetic layer for the new 47-product catalog (ASTORIA, ELANOR, FLORA, PULLMAN, TWISTER, KONRAD, PLATIS, LAVINNO) landing this week. Read-only audit. No code changes here.

Reference files (anchor everything to these):
- `theme/assets/base.css` — Dawn token base, two `:root` blocks (lines 1, 579), 10px rem root.
- `theme/assets/component-fluid-system.css` — recently added fluid clamp() layer (recalibrated to 10px rem).
- `theme/config/settings_data.json` — brand colors + Fraunces/Inter wired, 5 schemes.
- `theme/snippets/card-product.liquid` — primary card; `:has()` driven, two card-wrapper blocks.
- `theme/sections/main-product.liquid` — PDP scaffold, 1500+ lines.
- `theme/templates/{index,collection,product}.json` — homepage 240 lines, collection 32 lines (underdeveloped), product 181 lines.
- `theme/sections/{header,footer,faq,featured-collection,usp-strip,trust-badges,testimonials}.liquid` — custom + Dawn mix.

---

## 1. Current state — honest audit

**What works**
- Brand tokens are in place. `settings_data.json` defines G-Berg red (#C8102E), dark (#8A0B1F), Fraunces + Inter, 5 color schemes, 12px card radius, 8px button radius, 1300px page width. (Memory ID 7165.)
- Fluid system layer (`component-fluid-system.css`) ships intrinsic CSS Grid, fluid clamp() tokens, 4:5 product-card aspect-ratio, recalibrated against Dawn's 10px rem root. Mobile/tablet/desktop QA passed at 360/768/1280/1920. (Memory IDs 7777, 7806, 7811, 7847, 7855, 7857.)
- Product cards in collection grid render at 4:5 portrait — correct frame for vertical radiator photography (313×419 confirmed at 360px). (Memory ID 7857.)
- Custom snippets (`gberg-product-placeholder.liquid`, `consent-banner.liquid`, `structured-data.liquid`) and 10 custom sections give us hooks for differentiation without forking Dawn.

**What's wrong**
- **Visual hierarchy is flat**. Hero h1 renders as 28–52px clamp; bestsellers/category section titles use the same h2 token with no `eyebrow` or display-scale differentiation. The Fraunces display face is loaded but only used at h1 ceiling — a single oversized headline per page would change perceived premium dramatically.
- **Mobile homepage is 11,233px tall** (Memory ID 7817). Bestsellers section alone is 2,920px — 1-column 4:5 portrait cards stacked × 16. Card minimum is 256px which forces 1-up at 360px. Premium-priced product needs density at least 2-up on mobile or pruned product count.
- **Collection template is a stub** — `templates/collection.json` is 32 lines (banner + product-grid only), versus 240 lines for `index.json` and 181 for `product.json` (Memory IDs 7161, 7857). No category hero, no value-prop strip, no cross-sell, no comparison module — PLP feels like an inventory list, not a showroom.
- **Color is wasted**. Brand red is used as the button fill in scheme-1 but never as an accent on cards, badges, eyebrow rules, price callouts, or section dividers. Scheme-4 (#C8102E full background) is reserved for the USP strip — and that strip has a documented WCAG 3.75:1 contrast failure from `opacity: 0.72` on `.usp-strip__body` (Memory IDs 5923, 7217). Red is currently a button color, not a brand language.
- **Type pairing is half-deployed**. Fraunces is configured as the heading face but on a live storefront h1 reports at 30px (Memory ID 7220). Body Inter renders correctly. The display contrast that justifies the font pairing (oversized Fraunces vs tight Inter caption) doesn't exist anywhere.
- **Card frame fights studio photography**. New owner photography is clean studio shots on white. The card uses `card_color_scheme` scheme-2 (light gray #F7F7F7) by default — that mid-grey muddies a white-bg studio crop. No top-right wattage badge, no swatch row, no series wordmark — the card is informationally empty for someone scanning 8 anthrazit/schwarz/weiß variants of the same series.
- **PDP gallery is generic Dawn**. `main-product.liquid` at line 591 has known offenses (UnusedAssign, UndefinedObject) and uses Dawn's default single-column gallery + sticky info pattern. For sculptural radiators (Astoria, Pullman) we need a tall-image-anchored 60/40 split, not a thumbnail strip on the side. The spec accordion is a wall — IDs 7649/7652 confirm spec content is currently single hardcoded strings.
- **FAQ accordion is a class-naming island**. `faq.liquid` scopes via `.faq-{id}` instead of `.section-{id}-padding` — required 9 `:not()` exclusions in the fluid system to override its padding (Memory IDs 7766, 7806). Visually fine but inconsistent with the rest of the theme.
- **Header has no trust marks**. Logo + nav + locale + cart only. No phone, no "free DE shipping ≥X€", no kW/wattage finder entry point. Missed real estate at the top of every page.
- **Footer is 1,321px on mobile** (Memory ID 7817) — likely full link sprawl with no visual prioritization.
- **Sliders survive grid override** via `:not(.slider)` guards (Memory ID 7826) — mobile homepage falls back to horizontal carousel for product/collection rows. Acceptable but adds a third interaction model to learn beyond grid + accordion.

---

## 2. Top 8 changes — ranked by impact, not effort

### 1. Introduce a Display headline scale + eyebrow rhythm
- **Problem**: Fraunces underused; every section title looks the same weight.
- **Fix**: Add `--fluid-display` (clamp 4rem → 9.6rem, i.e. 40→96px) and `--fluid-eyebrow` (1.2rem fixed, uppercase, letter-spaced 0.12em) tokens to `component-fluid-system.css`. Wire into hero h1 + featured-collection title via section setting `heading_size: display`. Use eyebrow as kicker for FAQ/featured/testimonials.
- **Why for this mix**: Sculptural radiators photographed in editorial style need editorial typography. A 96px-ceiling Fraunces hero says "design object", not "boiler".
- **Risk**: low. Tokens-only, opt-in via section setting.
- **Lighthouse risk**: none — Fraunces already loaded, no new asset.

### 2. Redesign product card for variant-rich SKUs
- **Problem**: Card is a photo + title + price. Catalog has 3 colorways × multiple sizes per series. Shoppers need to scan series, not SKUs.
- **Fix**: Edit `card-product.liquid` to add: (a) eyebrow with series wordmark from `product.metafields.gberg.series`, (b) wattage badge top-right from `metafields.gberg.wattage_w`, (c) 3-dot color swatch row from variant `option1` values, (d) hover state that reveals "View {{variants.size}} sizes". All values metafield-driven. Card scheme switches to scheme-1 white (not scheme-2 grey) so studio shots blend cleanly.
- **Why**: Catalog has KONRAD/TWISTER/LAVINNO with multi-colorway variants — without swatches the grid looks like 30 identical pictures.
- **Risk**: medium. Touches snippet used in 4 contexts (PLP, featured-collection, related, search).
- **Lighthouse risk**: low if swatches render as `<button>` siblings (no extra image fetches). Watch CLS — reserve fixed height for swatch row.

### 3. Build a real PLP — replace the 32-line `collection.json`
- **Problem**: Collection page is banner + grid. No category context.
- **Fix**: Extend `collection.json` to: collection-hero (large lifestyle image + collection.description as long-form), sticky filter+sort row, product-grid (existing), inline editorial block at row 8 ("How to size a radiator"), trust-strip, related collections. Filter+sort uses Shopify's `facets.liquid`; sticky row is a thin CSS `position: sticky; top: var(--header-height)` on `.facets-wrapper`.
- **Why**: Mid-3-figure to 4-figure price points need pre-purchase confidence. Current PLP gives none.
- **Risk**: medium. New section types (editorial-inline-block) need schema work.
- **Lighthouse risk**: medium. Sticky bar OK; lifestyle image needs `loading="eager"` + AVIF/WebP responsive `srcset` and a max LCP element budget. Mitigate by giving merchant a "hero image" setting with `fetchpriority="high"` and aspect-ratio reservation to protect CLS.

### 4. PDP: 60/40 anchored gallery + structured spec block
- **Problem**: Default Dawn gallery + accordion wall.
- **Fix**: In `main-product.liquid`, switch to a CSS Grid 60/40 desktop split (`grid-template-columns: 3fr 2fr`). Gallery: tall hero image (full first viewport), 4-up thumbnail row below, click-to-zoom modal (existing `product-media-modal.liquid`). Replace spec accordion with a structured block: kW chip, energy class badge, room coverage line ("Heats rooms up to 12 m²"), warranty icon, dimensions table. Each row is a metafield key, rendered via a `product-spec-row.liquid` snippet repeated. FAQ stays at the bottom as accordion.
- **Why**: Sculptural products (Astoria 1800mm tall, Pullman 600×1000) deserve gallery anchoring. Buyers shopping at 700–1500€ want spec confidence, not a wall.
- **Risk**: medium-high. Touches the most-tested page.
- **Lighthouse risk**: low — same images, different layout. Make sure the hero gallery image keeps `fetchpriority="high"`.

### 5. Use red as accent, not button-fill
- **Problem**: Brand red lives on buttons and one strip. Doesn't read as a brand language.
- **Fix**: Add tokens `--accent-rule: var(--color-button)` and `--accent-eyebrow: var(--color-button)`. Apply red as: 2px underline on eyebrows, 4px left-border on featured-collection title block, price-on-sale color, "in stock" dot, footer brand-line divider. Keep CTA fill red (consistent). Remove scheme-4 (full red background) from USP strip — it's the contrast failure; replace with scheme-1 white + red eyebrow rule.
- **Why**: Editorial-premium flavor (Memory ID 7269) demands restraint. Red as accent reads as confident; red as a button block reads as Dawn-default.
- **Risk**: low. Token-driven.
- **Lighthouse risk**: positive — fixes the 3.75:1 USP contrast issue, raises a11y score.

### 6. Header trust bar + sticky mobile add-to-cart
- **Problem**: Header is brand-only. PDP mobile add-to-cart is below-fold.
- **Fix**: Add a slim `header-trust-bar.liquid` block above the announcement bar, height 32px, three settings (free shipping copy, return window, hotline). On PDP, add a `product-sticky-buy.liquid` that pins to viewport bottom <990px with price + variant chip + Add to cart. Both are merchant-editable section/setting blocks.
- **Why**: 700€+ purchases need legible reassurance and a buy CTA always visible on mobile.
- **Risk**: low–medium. Sticky bar must not block sliders or Klarna widget.
- **Lighthouse risk**: minor INP hit (one extra fixed element, ~5kb). Use `content-visibility: auto` on the sticky bar.

### 7. Reduce mobile vertical: 2-up cards under 480px + section product cap
- **Problem**: 11,233px mobile homepage. Bestsellers = 16 products × 1-col × 4:5 = 2,920px.
- **Fix**: In `component-fluid-system.css`, set `--card-min-product: min(16rem, 48%)` under `(max-width: 480px)` to force 2-up. Add a `products_max_mobile` setting on `featured-collection` schema (default 6, max 12) so merchant can prune.
- **Why**: 4-figure premium catalog should not feel like an Excel scroll.
- **Risk**: low. Existing cards are designed for 256px floor — needs visual check at 170px width.
- **Lighthouse risk**: positive — shorter pages, less layout work.

### 8. FAQ accordion: align class scope + restyle as editorial
- **Problem**: `.faq-{id}` is a class-naming island; visually a generic accordion.
- **Fix**: Rename internal scope class to `.section-{id}-padding` (delete the 9 `:not()` exclusions added in fluid system). Restyle as: numbered list ("01", "02"...) in Fraunces 18px display digits, question in Inter 17px, body 15px, hairline 1px divider in `--color-foreground-30` (new token). Keep first item open by default.
- **Why**: FAQ is the last reassurance before checkout intent — earns more visual weight.
- **Risk**: low. Pure markup + CSS swap.
- **Lighthouse risk**: none.

---

## 3. Design tokens to extend

All to be added to `theme/assets/component-fluid-system.css` (`:root` block) so `base.css` stays Dawn-pristine. Where merchant control matters, mirror as `settings_schema.json` entries.

**Spacing scale — already strong**, fluid 8 steps `--space-3xs` → `--space-2xl` exist. Add:
- `--space-section-tight: clamp(2.4rem, 4vw, 4.8rem)` for inner section padding.
- `--space-grid-row: clamp(1.6rem, 2.5vw, 3.2rem)` for between-card vertical gap.

**Color tokens** (currently only `--color-button`, `--color-foreground`, etc.):
- `--color-surface-tone: #FAFAFA` — card scheme-1 alternative, warmer than #F7F7F7.
- `--color-card-border: rgba(17,17,17,0.08)` — hairline replacing shadow.
- `--color-accent-cool: #2B3440` — for spec/datasheet UI to differentiate from buy CTA red.
- `--color-foreground-30: rgba(17,17,17,0.3)` — for dividers, captions.
- `--color-eyebrow: var(--color-button)` — semantic alias for red-as-accent.

**Type scale beyond h1–h6**:
- `--fluid-display: clamp(4rem, 1.6rem + 8vw, 9.6rem)` — 40→96px, hero only.
- `--fluid-eyebrow: 1.2rem` — fixed, uppercase, `letter-spacing: 0.12em`, Fraunces if italic, Inter if not.
- `--fluid-body-lg: clamp(1.7rem, 1.5rem + 0.6vw, 2rem)` — 17→20px lede.
- `--fluid-caption: clamp(1.2rem, 1.1rem + 0.2vw, 1.4rem)` — 12→14px small text.

**Component tokens**:
- `--card-radius: 1.2rem` (12px) — already in settings, alias for clarity.
- `--card-border: 1px solid var(--color-card-border)` — new hairline-only style; no shadow.
- `--button-density-tight: 0.8rem 1.6rem` — compact button for cards.
- `--button-density-comfort: 1.4rem 2.8rem` — primary CTA on PDP.
- `--badge-radius: 999px` — pill chips for wattage/colorway.

Reference targets:
- `theme/config/settings_schema.json` — add merchant-editable controls for `--color-surface-tone`, hero display headline toggle.
- `theme/layout/theme.liquid` — already includes the inline `html { font-size: calc(var(--font-body-scale) * 62.5%) }` rule; do not touch.
- `theme/assets/base.css` — read-only; never edit (Dawn upgrade path).

---

## 4. Out of scope for this refresh

- Cart drawer, checkout, account, addresses, login, register, reset-password — `theme/sections/main-{cart,login,account,...}.liquid` untouched.
- Blog (`main-blog.liquid`, `main-article.liquid`, `featured-blog.liquid`).
- Search results page, predictive search overlay (other than reusing the new card style).
- Catalog sync pipeline, AI image regen, agent harness — unrelated systems.
- Translations / locales — i18n stream is finishing in parallel.
- Theme-check warnings on `main-product.liquid` (UnusedAssign, UndefinedObject) — separate cleanup.
- Mega-menu redesign — keep current dropdown.
- New page templates beyond home/collection/product (no policy, no /pages/ refresh).

---

## 5. Open questions for the human

1. **Card scheme**: switch the default product card from scheme-2 (`#F7F7F7` grey) to scheme-1 (`#FFFFFF` white) so studio shots sit cleanly, and use `--color-surface-tone #FAFAFA` only for category cards? Affects every grid in the store.
2. **Red CTA fill vs red accent**: keep the primary `Add to cart` button as solid red `#C8102E`, OR switch to dark `#111111` fill with red 2px hover/focus underline (red used purely as accent). Decision sets the brand language for the whole refresh.
3. **Bathroom vs living-room visual divergence**: should FLORA bathroom radiators and the LAVINNO toilet share the editorial card style with ASTORIA/ELANOR/PULLMAN living-room radiators, or do bathroom SKUs get a softer "wet-room" treatment (warmer surface tone, blue-tinted accent)? Affects whether we ship one card variant or two.
