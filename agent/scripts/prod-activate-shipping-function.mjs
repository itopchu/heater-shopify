#!/usr/bin/env node
/**
 * Activates the per-quantity-shipping Shopify Function as a delivery
 * customization on the default shipping profile. Without this step the
 * deployed function exists in the app but does not run at checkout.
 *
 * Idempotent: if a delivery customization already wraps this function,
 * the script reports it and exits without creating a duplicate.
 *
 * Usage:
 *   node agent/scripts/prod-activate-shipping-function.mjs            # dry-run
 *   node agent/scripts/prod-activate-shipping-function.mjs --apply
 *
 * Required scopes: read_shipping, write_shipping (already in shopify.app.toml).
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API_VERSION = '2026-04';
const FUNCTION_HANDLE = 'per-quantity-shipping';

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

// 1. Locate the deployed function by handle.
const fnQuery = await gql(
  `{ shopifyFunctions(first: 50) {
      edges { node { id title app { title } apiType useCreationUi } }
    }
  }`,
);

const fnNode = fnQuery.shopifyFunctions.edges
  .map((e) => e.node)
  .find((n) => n.title === FUNCTION_HANDLE || n.title === 'per-quantity-shipping');

if (!fnNode) {
  console.error(
    `Function "${FUNCTION_HANDLE}" not found on ${STORE}. ` +
      `Did the latest deploy succeed? Run \`shopify app deploy\` from the repo root first.`,
  );
  console.error(
    'Available functions:\n' +
      fnQuery.shopifyFunctions.edges
        .map((e) => `  - ${e.node.title} (${e.node.apiType})`)
        .join('\n'),
  );
  process.exit(1);
}
console.log(`→ Found function: ${fnNode.title} (${fnNode.id})`);

// 2. Check existing delivery customizations to avoid duplicates.
const existingQuery = await gql(
  `{ deliveryCustomizations(first: 50) {
      edges { node { id title functionId enabled } }
    }
  }`,
);

const already = existingQuery.deliveryCustomizations.edges
  .map((e) => e.node)
  .find((n) => n.functionId === fnNode.id);

if (already) {
  console.log(`→ Customization already exists: "${already.title}" (${already.id}) enabled=${already.enabled}`);
  if (already.enabled) {
    console.log('Nothing to do.');
    process.exit(0);
  }
  console.log('  → Will toggle enabled=true.');
  if (!APPLY) {
    console.log('  Re-run with --apply to enable.');
    process.exit(0);
  }
  const r = await gql(
    `mutation($id:ID!, $input:DeliveryCustomizationInput!) {
      deliveryCustomizationUpdate(id:$id, deliveryCustomization:$input) {
        deliveryCustomization { id enabled }
        userErrors { field message code }
      }
    }`,
    {id: already.id, input: {enabled: true}},
  );
  const errs = r.deliveryCustomizationUpdate.userErrors;
  if (errs.length) { console.error('✗', errs); process.exit(1); }
  console.log('✓ Enabled.');
  process.exit(0);
}

// 3. Create the delivery customization.
console.log(`→ Will create DeliveryCustomization wrapping function ${fnNode.id}`);
console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

if (!APPLY) {
  console.log('  Re-run with --apply to create.');
  process.exit(0);
}

const create = await gql(
  `mutation($input:DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization:$input) {
      deliveryCustomization { id title enabled functionId }
      userErrors { field message code }
    }
  }`,
  {
    input: {
      functionId: fnNode.id,
      title: 'Per-quantity shipping (€20 × qty)',
      enabled: true,
    },
  },
);

const errs = create.deliveryCustomizationCreate.userErrors;
if (errs.length) { console.error('✗', errs); process.exit(1); }
const dc = create.deliveryCustomizationCreate.deliveryCustomization;
console.log(`✓ Created: ${dc.title} (${dc.id}) enabled=${dc.enabled}`);
console.log('\nVerify at Admin → Settings → Shipping and delivery → Customize delivery options.');
