/**
 * Create the `fussbodenheizung` (Underfloor heating) collection on prod
 * and attach the single PE-RT pipe product to it.
 *
 * Why this script exists: the homepage tile linking to
 * /collections/fussbodenheizung was 404-ing because the collection had
 * never been seeded on prod (prod-seed-collections.mjs covers other
 * categories with German handles, but not this one). The collection
 * route's SINGLE_PRODUCT_COLLECTIONS allow-list redirects to the only
 * product's PDP, but the redirect cannot fire when the collection
 * itself doesn't exist.
 *
 * Idempotent:
 *   - If the collection exists, only the missing product is added.
 *   - If the product is already attached, the script is a no-op.
 *
 * Flags:
 *   --apply   perform writes (default is dry-run preview)
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

const COLLECTION_HANDLE = 'fussbodenheizung';
const COLLECTION_TITLE = 'Underfloor heating';
const COLLECTION_DESCRIPTION_HTML =
  '<p>Underfloor heating systems and components — PE-RT pipe and matched accessories for wet-system installations.</p>';

const PRODUCT_HANDLE = 'fussbodenheizungsrohr-16x2-mm-pe-rt-5-schicht-rohr-240-m';

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  collection : ${COLLECTION_HANDLE}`);
console.log(`  product    : ${PRODUCT_HANDLE}`);
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

// 1. Look up product (must exist already).
const productData = await gql(
  `query($h:String!) { productByHandle(handle:$h) { id title status } }`,
  {h: PRODUCT_HANDLE},
);
const product = productData.productByHandle;
if (!product) {
  console.log(`✗ product ${PRODUCT_HANDLE} not found on prod — abort`);
  process.exit(1);
}
console.log(`= product   : ${product.title} (${product.status})  ${product.id}`);

// 2. Look up or create collection.
const collectionData = await gql(
  `query($h:String!) {
    collectionByHandle(handle:$h) {
      id title productsCount { count }
      products(first:10) { nodes { id handle } }
    }
  }`,
  {h: COLLECTION_HANDLE},
);
let collection = collectionData.collectionByHandle;

if (!collection) {
  console.log(`+ collection: missing — will create`);
  if (APPLY) {
    const r = await gql(
      `mutation($input:CollectionInput!) {
        collectionCreate(input:$input) {
          collection { id title productsCount { count } products(first:10){nodes{id handle}} }
          userErrors { field message }
        }
      }`,
      {
        input: {
          handle: COLLECTION_HANDLE,
          title: COLLECTION_TITLE,
          descriptionHtml: COLLECTION_DESCRIPTION_HTML,
        },
      },
    );
    const errs = r.collectionCreate.userErrors;
    if (errs.length) throw new Error(JSON.stringify(errs));
    collection = r.collectionCreate.collection;
    console.log(`  ✓ created   ${collection.id}`);
  } else {
    console.log(`  (dry-run — would create)`);
  }
} else {
  console.log(`= collection: exists  ${collection.id}  (${collection.productsCount.count} products)`);
}

// 3. Attach product if missing.
const alreadyAttached =
  collection?.products?.nodes?.some((n) => n.handle === PRODUCT_HANDLE) ?? false;

if (alreadyAttached) {
  console.log(`= product attached already — no-op`);
} else if (!collection) {
  console.log(`+ would add product ${PRODUCT_HANDLE} to newly-created collection`);
} else {
  console.log(`+ adding product ${PRODUCT_HANDLE} to collection`);
}

if (APPLY && collection && !alreadyAttached) {
  const r = await gql(
    `mutation($id:ID!, $productIds:[ID!]!) {
      collectionAddProducts(id:$id, productIds:$productIds) {
        collection { productsCount { count } }
        userErrors { field message }
      }
    }`,
    {id: collection.id, productIds: [product.id]},
  );
  const errs = r.collectionAddProducts.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
  console.log(`  ✓ collection now has ${r.collectionAddProducts.collection.productsCount.count} product(s)`);
}

// 4. Publish to storefront sales channels so the collection is reachable.
if (APPLY && collection) {
  const pubs = await gql(
    `{ publications(first:10){ nodes{ id name } } }`,
  );
  const targets = pubs.publications.nodes.filter((p) =>
    ['Online Store', 'Shop', 'G-Berg'].includes(p.name),
  );
  if (targets.length) {
    const r = await gql(
      `mutation($id:ID!, $input:[PublicationInput!]!) {
        publishablePublish(id:$id, input:$input) {
          userErrors { field message }
        }
      }`,
      {id: collection.id, input: targets.map((t) => ({publicationId: t.id}))},
    );
    const errs = r.publishablePublish.userErrors;
    if (errs.length) console.log(`  publish errors: ${JSON.stringify(errs)}`);
    else console.log(`  ✓ published to ${targets.map((t) => t.name).join(', ')}`);
  }
}

console.log('');
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
