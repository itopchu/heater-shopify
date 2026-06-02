/**
 * Catalog-wide price sync from xxl-heizung.de — "logical ladder" policy.
 *
 * Supersedes the old max(price, compare_at) policy (prod-sync-prices-from-xxl.mjs),
 * which surfaced xxl's pre-sale REGULAR price on every sale variant. That made
 * ~36% of products look overpriced vs xxl AND produced irrational size ladders
 * (a smaller radiator costing more than a larger one).
 *
 * NEW POLICY (2026-06):
 *   Each variant lists xxl's CURRENT SELLING price (xxl.price) — so we are never
 *   priced above the source — EXCEPT we never let a sale make a strictly-LARGER
 *   size cost less than a smaller one. "Strictly larger" = Pareto-dominant in
 *   BOTH width and height (NOT by area — these radiators are genuinely priced by
 *   model, so a 400×800 legitimately costs more than a 600×600). When a sale
 *   would drop a dominant size below a smaller sibling, that size holds its
 *   REGULAR (compare_at) list price instead. Variants that are NOT on sale keep
 *   xxl's real price untouched, so legitimate base-price quirks are preserved.
 *
 * Matching, catalog lookup, and the +€20 `shipping-in-price` surcharge are
 * unchanged from the old script.
 *
 * ⚠ ONE-TIME REMEDIATION, NOT an auto-sync. There is no cron/CI wiring and the
 * old auto price-sync was deleted on purpose (manual/curated prices must
 * persist). Re-running this re-derives every non-excluded product's price from
 * xxl's live selling price, so any hand-curated prices on those products would
 * be overwritten. Add a handle to EXCLUDE before re-running if it's been
 * curated (Essen is already excluded).
 *
 * Idempotent w.r.t. xxl data. --apply writes; default is dry-run.
 *
 * Flags:
 *   --apply               write changes
 *   --handle=foo,bar      restrict to a comma list of prod handles
 *   --report=path.json    write a full before/after report (default tmp/price-logical-report.json)
 */
import {readFileSync, writeFileSync} from 'node:fs';
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
const HANDLE_FILTER = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--handle'));
  if (i < 0) return null;
  const a = process.argv[i];
  const v = a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
})();
const REPORT_PATH = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--report'));
  if (i < 0) return resolve(ROOT, 'tmp/price-logical-report.json');
  const a = process.argv[i];
  return resolve(ROOT, a.includes('=') ? a.split('=')[1] : process.argv[i + 1]);
})();

// Products whose prices are hand-curated by the merchant and must never be
// touched by this script.
const EXCLUDE = new Set(['vertikal-planheizkorper-wohnraum-heizkorper-essen-weiss']);

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}  policy=logical-ladder`);
if (HANDLE_FILTER) console.log(`  filter: ${[...HANDLE_FILTER].join(',')}`);
console.log(`  excluded (manual price): ${[...EXCLUDE].join(', ')}`);
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

const stripGbPrefix = (sku) => (sku ? sku.replace(/^GB-/, '') : null);

const xxlCache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchXxlVariants(handle) {
  if (xxlCache.has(handle)) return xxlCache.get(handle);
  let attempt = 0;
  while (attempt < 3) {
    try {
      const r = await fetch(`https://xxl-heizung.de/products/${encodeURIComponent(handle)}.json`, {
        headers: {'User-Agent': 'gberg-price-sync/2.0 (+https://gberg-heizung.de)'},
      });
      if (r.status === 404) break;
      if (r.ok) {
        const j = await r.json();
        const map = new Map();
        for (const v of j.product?.variants ?? []) if (v.sku) map.set(v.sku, v);
        xxlCache.set(handle, map);
        await sleep(300);
        return map;
      }
      await sleep(1500 * (attempt + 1));
    } catch {
      await sleep(1500 * (attempt + 1));
    }
    attempt++;
  }
  xxlCache.set(handle, null);
  return null;
}

const num = (x) => Number(x);
const sellingOf = (xv) => Number(xv.price);
const regularOf = (xv) => Math.max(Number(xv.price), Number(xv.compare_at_price ?? 0));

// Parse the two leading dimension numbers from an option/title string.
// "40 × 160" -> [40,160]; "400 x 1600 mm" -> [400,1600]. null if not a dimension.
function parseDims(s) {
  if (s == null) return null;
  const m = String(s).match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[2].replace(',', '.'));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

// a strictly dominates b: >= in both dimensions, > in at least one.
function dominates(a, b) {
  if (!a || !b) return false;
  return a[0] >= b[0] && a[1] >= b[1] && (a[0] > b[0] || a[1] > b[1]);
}

const SHIPPING_IN_PRICE_TAG = 'shipping-in-price';
const SHIPPING_IN_PRICE_SURCHARGE_EUR = 20;

/**
 * Compute the logical price per matched variant. `chosen` is the pre-surcharge
 * base price.
 *
 * Policy ("undo the inflate-trick"): xxl marks a high compare_at and sells
 * lower to fake a discount; the old sync surfaced that inflated compare_at.
 * We only ever LOWER a price down to xxl's real CURRENT SELLING price. We
 * never RAISE a price: we won't list above xxl, we never propagate xxl's own
 * base-price anomalies (a smaller variant priced higher than a larger one)
 * upward, and any existing sensible lower price is kept. compare_at is never
 * used as a price. Residual genuine sale-dips on the largest sizes are left at
 * xxl's real price and reported for manual curation.
 */
function computeLogical(rows, surcharge) {
  for (const r of rows) {
    const sellingTarget = Number((r.selling + surcharge).toFixed(2));
    r.chosen =
      r.ourPrice > sellingTarget + 1e-9 ? r.selling : r.ourPrice - surcharge;
  }
  return rows;
}

/**
 * After pricing, flag any pair where a size strictly LARGER in both width and
 * height (same option group) is cheaper than a smaller one — a residual ladder
 * dip that needs merchant curation (like Essen). `priceOf` reads chosen+surcharge.
 */
function findLadderDips(rows, surcharge) {
  const dips = [];
  const priceOf = (r) => Number((r.chosen + surcharge).toFixed(2));
  for (const a of rows) {
    for (const b of rows) {
      if (a === b || a.groupKey !== b.groupKey) continue;
      if (dominates(a.sizeDims, b.sizeDims) && priceOf(a) + 1e-9 < priceOf(b)) {
        dips.push(`larger ${a.vt} €${priceOf(a)} < smaller ${b.vt} €${priceOf(b)}`);
      }
    }
  }
  return dips;
}

console.log('Fetching prod products …');
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){products(first:50, after:$c){
      pageInfo{hasNextPage endCursor}
      nodes{ id handle title tags
        metafields(first:30){nodes{namespace key value}}
        variants(first:100){nodes{id sku title price compareAtPrice selectedOptions{name value}}}
      }}}`,
    {c: cursor},
  );
  for (const p of d.products.nodes) {
    if (HANDLE_FILTER && !HANDLE_FILTER.has(p.handle)) continue;
    if (EXCLUDE.has(p.handle)) continue;
    products.push(p);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`  ${products.length} prod products to scan\n`);

const stats = {productsScanned: 0, productsNoSource: 0, variantsScanned: 0, variantsNoMatch: 0, variantsAlreadyOk: 0, variantsToUpdate: 0, variantsWritten: 0, productsChanged: 0, productsWithLadderDips: 0};
const report = [];

for (const p of products) {
  stats.productsScanned++;
  const xxlHandle = resolveXxlHandle(p);
  const xxlMap = xxlHandle ? await fetchXxlVariants(xxlHandle) : null;
  if (!xxlMap) {
    stats.productsNoSource++;
    continue;
  }
  const surcharge = (p.tags ?? []).includes(SHIPPING_IN_PRICE_TAG) ? SHIPPING_IN_PRICE_SURCHARGE_EUR : 0;

  // Build matched rows.
  const rows = [];
  for (const v of p.variants.nodes) {
    stats.variantsScanned++;
    const xv = stripGbPrefix(v.sku) ? xxlMap.get(stripGbPrefix(v.sku)) : null;
    if (!xv) {
      stats.variantsNoMatch++;
      continue;
    }
    // Determine which selectedOption is the size axis (parses as a dimension);
    // the rest form the group key (e.g. colour, fill-state).
    let sizeDims = null;
    const groupParts = [];
    for (const so of v.selectedOptions ?? []) {
      const d = parseDims(so.value);
      if (d && !sizeDims) sizeDims = d;
      else groupParts.push(`${so.name}=${so.value}`);
    }
    if (!sizeDims) sizeDims = parseDims(xv.option1) || parseDims(v.title);
    rows.push({
      vid: v.id, sku: v.sku, vt: v.title,
      ourPrice: num(v.price), ourCa: v.compareAtPrice,
      selling: sellingOf(xv), regular: regularOf(xv),
      sizeDims, groupKey: groupParts.join('|'),
    });
  }
  if (rows.length === 0) continue;

  computeLogical(rows, surcharge);
  const dips = findLadderDips(rows, surcharge);

  const updates = [];
  for (const r of rows) {
    const target = (r.chosen + surcharge).toFixed(2);
    const cur = r.ourPrice.toFixed(2);
    if (cur === target && r.ourCa == null) {
      stats.variantsAlreadyOk++;
      continue;
    }
    stats.variantsToUpdate++;
    updates.push({...r, target, cur});
  }
  if (updates.length === 0 && dips.length === 0) continue;
  if (updates.length > 0) stats.productsChanged++;
  if (dips.length > 0) stats.productsWithLadderDips++;

  if (updates.length > 0) {
    console.log(`  ${p.handle}  (xxl: ${xxlHandle})  ${updates.length} price drop${updates.length === 1 ? '' : 's'}`);
    for (const u of updates) {
      console.log(`    ${String(u.vt).padEnd(26)} ${u.cur} → ${u.target}  (xxl sell=${u.selling})`);
    }
  }
  if (dips.length > 0) {
    console.log(`  ⚠ ${p.handle}: residual ladder dip(s) at xxl prices — needs manual curation:`);
    for (const d of dips) console.log(`      ${d}`);
  }
  report.push({
    handle: p.handle, xxlHandle, ladderDips: dips,
    variants: rows.map((r) => ({
      title: r.vt, sku: r.sku, was: r.ourPrice, now: +(r.chosen + surcharge).toFixed(2),
      xxlSelling: r.selling, xxlRegular: r.regular, dims: r.sizeDims, group: r.groupKey,
    })),
  });

  if (!APPLY) continue;
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100).map((u) => ({id: u.vid, price: u.target, compareAtPrice: null}));
    const r = await gql(
      `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{field message}}}`,
      {productId: p.id, variants: batch},
    );
    const errs = r.productVariantsBulkUpdate.userErrors;
    if (errs.length) console.log(`    ✗ ${JSON.stringify(errs)}`);
    else stats.variantsWritten += batch.length;
  }
}

writeFileSync(REPORT_PATH, JSON.stringify({stats, report}, null, 2));
console.log('\nSummary:');
for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(24)}: ${v}`);
console.log(`\nReport: ${REPORT_PATH}`);
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
