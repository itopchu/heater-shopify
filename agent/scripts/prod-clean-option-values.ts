/**
 * One-time / idempotent remediation: scrub every product option VALUE on the
 * prod store through normalizeOptionValue() — stripping baked-in availability
 * free-text ("nicht Vorrätig", "Lieferbar ab KW 21", …) and canonicalizing the
 * dimension separator. Real stock state lives in availableForSale, not the
 * value label, so the phrase is removed rather than translated.
 *
 * Mirrors the build-time fix in agent/sync/normalize.ts so the live store and
 * future syncs agree. If a cleaned value would collide with an existing value
 * on the same option, the rename is SKIPPED and logged (manual review needed).
 *
 * Run with tsx so the shared .ts normalizer can be imported:
 *   npx tsx agent/scripts/prod-clean-option-values.ts            # dry-run
 *   npx tsx agent/scripts/prod-clean-option-values.ts --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeOptionValue} from '../sync/normalize-option-value.js';

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

async function gql<T = any>(q: string, v?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN!, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

type Opt = {id: string; name: string; optionValues: Array<{id: string; name: string}>};
type Prod = {id: string; handle: string; options: Opt[]};

const products: Prod[] = [];
let cursor: string | null = null;
while (true) {
  const d = await gql<{products: {pageInfo: {hasNextPage: boolean; endCursor: string}; nodes: Prod[]}}>(
    `query($c:String){products(first:100, after:$c){
      pageInfo{hasNextPage endCursor}
      nodes{ id handle options{ id name optionValues{ id name } } }
    }}`,
    {c: cursor},
  );
  products.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

let scanned = 0;
let renamed = 0;
let skipped = 0;

for (const p of products) {
  for (const o of p.options) {
    const existing = new Set(o.optionValues.map((v) => v.name));
    const updates: Array<{id: string; name: string}> = [];
    for (const v of o.optionValues) {
      scanned++;
      const clean = normalizeOptionValue(v.name);
      if (clean === v.name) continue;
      if (existing.has(clean)) {
        console.log(`  ⚠ ${p.handle} / ${o.name}: "${v.name}" → "${clean}" SKIPPED (collides with existing value)`);
        skipped++;
        continue;
      }
      existing.add(clean);
      updates.push({id: v.id, name: clean});
      console.log(`  ${p.handle} / ${o.name}: "${v.name}" → "${clean}"`);
    }
    if (updates.length === 0) continue;
    renamed += updates.length;
    if (!APPLY) continue;
    const d = await gql<{productOptionUpdate: {userErrors: Array<{field: string[]; message: string}>}}>(
      `mutation($pid:ID!,$opt:OptionUpdateInput!,$vals:[OptionValueUpdateInput!]){
        productOptionUpdate(productId:$pid, option:$opt, optionValuesToUpdate:$vals){
          userErrors{ field message }
        }
      }`,
      {pid: p.id, opt: {id: o.id}, vals: updates},
    );
    const errs = d.productOptionUpdate.userErrors;
    if (errs.length) console.log(`    ✗ ${p.handle} / ${o.name}: ${JSON.stringify(errs)}`);
  }
}

console.log(`\nScanned ${scanned} option values · ${renamed} ${APPLY ? 'renamed' : 'to rename'} · ${skipped} skipped (collision)`);
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
