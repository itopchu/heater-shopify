/**
 * Cart delivery-options transform — selective per-quantity shipping.
 *
 * Policy 2026-05: shipping is included in the listed price for most
 * products. Only valve radiators (Ventilheizkörper) ship at standard
 * DHL rates — billed per item.
 *
 * Implementation: every product in the cart is classified as either
 * "paid-shipping" (ships at the per-zone DHL rate) or "free" (cost is
 * baked into the price and we zero out the rate at checkout). The
 * Function transforms each delivery option to:
 *
 *   newPrice = baseRate × paidShippingQty
 *
 * where paidShippingQty is the sum of `quantity` across lines whose
 * product carries the `shipping:paid` tag OR whose handle contains
 * `ventilheizk` (defensive fallback so the policy still holds if the
 * tag isn't synced yet).
 *
 * Edge cases:
 *   - Cart has zero paid-shipping items → newPrice = 0 (free).
 *   - Cart has only paid-shipping items → newPrice = baseRate × qty.
 *   - Mixed cart → newPrice = baseRate × paidShippingQty (free items
 *     don't add to the bill).
 *
 * The base rate per zone (€/item) is configured in the Shopify shipping
 * profile via `agent/scripts/configure-shipping.mjs` — Shopify hands us
 * the live amount so a merchant rate change flows through without a
 * Function redeploy.
 */

type Money = {amount: string; currencyCode: string};
type DeliveryOption = {
  handle: string;
  title: string | null;
  cost: Money | null;
};
type DeliveryGroup = {deliveryOptions: DeliveryOption[]};
type HasTagResponse = {tag: string; hasTag: boolean};
type Product = {
  handle: string | null;
  productType: string | null;
  paidShippingTag: HasTagResponse[] | null;
};
type Merchandise = {product?: Product | null};
type Line = {quantity: number; merchandise: Merchandise | null};
type RunInput = {
  cart: {
    deliveryGroups: DeliveryGroup[];
    lines: Line[];
  };
};

type DeliveryOperation =
  | {update: {deliveryOptionHandle: string; price?: Money; title?: string}}
  | {hide: {deliveryOptionHandle: string}}
  | {rename: {deliveryOptionHandle: string; title: string}};

type FunctionRunResult = {operations: DeliveryOperation[]};

const NO_OP: FunctionRunResult = {operations: []};

// Two signals are accepted as "this product needs paid shipping". Tags
// are the canonical mechanism (set on the product in Shopify Admin /
// via sync); the handle pattern is a defensive fallback so the policy
// holds before tags propagate.
const PAID_SHIPPING_TAG = 'shipping:paid';
const PAID_SHIPPING_HANDLE_PATTERN = /ventilheizk/i;

function lineNeedsPaidShipping(line: Line): boolean {
  const product = line.merchandise?.product;
  if (!product) return false;
  if (product.paidShippingTag?.some((t) => t.tag === PAID_SHIPPING_TAG && t.hasTag)) {
    return true;
  }
  if (product.handle && PAID_SHIPPING_HANDLE_PATTERN.test(product.handle)) {
    return true;
  }
  return false;
}

// Shopify's JS function pattern (per @shopify/shopify_function): export
// the user function as the module's default export. The package's
// `index.ts` (used as the bundle entry) imports it from the alias
// `user-function` and wraps it in `ShopifyFunction.readInput / writeOutput`.
export default function run(input: RunInput): FunctionRunResult {
  let paidQty = 0;
  for (const line of input.cart.lines) {
    if (lineNeedsPaidShipping(line)) paidQty += line.quantity || 0;
  }

  const operations: DeliveryOperation[] = [];
  const ZERO: Money = {amount: '0.00', currencyCode: 'EUR'};

  for (const group of input.cart.deliveryGroups) {
    for (const option of group.deliveryOptions) {
      if (!option.cost) continue;
      const base = parseFloat(option.cost.amount);
      if (!Number.isFinite(base)) continue;

      // No DHL-billed products in the cart → shipping is included.
      if (paidQty === 0) {
        if (base === 0) continue; // already zero, nothing to do
        operations.push({
          update: {
            deliveryOptionHandle: option.handle,
            price: {amount: '0.00', currencyCode: option.cost.currencyCode || ZERO.currencyCode},
            title: option.title ?? 'Shipping included',
          },
        });
        continue;
      }

      // Paid-shipping items present → multiply per-item rate by their qty.
      if (base <= 0) continue;
      const nextAmount = (base * paidQty).toFixed(2);
      if (nextAmount === base.toFixed(2)) continue; // qty = 1, no transform
      operations.push({
        update: {
          deliveryOptionHandle: option.handle,
          price: {amount: nextAmount, currencyCode: option.cost.currencyCode},
          title: `${option.title ?? 'Shipping'} (${paidQty} × €${base.toFixed(2)})`,
        },
      });
    }
  }

  return operations.length === 0 ? NO_OP : {operations};
}
