# Cloudflare Pages migration plan — Hydrogen storefront

**Status:** Code adapter ready. **User action required to activate.**
**Reason:** Shopify Basic plan keeps the Hydrogen Oxygen storefront behind a Cloudflare Auth Worker gate that can't be disabled without upgrading to Shopify ($79/mo). Cloudflare Pages (free tier) replaces Oxygen, removes the gate, costs $0/month.

## What's already in place

Code committed in `9297ead` on `main`:

- `apps/store-heating-hydrogen/public/_routes.json` — declares which paths the SSR worker handles.
- `apps/store-heating-hydrogen/scripts/build-cf-pages.mjs` — post-build step that copies `dist/server/index.js` to `dist/client/_worker.js` (CF Pages auto-detects this).
- `apps/store-heating-hydrogen/package.json` — adds `pnpm build:cf` script.

Local build verified: `pnpm build:cf` produces a 480 KB `_worker.js` plus `_routes.json` in `dist/client/`. Ready for CF Pages to pick up.

## What stays unchanged

- Shopify backend (`pyzype-xf.myshopify.com`) — products, inventory, orders, accounting, payments, taxes, customer accounts, Markets, Translate & Adapt — all 100% Shopify, untouched.
- Hydrogen code — same React Router 7 + Hydrogen 2026.4 + Tailwind 4 codebase.
- Custom domain `gberg-heizung.de` — registered at Namecheap, just gets re-pointed.
- GitHub repo `itopchu/heater-shopify` — source of truth, CF Pages watches it.

## Migration steps (user action)

### 1. Cloudflare account (~2 min)

- https://dash.cloudflare.com/sign-up
- Free plan, no card.

### 2. CF Pages project (~5 min)

- Workers & Pages → **Pages** → **Connect to Git**
- Authorize CF for `itopchu/heater-shopify`
- Production branch: `main`
- Project name: `gberg-heizung` (or anything)

**Build settings:**

- Framework preset: **None**
- Build command:
  ```
  npm i -g pnpm@10 && pnpm install --frozen-lockfile && cd apps/store-heating-hydrogen && pnpm build:cf
  ```
- Build output directory: `apps/store-heating-hydrogen/dist/client`
- Root directory: `/` (default)

**Environment variables (Production):**

```
PUBLIC_STORE_DOMAIN              = pyzype-xf.myshopify.com
PUBLIC_STOREFRONT_ID             = 1000133120
PUBLIC_STOREFRONT_API_TOKEN      = 997c874a26d55c148e89fd78e29a38bc
PUBLIC_STOREFRONT_API_VERSION    = 2026-04
PUBLIC_CHECKOUT_DOMAIN           = www.gberg-heizung.de
PRIVATE_STOREFRONT_API_TOKEN     = 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
PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID = e657e0b9-94a7-41fb-8e19-ca0011e9d468
PUBLIC_CUSTOMER_ACCOUNT_API_URL  = https://shopify.com/104202633553
SHOP_ID                          = 104202633553
SESSION_SECRET                   = 84be447d87bc316fa8962911114740663bb24dab
NODE_VERSION                     = 20
```

`NODE_VERSION=20` is required so CF uses the same Node major as our local toolchain.

### 3. First deploy

- Save and Deploy. CF builds (~3-4 min) and gives a `<project>.pages.dev` URL.
- Paste the URL back to me — I'll smoke-test that the storefront serves products / pages / cart correctly.

### 4. DNS swap (~5 min, after step 3 is verified)

In Namecheap → `gberg-heizung.de` → **Advanced DNS** → **Host records**:

- Replace the existing **A `@` → 23.227.38.65** with **CNAME `@` → `<project>.pages.dev`** (Namecheap supports CNAME at apex).
- Replace **CNAME `www` → shops.myshopify.com** with **CNAME `www` → `<project>.pages.dev`**.
- TTL: Automatic.

### 5. Add custom domain in CF Pages

- CF Pages dashboard → project → **Custom domains** → **Set up a custom domain** → enter `www.gberg-heizung.de` and `gberg-heizung.de` (one at a time).
- CF auto-provisions SSL via Universal SSL (~2 min per domain).
- CF will also offer to handle the apex → www redirect — accept it.

### 6. Disconnect Shopify-side bindings

- In Shopify Admin → **Settings → Domains** → for `gberg-heizung.de` and `www.gberg-heizung.de` → set Target back to **Online Store** or remove the binding entirely.
  - This stops Shopify from claiming the domain. Without this step, Shopify's edge may keep responding for the domain depending on DNS chain order.
- In Sales channels → Hydrogen → G-Berg → keep the storefront record (we still use it for the Storefront API token + analytics integration), but disconnect the custom domain.

### 7. (Optional) Disable the Oxygen CI workflow

- Once CF Pages is serving customer traffic, the Oxygen deploy workflow on every push is redundant and burns CI minutes.
- Either delete `.github/workflows/oxygen-deployment-1000133120.yml` or wrap its `on:` trigger to skip main pushes.

## Cost & limits (CF Pages free tier)

- 500 builds / month — easily covers daily pushes.
- 100,000 SSR requests / day — for a brand-new store doing <3,000 visitors/day, ~30× headroom.
- Unlimited static-asset requests.
- 100 GB egress / month.
- Free SSL via Universal SSL.

If we ever hit the SSR limit, CF Workers Paid plan is $5/mo for 10M requests — still 16× cheaper than the Shopify upgrade we're avoiding.

## Behaviour differences vs Oxygen

| Concern | Oxygen | CF Pages |
|---|---|---|
| Country detection header | `Oxygen-Buyer-Country` | `cf-ipcountry` |
| IP detection header | `Oxygen-Buyer-IP` | `cf-connecting-ip` |
| Edge POPs | Cloudflare (Shopify-routed) | Cloudflare (direct) |
| Cold start | ~0ms (V8 isolates) | ~0ms (V8 isolates) |
| Cache API | Workers Cache API | Workers Cache API (identical) |
| Hydrogen Analytics | Auto-piped to Shopify | Use Customer Events / GA4 / Plausible |

The country/IP header difference is currently a non-issue for us because we use URL-prefixed locale routing (`/de/`, `/nl/`), not IP-based redirects. If/when we add geo-routing, we'll switch the header read.

## Rollback plan

If CF Pages deployment fails or has issues:

1. Don't touch DNS until step 3 verifies CF works.
2. If DNS is already swapped and we need to roll back: revert the Namecheap records to `A @ → 23.227.38.65` and `CNAME www → shops.myshopify.com`. Re-add domain target in Shopify admin. ~10 min total.

## Why this beats the alternatives

- **Stay on Oxygen + upgrade Shopify plan ($79/mo):** $948/year for hosting we can get free.
- **Move to Vercel:** also free tier, but Hydrogen targets Cloudflare Workers natively. CF Pages is the closer fit.
- **Switch to the Liquid theme:** would mean abandoning the Hydrogen UI we built. Wasteful per the user's call.

## When this plan should be invoked

User asks "what is left" / "what's next" / "where are we" — surface this as the **single blocking step** before the storefront can serve customers publicly. After the migration completes, this doc becomes historical record.
