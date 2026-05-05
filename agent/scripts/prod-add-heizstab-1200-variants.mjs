/**
 * Adds the missing 1200W variant to the heizstab-white and
 * heizstab-anthracite products. Their initial productCreate auto-created
 * only the 600W variant; this script appends the second size.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

const TARGETS = [
  {handle: 'heizstab-white', color: 'White', sku: 'GB-XXL-HS-006'},
  {handle: 'heizstab-anthracite', color: 'Anthracite', sku: 'GB-XXL-HS-009'},
];

for (const t of TARGETS) {
  const p = (await gql('query($h:String!){productByHandle(handle:$h){id title}}', {h: t.handle})).productByHandle;
  if (!p) { console.error(`✗ ${t.handle} not found`); continue; }
  console.log(`→ ${p.title} (${p.id})`);

  const r = await gql(
    `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId:$pid, variants:$vars) {
        productVariants { id sku title }
        userErrors { field message }
      }
    }`,
    {
      pid: p.id,
      vars: [{
        price: '119.00',
        optionValues: [
          {optionName: 'Size', name: '1200'},
          {optionName: 'Color', name: t.color},
          {optionName: 'Material', name: 'Stainless steel'},
        ],
        inventoryItem: {tracked: true, sku: t.sku},
      }],
    },
  );
  const errs = r.productVariantsBulkCreate.userErrors;
  if (errs.length) console.error('  ✗', errs);
  else console.log(`  ✓ added 1200W variant ${t.sku}`);
}
