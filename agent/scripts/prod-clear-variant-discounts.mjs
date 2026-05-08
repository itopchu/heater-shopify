/**
 * Catalog-wide discount remover. G-Berg's policy is "no discounts" — when
 * xxl-heizung runs a sale, the original (higher) compareAtPrice is the
 * value we list. Some products were synced before that policy was wired
 * into normalize.ts (commit 3c34281) and still carry compareAtPrice >
 * price, which renders as a struck-through "Was €X" pill on the PLP.
 *
 * Walks every product's every variant. For any variant where
 * compareAtPrice > price, promotes compareAtPrice → price and clears
 * compareAtPrice (sets it to null) so no discount renders.
 *
 * Idempotent. --apply writes; default is dry-run.
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
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const APPLY = process.argv.includes('--apply');

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

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

// Walk all products + variants
const byProduct = new Map(); // productId → [{ id, price, compareAtPrice }]
const titleByProduct = new Map();
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){products(first:50,after:$c){pageInfo{hasNextPage endCursor} nodes{id handle title variants(first:50){nodes{id title price compareAtPrice}}}}}`,
    {c: cursor},
  );
  for (const p of d.products.nodes) {
    titleByProduct.set(p.id, `${p.handle} — ${p.title}`);
    for (const v of p.variants.nodes) {
      const ca = v.compareAtPrice ? Number(v.compareAtPrice) : null;
      const pr = Number(v.price);
      if (ca != null && ca > pr) {
        if (!byProduct.has(p.id)) byProduct.set(p.id, []);
        byProduct.get(p.id).push({id: v.id, title: v.title, oldPrice: v.price, oldCa: v.compareAtPrice, newPrice: v.compareAtPrice});
      }
    }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const totalVariants = [...byProduct.values()].reduce((n, vs) => n + vs.length, 0);
console.log(`Found ${totalVariants} discounted variants across ${byProduct.size} product${byProduct.size === 1 ? '' : 's'}.`);
console.log('');
for (const [pid, vs] of byProduct) {
  console.log(`${titleByProduct.get(pid)}  (${vs.length} variant${vs.length === 1 ? '' : 's'})`);
  for (const v of vs) {
    console.log(`  ${v.title.padEnd(30)} price ${v.oldPrice} → ${v.newPrice}  (compareAt ${v.oldCa} → null)`);
  }
}

if (!APPLY) {
  console.log('');
  console.log('(dry-run — re-run with --apply to write)');
} else if (totalVariants > 0) {
  console.log('');
  let written = 0;
  for (const [pid, vs] of byProduct) {
    const variants = vs.map((v) => ({id: v.id, price: v.newPrice, compareAtPrice: null}));
    // productVariantsBulkUpdate handles up to 250 per call
    for (let i = 0; i < variants.length; i += 100) {
      const batch = variants.slice(i, i + 100);
      const r = await gql(
        `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{field message}}}`,
        {productId: pid, variants: batch},
      );
      const errs = r.productVariantsBulkUpdate.userErrors;
      if (errs.length) console.log(`  ✗ ${titleByProduct.get(pid)} batch ${i}: ${JSON.stringify(errs)}`);
      else written += batch.length;
    }
  }
  console.log(`✓ wrote ${written}/${totalVariants} variants`);
}
