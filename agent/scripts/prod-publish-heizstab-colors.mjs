/**
 * Publishes the heizstab-white and heizstab-anthracite products to the
 * Online Store + Hydrogen sales channels. Products created via Admin
 * GraphQL `productCreate` are ACTIVE but unpublished by default — they
 * show in Admin but not on the storefront until `publishablePublish`
 * binds them to the relevant publication ids.
 *
 * Idempotent: if a product is already published to a publication, the
 * mutation is a no-op for that pair.
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

// 1. Discover all publications. We publish to every sales channel the
//    Black product is currently published to — that way the new colors
//    are visible on exactly the same surfaces.
const pubsAll = await gql(
  `{ publications(first: 50) { edges { node { id name } } } }`,
);
const allPubs = pubsAll.publications.edges.map((e) => e.node);
console.log('All publications:');
for (const p of allPubs) console.log(`  - ${p.name}  ${p.id}`);

// 2. Find publications that the Black product (handle: heizstab) is published to.
const black = await gql(
  `query($h:String!) {
    productByHandle(handle:$h) {
      id title
      resourcePublicationsV2(first:50) {
        edges { node { publication { id name } isPublished } }
      }
    }
  }`,
  {h: 'heizstab'},
);
const blackPubs = black.productByHandle.resourcePublicationsV2.edges
  .map((e) => e.node)
  .filter((n) => n.isPublished)
  .map((n) => n.publication);
console.log(`\nBlack product is published to ${blackPubs.length} channels:`);
for (const p of blackPubs) console.log(`  - ${p.name}`);

if (blackPubs.length === 0) {
  console.log('\n⚠ Black product is not published anywhere either. Falling back to all publications.');
  blackPubs.push(...allPubs);
}

// 3. Publish each new color to those same channels.
const TARGETS = ['heizstab-white', 'heizstab-anthracite'];
for (const handle of TARGETS) {
  const p = (await gql(
    `query($h:String!) { productByHandle(handle:$h) { id title } }`,
    {h: handle},
  )).productByHandle;
  if (!p) { console.error(`✗ ${handle} not found`); continue; }

  console.log(`\n→ Publishing ${p.title}…`);
  const r = await gql(
    `mutation($id:ID!, $input:[PublicationInput!]!) {
      publishablePublish(id:$id, input:$input) {
        publishable { ... on Product { id } }
        userErrors { field message }
      }
    }`,
    {id: p.id, input: blackPubs.map((pub) => ({publicationId: pub.id}))},
  );
  const errs = r.publishablePublish.userErrors;
  if (errs.length) console.error('  ✗', errs);
  else console.log(`  ✓ published to ${blackPubs.length} channels`);
}

console.log('\nDone.');
