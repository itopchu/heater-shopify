/**
 * Switch inventory tracking OFF for the heizstab color-split products
 * so they're sellable without an explicit stock count. The split script
 * created them with `tracked: true`, which gives them 0 inventory and
 * marks them out-of-stock on the storefront.
 *
 * Apply to all variants of: heizstab, heizstab-white, heizstab-anthracite.
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

const HANDLES = ['heizstab', 'heizstab-white', 'heizstab-anthracite'];

for (const handle of HANDLES) {
  const p = (await gql(
    `query($h:String!) {
      productByHandle(handle:$h) {
        id title
        variants(first:20) {
          edges { node {
            id title sku
            inventoryItem { id tracked }
            inventoryPolicy
          } }
        }
      }
    }`,
    {h: handle},
  )).productByHandle;
  if (!p) { console.error(`✗ ${handle} not found`); continue; }
  console.log(`\n→ ${p.title}`);
  for (const v of p.variants.edges.map(e => e.node)) {
    console.log(`  variant ${v.title}  sku=${v.sku}  tracked=${v.inventoryItem.tracked}  policy=${v.inventoryPolicy}`);
  }

  // Update each variant: tracked=false, inventoryPolicy=CONTINUE (keep
  // sellable even at 0 in case Shopify ever flips tracking back on).
  const updates = p.variants.edges.map(e => ({
    id: e.node.id,
    inventoryItem: {tracked: false},
    inventoryPolicy: 'CONTINUE',
  }));
  const r = await gql(
    `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId:$pid, variants:$vars) {
        productVariants {
          id sku inventoryPolicy inventoryItem { tracked }
        }
        userErrors { field message }
      }
    }`,
    {pid: p.id, vars: updates},
  );
  const errs = r.productVariantsBulkUpdate.userErrors;
  if (errs.length) { console.error('  ✗', errs); continue; }
  for (const v of r.productVariantsBulkUpdate.productVariants) {
    console.log(`  ✓ ${v.sku} → tracked=${v.inventoryItem.tracked} policy=${v.inventoryPolicy}`);
  }
}
console.log('\nDone.');
