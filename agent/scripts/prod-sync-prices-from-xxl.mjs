/**
 * Catalog-wide price sync from xxl-heizung.de.
 *
 * Policy (commit 3c34281): G-Berg has no discounts. Whatever xxl-heizung
 * lists as the regular (non-sale) price is what we list. If xxl is on
 * sale, the original `compare_at_price` is the regular value we use.
 *
 * For every product on prod:
 *   1. Resolve the xxl source handle:
 *      a. sync.xxl_source_handle metafield (canonical, set by sync pipeline)
 *      b. data/catalog/gberg-catalog.json[handle].xxlHandle (catalog lookup)
 *      c. fall back to the prod handle itself
 *   2. Fetch https://xxl-heizung.de/products/{handle}.json
 *   3. For each prod variant:
 *      a. Match to an xxl variant by SKU (our SKU = "GB-{xxl_sku}", strip the prefix)
 *      b. xxl regular price = max(xxl.price, xxl.compare_at_price)
 *      c. If our price ≠ xxl regular OR our compareAtPrice is set, mark for update
 *   4. Apply via productVariantsBulkUpdate (price = xxl regular,
 *      compareAtPrice = null — no discount markers ever).
 *
 * Idempotent. --apply writes; default is dry-run.
 *
 * Flags:
 *   --apply               write changes
 *   --handle=foo,bar      restrict to a comma list of prod handles
 *   --skip-no-source      silently skip products with no xxl source rather
 *                         than logging a warning per product
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const APPLY = process.argv.includes('--apply');
const SKIP_NO_SOURCE = process.argv.includes('--skip-no-source');
const HANDLE_FILTER = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--handle'));
  if (i < 0) return null;
  const a = process.argv[i];
  const v = a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
})();

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
if (HANDLE_FILTER) console.log(`  filter: ${[...HANDLE_FILTER].join(',')}`);
console.log('');

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

// Catalog index: prod handle → xxl handle (when known).
const catalog = (() => {
  const j = JSON.parse(readFileSync(resolve(ROOT, 'data/catalog/gberg-catalog.json'), 'utf8'));
  const byHandle = new Map();
  for (const p of (j.products ?? j)) byHandle.set(p.handle, p);
  return byHandle;
})();

function resolveXxlHandle(p) {
  const mf = p.metafields.nodes.find((m) => m.namespace === 'sync' && m.key === 'xxl_source_handle');
  if (mf?.value) return mf.value;
  const cat = catalog.get(p.handle);
  if (cat?.xxlHandle) return cat.xxlHandle;
  return p.handle;
}

function stripGbPrefix(sku) {
  if (!sku) return null;
  return sku.replace(/^GB-/, '');
}

const xxlCache = new Map(); // handle → variant-by-sku map (or null on real 404)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// xxl-heizung's edge throttles aggressive scraping. Two retries with
// backoff catch transient 4xx/5xx; only after that do we accept a 404.
async function fetchXxlVariants(handle) {
  if (xxlCache.has(handle)) return xxlCache.get(handle);
  let attempt = 0;
  while (attempt < 3) {
    try {
      const r = await fetch(`https://xxl-heizung.de/products/${encodeURIComponent(handle)}.json`, {
        headers: {'User-Agent': 'gberg-price-sync/1.0 (+https://gberg-heizung.de)'},
      });
      if (r.status === 404) break; // genuine miss
      if (r.ok) {
        const j = await r.json();
        const map = new Map();
        for (const v of j.product?.variants ?? []) {
          if (v.sku) map.set(v.sku, v);
        }
        xxlCache.set(handle, map);
        // Tiny pause between successful fetches to be polite
        await sleep(300);
        return map;
      }
      // 5xx or 429 — back off and retry
      await sleep(1500 * (attempt + 1));
    } catch {
      await sleep(1500 * (attempt + 1));
    }
    attempt++;
  }
  xxlCache.set(handle, null);
  return null;
}

function regularPriceOf(xxlVariant) {
  const p = Number(xxlVariant.price);
  const c = Number(xxlVariant.compare_at_price ?? 0);
  return Math.max(p, c).toFixed(2);
}

// Walk every prod product
console.log('Fetching prod products …');
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){
      products(first:50, after:$c){
        pageInfo{hasNextPage endCursor}
        nodes{
          id handle title
          metafields(first:30){nodes{namespace key value}}
          variants(first:50){nodes{id sku title price compareAtPrice}}
        }
      }
    }`,
    {c: cursor},
  );
  for (const p of d.products.nodes) {
    if (HANDLE_FILTER && !HANDLE_FILTER.has(p.handle)) continue;
    products.push(p);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`  ${products.length} prod product${products.length === 1 ? '' : 's'} to scan`);
console.log('');

let stats = {
  productsScanned: 0,
  productsNoSource: 0,
  productsXxlMissing: 0,
  variantsScanned: 0,
  variantsNoMatch: 0,
  variantsAlreadyOk: 0,
  variantsToUpdate: 0,
  variantsWritten: 0,
};

for (const p of products) {
  stats.productsScanned++;
  const xxlHandle = resolveXxlHandle(p);
  if (!xxlHandle) {
    stats.productsNoSource++;
    if (!SKIP_NO_SOURCE) console.log(`  ⚠ ${p.handle}  no xxl source resolved`);
    continue;
  }
  const xxlMap = await fetchXxlVariants(xxlHandle);
  if (!xxlMap) {
    stats.productsXxlMissing++;
    if (!SKIP_NO_SOURCE) console.log(`  ✗ ${p.handle}  xxl(${xxlHandle}) returned no variants / 404`);
    continue;
  }
  const updates = [];
  for (const v of p.variants.nodes) {
    stats.variantsScanned++;
    const xxlSku = stripGbPrefix(v.sku);
    const xxlV = xxlSku ? xxlMap.get(xxlSku) : null;
    if (!xxlV) {
      stats.variantsNoMatch++;
      continue;
    }
    const regular = regularPriceOf(xxlV);
    const ourPrice = Number(v.price).toFixed(2);
    const ourCa = v.compareAtPrice;
    const samePrice = ourPrice === regular;
    const noCa = ourCa == null;
    if (samePrice && noCa) {
      stats.variantsAlreadyOk++;
      continue;
    }
    stats.variantsToUpdate++;
    updates.push({
      vid: v.id,
      vt: v.title,
      sku: v.sku,
      from: ourPrice,
      to: regular,
      caBefore: ourCa,
    });
  }
  if (updates.length === 0) continue;
  console.log(`  ${p.handle}  (xxl: ${xxlHandle})  ${updates.length} variant${updates.length === 1 ? '' : 's'} to update`);
  for (const u of updates) {
    const cflag = u.caBefore != null ? `  (compareAt ${u.caBefore} → null)` : '';
    console.log(`    ${u.vt.padEnd(30)} ${u.from} → ${u.to}${cflag}`);
  }
  if (!APPLY) continue;
  // Bulk-update via productVariantsBulkUpdate
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100).map((u) => ({id: u.vid, price: u.to, compareAtPrice: null}));
    const r = await gql(
      `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{field message}}}`,
      {productId: p.id, variants: batch},
    );
    const errs = r.productVariantsBulkUpdate.userErrors;
    if (errs.length) console.log(`    ✗ ${JSON.stringify(errs)}`);
    else stats.variantsWritten += batch.length;
  }
}

console.log('');
console.log('Summary:');
console.log(`  products scanned         : ${stats.productsScanned}`);
console.log(`  products with no xxl src : ${stats.productsNoSource}`);
console.log(`  products xxl 404         : ${stats.productsXxlMissing}`);
console.log(`  variants scanned         : ${stats.variantsScanned}`);
console.log(`  variants no SKU match    : ${stats.variantsNoMatch}`);
console.log(`  variants already correct : ${stats.variantsAlreadyOk}`);
console.log(`  variants needing update  : ${stats.variantsToUpdate}`);
if (APPLY) console.log(`  variants written         : ${stats.variantsWritten}`);
if (!APPLY) console.log('\n(dry-run — re-run with --apply to write)');
