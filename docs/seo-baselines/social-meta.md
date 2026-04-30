# Phase 0.x — Shopify Admin Social / Search Meta Gaps

> Captured from the Shopify Admin → Online Store → Preferences screen. These are **Admin-side fixes** (not Hydrogen code). They affect what Shopify-emitted metadata says — relevant when Shopify's own systems (Markets, payment provider previews, app integrations) read the shop's "global" SEO/social settings.

> The Hydrogen storefront's `<head>` is owned by Hydrogen routes, not by Shopify Admin's Online Store theme. So in pure SEO terms, **most of these Admin fields no longer reach the public storefront** — Hydrogen's `meta()` exports take precedence. But several Shopify-internal touchpoints still read them (Customer Events pixel, Shop App listing, Pinterest catalog, Klaviyo / Mailchimp default fallbacks, Shopify Inbox auto-replies).

---

## Gaps

### 1. Home page title is the placeholder shop subdomain

- **Field:** Online Store → Preferences → Home page title
- **Current value:** `pyzype-xf.myshopify.com` (literal placeholder — the dev `myshopify.com` subdomain).
- **What's wrong:**
  - Shopify exposes this as a fallback meta-title in admin tools (e.g. Shop App, Shop Pay listings, Marketing → Topics).
  - When the storefront app's `meta()` fails to set a title (e.g. `($locale).collections._index.tsx`, `($locale).policies._index.tsx` — see `head-bugs.md` #10), Shopify's fallback can leak.
  - Brands the store as the dev myshopify subdomain in any consumer-facing Shopify surface.
- **Fix (Admin GraphQL or Admin UI — user-action):** Set to `G-Berg Heizung — Premium European radiators`.
- **Length:** ~52 chars (well under 60-char SERP cap).

### 2. Meta description is empty

- **Field:** Online Store → Preferences → Home page meta description
- **Current value:** empty.
- **What's wrong:** Same fallback chain as #1; also feeds the Shop App / Shop Pay / catalog listings.
- **Fix (Admin):** Use the same string the Hydrogen homepage uses today (`($locale)._index.tsx:22-26`):
  > Hundreds of CE-certified radiators with full specs, compatibility notes and engineering support. Designed in Germany, made for Europe.
- **Length:** ~157 chars.

### 3. Social sharing image not uploaded

- **Field:** Online Store → Preferences → Social sharing image
- **Current value:** No image.
- **What's wrong:**
  - Shopify uses this as the fallback `og:image` for any Shopify-rendered page. With Hydrogen, the storefront `<head>` is fully app-controlled — but Shopify's own apps (Email, Marketing, Inbox) read this as the brand's default OG image.
  - Also fallback when Hydrogen routes lack `og:image` (which is currently every route — see `head-bugs.md` #7).
- **Spec:** 1200×628 px (Shopify's documented size, slightly different from the 1200×630 the OG/Twitter spec calls for; Shopify's `1200×628` works for both).
- **Fix (Admin):** Upload `public/og/default.jpg` (asset to be created in plan §1.4) — same source-of-truth image.

---

## Why these still matter even with Hydrogen owning `<head>`

1. **Shop App / Shop Pay listings** read these fields directly, not from the storefront `<head>`. Without them the listing card is anonymous.
2. **Shopify Email** uses the meta description as a default newsletter subhead.
3. **Shopify Customer Events** (Phase 4.2) writes the meta description into the page-view event payload. Empty description = empty `page.title` / `page.description` in GA4 / Klaviyo events.
4. **Shopify Inbox auto-replies** can substitute brand description tokens from these fields.
5. **Marketplace integrations** (Pinterest catalog, TikTok shop, Google Merchant Center via Shopify) pull brand-level metadata from these fields when product-level metadata is missing.

---

## How to fix programmatically (preferred over UI clicks per `CLAUDE.md`)

- Admin GraphQL: `shopUpdate` mutation — sets `name`, but the home-page-title/meta-description/social-sharing-image fields live on the **theme** (`OnlineStore`) not the shop. The clean GraphQL path is:
  - Use `themePublish` / theme settings — but Hydrogen-on-Oxygen doesn't run a theme.
  - Use `metaobjectCreate` with a `seo_defaults` metaobject we then read from `app/root.tsx` — but this is more work than just setting Admin fields.
- **Pragmatic recommendation:** treat these three fields as one-time Admin-UI clicks, document them in `docs/legal-checklist.md` or a new `docs/admin-setup.md`, and reach into Admin only when launching a new market.

---

## Acceptance for these gaps

- Home page title: `G-Berg Heizung — Premium European radiators` (or merchant-approved variant; localized per Shopify Markets where supported).
- Meta description: 150–160 char string — see #2 above.
- Social sharing image: 1200×628 (or 1200×630) PNG/JPG with G-Berg logo + tagline; same asset feeds `public/og/default.jpg` per plan §1.4.

---

## Out of scope

- Per-product `seo` metafield audit — covered in `head-audit.md` PDP row.
- Per-collection `seo` metafield audit — covered in `head-audit.md` PLP row.
- Translate & Adapt locale-specific home page title/meta — gated on plan §1.1 + §1.2 actually shipping; until then, only the EN home title would matter.
