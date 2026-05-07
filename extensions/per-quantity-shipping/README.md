# Per-quantity shipping function

Selectively bills shipping at checkout. Policy 2026-05: shipping is
**included in the listed price for most products**; only valve radiators
(Ventilheizkörper) ship at standard DHL rates, billed per item.

The function transforms each delivery option to:

```
newPrice = baseRate × paidShippingQty
```

where `paidShippingQty` is the sum of `quantity` across cart lines whose
product is classified as paid-shipping. If no paid-shipping items are in
the cart, the rate is zeroed and the option is renamed to "Shipping
included".

## Classification

A product needs paid shipping when **either** is true:

- It carries the tag `shipping:paid` (canonical, set in Shopify Admin
  or by the catalog sync).
- Its handle matches `/ventilheizk/i` (defensive fallback so the policy
  still holds before tags propagate).

Both signals are read at checkout time from the cart's
`merchandise.product`. Adding the tag to a product is the cleanest way
to enroll it; the handle pattern is for the two existing Ventilheizkörper
SKUs.

## Why a Function instead of conditions

Shopify's standard delivery profile cannot natively express "× quantity"
or "applies only to a subset of products in a single profile". The
`cart.delivery-options.transform.run` Function target was built for
exactly this case.

## Files

- `src/run.ts` — the transform logic.
- `src/run.graphql` — the input query Shopify hands the function.
- `shopify.extension.toml` — registration.
- `package.json` — build (esbuild → javy → `dist/function.wasm`).

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
   (DE / NL / BE / LU) and runs on every checkout.

### Option B — Script (after refreshing the token)

The repo includes [`agent/scripts/prod-activate-shipping-function.mjs`](../../agent/scripts/prod-activate-shipping-function.mjs)
which creates the `DeliveryCustomization` record via Admin GraphQL. It
needs the `read_delivery_customizations` and
`write_delivery_customizations` scopes.

## Verification

- Cart with 0 paid-shipping items → "Shipping included" at €0.00.
- Cart with 1 Ventilheizkörper → shipping shows the per-zone base rate.
- Cart with 3 Ventilheizkörper → base rate × 3, title shows
  "Standard delivery (3 × €X.XX)".
- Mixed cart (e.g. 2 free items + 1 Ventilheizkörper) → base rate × 1
  (free items don't add to the shipping bill).

## Updating the rate

The base rate per zone lives in **Shopify Admin → Shipping zones**, not
in this function — Shopify hands the live rate to the function on every
cart load. To change it: edit the zone rate in Admin (or rerun
`agent/scripts/configure-shipping.mjs` with the new constant). No
function redeploy needed.

## Tagging Ventilheizkörper products

Run [`agent/scripts/prod-tag-paid-shipping.mjs`](../../agent/scripts/prod-tag-paid-shipping.mjs)
once to add the `shipping:paid` tag to the live Ventilheizkörper SKUs.
The script is idempotent — re-running it is a no-op.
