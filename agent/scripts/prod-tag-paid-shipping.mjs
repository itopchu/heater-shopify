/**
 * Tag the Ventilheizkörper SKUs on prod with `shipping:paid`.
 *
 * Policy 2026-05: shipping is included in the listed price for most
 * products; only valve radiators (Ventilheizkörper) ship at standard
 * DHL rates. The per-quantity-shipping Function reads this tag at
 * checkout to decide which lines bill shipping (everything else is
 * zeroed to "Shipping included").
 *
 * Idempotent: tagsAdd is a no-op for tags already present. Re-running
 * this script after new Ventilheizkörper SKUs are added will tag them
 * too — extend HANDLES below or call with `--handle <handle>` to add
 * a new product.
 *
 * Flags:
 *   --apply         perform writes (default is dry-run preview)
 *   --handle <h>    tag this specific handle (repeatable)
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
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_STORE / SHOPIFY_PROD_ADMIN_TOKEN');

const APPLY = process.argv.includes('--apply');

const TAG = 'shipping:paid';

// Default product set — the two existing Ventilheizkörper SKUs in the
// catalog. Extend this list (or pass --handle) when new SKUs land.
const DEFAULT_HANDLES = [
  'konrad-ventilheizkorper-typ-22',
  'konrad-ventilheizkorper-typ-33',
];

const cliHandles = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--handle' && process.argv[i + 1]) {
    cliHandles.push(process.argv[i + 1]);
    i++;
  }
}
const HANDLES = cliHandles.length > 0 ? cliHandles : DEFAULT_HANDLES;

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  tag        : ${TAG}`);
console.log(`  candidates : ${HANDLES.join(', ')}`);
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

let tagged = 0, alreadyTagged = 0, missing = 0;

for (const handle of HANDLES) {
  const data = await gql(
    `query($h:String!) {
      productByHandle(handle:$h) {
        id
        title
        tags
      }
    }`,
    {h: handle},
  );
  const product = data.productByHandle;
  if (!product) {
    console.log(`✗ ${handle}  (not found on prod)`);
    missing++;
    continue;
  }
  const has = (product.tags || []).includes(TAG);
  if (has) {
    console.log(`= ${handle}  already tagged "${TAG}"`);
    alreadyTagged++;
    continue;
  }
  if (!APPLY) {
    console.log(`+ ${handle}  would add tag "${TAG}"  (dry-run)`);
    tagged++;
    continue;
  }
  const r = await gql(
    `mutation($id:ID!, $tags:[String!]!) {
      tagsAdd(id:$id, tags:$tags) {
        userErrors { field message }
      }
    }`,
    {id: product.id, tags: [TAG]},
  );
  const errs = r.tagsAdd.userErrors;
  if (errs && errs.length > 0) {
    console.log(`✗ ${handle}  ${JSON.stringify(errs)}`);
  } else {
    console.log(`+ ${handle}  tagged "${TAG}"`);
    tagged++;
  }
}

console.log('');
console.log(`Summary: ${tagged} tagged · ${alreadyTagged} already · ${missing} missing`);
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
