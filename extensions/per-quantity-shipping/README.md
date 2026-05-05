# Per-quantity shipping function

Multiplies the flat shipping rate (€20 per zone) by the total cart quantity at checkout, so storefront copy ("€20 per item") matches what the customer pays.

## Why a Function instead of conditions

Shopify's standard delivery profile cannot natively express "× quantity". Price-condition rules can only segment by subtotal/weight, not multiply by quantity. The cart `cart.delivery-options.transform.run` Function target was built for exactly this case.

## Files

- `src/run.ts` — the transform.
- `src/run.graphql` — the input query Shopify hands the function.
- `shopify.extension.toml` — registration.
- `package.json` — build (esbuild → `dist/function.js`).

## Build + deploy

From repo root:

```bash
# 1. Build the function bundle.
cd extensions/per-quantity-shipping
npm install
npm run build

# 2. Deploy the function via Shopify CLI (uses the gberg-agent app at the
#    repo root — `client_id = 8064f934f0a8284c7badb51617246ec8`).
cd ../..
shopify app deploy
```

## Activate

Two paths — pick whichever is easier.

### Option A — Admin UI (no script, no token refresh)

1. Open **Shopify Admin → Settings → Shipping and delivery**.
2. Scroll to **Customize delivery options** (above the shipping profiles).
3. Click **Add customization**.
4. Pick **per-quantity-shipping** from the list.
5. Save. The function applies to every delivery option on every zone
   (DE / ES / NL) and runs on every checkout.

### Option B — Script (after refreshing the token)

The repo includes [`agent/scripts/prod-activate-shipping-function.mjs`](../../agent/scripts/prod-activate-shipping-function.mjs) which creates the `DeliveryCustomization` record via Admin GraphQL. It needs the `read_delivery_customizations` and `write_delivery_customizations` scopes (added to `shopify.app.toml`). The existing offline access token in `.env.local` was issued before those scopes existed and must be refreshed once:

1. Open **Admin → Apps and sales channels → gberg-agent → Configure**.
2. Click **Re-grant scopes** / **Update app** and approve the new permissions.
3. Copy the new offline access token into `SHOPIFY_PROD_ADMIN_TOKEN` in `.env.local`.
4. Run: `node agent/scripts/prod-activate-shipping-function.mjs --apply`.

## Verification

- Cart with 1 item → shipping shows €20 (no transform — function returns NO_OP for qty ≤ 1).
- Cart with 2 items → shipping shows €40 with title "Standard delivery (2 × €20.00)".
- Cart with 5 items → shipping shows €100 with title "Standard delivery (5 × €20.00)".
- Cart with 1 item costing €1000 — still €20 (no free-shipping threshold; this is the requirement).

## Updating the rate

The €20 base rate lives in **Shopify Admin → Shipping zones**, not in this function — Shopify hands the live rate to the function on every cart load. To change to €25:

1. Update zone rate in Admin (or rerun `agent/scripts/configure-shipping.mjs` with the new constant).
2. Update `SHIPPING_FLAT_RATE_EUR_PER_QTY` in [`apps/store-heating-hydrogen/app/lib/gberg/contact.ts`](../../apps/store-heating-hydrogen/app/lib/gberg/contact.ts) to keep storefront copy aligned.

No function redeploy needed.
