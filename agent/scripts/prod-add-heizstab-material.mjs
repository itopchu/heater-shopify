#!/usr/bin/env node
/**
 * Add Color + Material options to the Electric Heating Element product
 * (handle: heizstab) without disturbing existing variants or in-flight
 * orders.
 *
 * Live state (verified 2026-05-05): the prod product has only a "Size"
 * option [600, 1200]. Per requirements §7 the product must expose Color
 * and Material as buyer-facing options, on top of the existing size
 * variants.
 *
 * Strategy:
 *   - `productOptionsCreate` with `variantStrategy: LEAVE_AS_IS` so each
 *     of the 2 existing variants gets the new options' default values
 *     bound automatically — existing SKUs/orders untouched.
 *   - Idempotent: skips an option if its name already exists on the product.
 *   - Storefront i18n: `pdp.spec_label_color` and `pdp.spec_label_material`
 *     are already wired up in every locale dictionary.
 *
 * Starter values are intentionally minimal (one each). Add more values
 * via Admin → Products → Electric Heating Element → Options once the
 * merchant supplies the canonical list (e.g. Black/White/Anthracite for
 * Color; Stainless steel/Brass for Material).
 *
 * Usage:
 *   node agent/scripts/prod-add-heizstab-material.mjs            # dry-run
 *   node agent/scripts/prod-add-heizstab-material.mjs --apply
 *   node agent/scripts/prod-add-heizstab-material.mjs --store dev --apply
 *
 * Required scopes: read_products, write_products.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const APPLY = process.argv.includes('--apply');
const STORE_FLAG = process.argv.includes('--store')
  ? process.argv[process.argv.indexOf('--store') + 1]
  : 'prod';
const SUFFIX = STORE_FLAG === 'dev' ? 'DEV' : 'PROD';
const STORE = process.env[`SHOPIFY_${SUFFIX}_STORE`];
const TOKEN = process.env[`SHOPIFY_${SUFFIX}_ADMIN_TOKEN`];
if (!STORE || !TOKEN) {
  console.error(`Missing SHOPIFY_${SUFFIX}_* env vars`);
  process.exit(1);
}

const PRODUCT_HANDLE = 'heizstab';

// Options to add. Each entry becomes one option with one starter value.
// Add more values per option in Admin once the merchant provides them.
const NEW_OPTIONS = [
  {name: 'Color', starter: 'Black'},
  {name: 'Material', starter: 'Stainless steel'},
];

async function gql(query, variables = {}) {
  const r = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

const productLookup = await gql(
  `query($handle:String!){
    productByHandle(handle:$handle){
      id title handle
      options { id name position values }
      variants(first:50){ edges{ node{ id title } } }
    }
  }`,
  {handle: PRODUCT_HANDLE},
);

const product = productLookup.productByHandle;
if (!product) {
  console.error(`Product "${PRODUCT_HANDLE}" not found on ${STORE}.`);
  process.exit(1);
}

console.log(`→ ${product.title} (${product.id})`);
console.log(`  Existing options:`);
for (const o of product.options) {
  console.log(`    - ${o.name} [${o.values.join(', ')}]`);
}
console.log(`  Variants: ${product.variants.edges.length}\n`);

const existingNames = new Set(product.options.map((o) => o.name.toLowerCase()));
const toCreate = NEW_OPTIONS.filter((o) => !existingNames.has(o.name.toLowerCase()));
const skipped = NEW_OPTIONS.filter((o) => existingNames.has(o.name.toLowerCase()));

for (const o of skipped) {
  console.log(`  skip  ${o.name} (already exists)`);
}

if (toCreate.length === 0) {
  console.log('→ All requested options already exist — nothing to do.');
  process.exit(0);
}

console.log(
  `→ Will add: ${toCreate.map((o) => `${o.name} [${o.starter}]`).join(', ')}`,
);
console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

if (!APPLY) {
  console.log('Re-run with --apply to write the change.');
  process.exit(0);
}

// productOptionsCreate accepts multiple options in one call.
const result = await gql(
  `mutation($productId:ID!, $options:[OptionCreateInput!]!) {
    productOptionsCreate(
      productId: $productId
      options: $options
      variantStrategy: LEAVE_AS_IS
    ) {
      product { id options { name values } }
      userErrors { field message code }
    }
  }`,
  {
    productId: product.id,
    options: toCreate.map((o) => ({
      name: o.name,
      values: [{name: o.starter}],
    })),
  },
);

const errs = result.productOptionsCreate.userErrors;
if (errs.length) {
  console.error('✗ userErrors:', errs);
  process.exit(1);
}

console.log('✓ Options added.');
console.log(
  `  Final options: ${result.productOptionsCreate.product.options
    .map((o) => `${o.name} [${o.values.join(', ')}]`)
    .join(' · ')}`,
);
console.log(
  '\nNext steps:\n' +
    '  1. Add additional Color/Material values via Admin → Products → Electric Heating Element → Options.\n' +
    '  2. Optional: re-run translate-products to localize the option labels via Translate & Adapt.\n',
);
