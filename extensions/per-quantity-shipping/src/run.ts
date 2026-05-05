/**
 * Cart delivery-options transform — per-quantity shipping enforcement.
 *
 * Storefront copy says shipping is €20 per item. The Shopify shipping
 * profile only knows about a single €20 method per zone (DE/ES/NL); this
 * Function transforms each delivery option's cost at checkout to:
 *
 *   newPrice = baseRate × totalQuantity
 *
 * where:
 *   - baseRate is whatever the merchant configured per-zone (typically €20)
 *   - totalQuantity is the sum of `cart.lines[*].quantity`
 *
 * Edge cases:
 *   - 0 lines: skip transform (cart is empty; Shopify won't surface this
 *     state to the Function in practice).
 *   - operations.update.cost is omitted when the math result equals the
 *     base rate (qty = 1) — leaves Shopify's natural rate in place,
 *     keeping audit logs clean.
 *
 * The constant SHIPPING_FLAT_RATE_PER_ITEM_EUR is informational here —
 * Shopify hands us the live rate so a future merchant change to €25 in
 * the shipping profile flows through without redeploying this Function.
 */

type Money = {amount: string; currencyCode: string};
type DeliveryOption = {
  handle: string;
  title: string | null;
  cost: Money | null;
};
type DeliveryGroup = {deliveryOptions: DeliveryOption[]};
type Line = {quantity: number};
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

// Shopify's JS function pattern (per @shopify/shopify_function): export
// the user function as the module's default export. The package's
// `index.ts` (used as the bundle entry) imports it from the alias
// `user-function` and wraps it in `ShopifyFunction.readInput / writeOutput`.
export default function run(input: RunInput): FunctionRunResult {
  const totalQty = input.cart.lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
  if (totalQty <= 1) return NO_OP;

  const operations: DeliveryOperation[] = [];

  for (const group of input.cart.deliveryGroups) {
    for (const option of group.deliveryOptions) {
      if (!option.cost) continue;
      const base = parseFloat(option.cost.amount);
      if (!Number.isFinite(base) || base <= 0) continue;
      const next = (base * totalQty).toFixed(2);
      if (next === parseFloat(option.cost.amount).toFixed(2)) continue;
      operations.push({
        update: {
          deliveryOptionHandle: option.handle,
          price: {amount: next, currencyCode: option.cost.currencyCode},
          title: `${option.title ?? 'Shipping'} (${totalQty} × €${base.toFixed(2)})`,
        },
      });
    }
  }

  return {operations};
}
