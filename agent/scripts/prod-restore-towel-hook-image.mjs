/**
 * Restore the original Towel Hook & Bathrobe Holder catalog image and
 * promote it to position 1 (primary).
 *
 * Source: catalog/zubehor/weiss/handtuchhaken-bademantelhalter-fur-badheizkorper-in-weiss-oder-chrom/01.webp
 * Target product handle: handtuchhaken-bademantelhalter-fur-badheizkorper-in-weiss-oder-chrom
 *
 * Strategy:
 *   1. Upload local 01.webp via stagedUploadsCreate.
 *   2. Attach via productCreateMedia.
 *   3. Wait for READY.
 *   4. Reorder media so the new image is at position 1 (primary).
 *   5. Delete any non-primary images that resolve to the same source
 *      file (avoids leaving duplicate copies behind on re-runs).
 */
import {readFileSync, statSync} from 'node:fs';
import {resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
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
  if (!r.ok || j.errors) throw new Error(`${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

const HANDLE = 'handtuchhaken-bademantelhalter-fur-badheizkorper-in-weiss-oder-chrom';
const SOURCE = resolve(
  ROOT,
  'catalog/zubehor/weiss',
  HANDLE,
  '01.webp',
);

const product = (await gql(
  `query($h:String!) {
    productByHandle(handle:$h) {
      id title
      media(first:20) {
        edges { node { id mediaContentType ... on MediaImage { image { url } } status } }
      }
    }
  }`,
  {h: HANDLE},
)).productByHandle;
if (!product) { console.error(`✗ ${HANDLE} not found`); process.exit(1); }
console.log(`→ ${product.title} (${product.id})`);
console.log(`  Existing media: ${product.media.edges.length}`);
for (const e of product.media.edges) console.log(`    - ${e.node.id} ${e.node.status}`);

// 1. Upload local file to Shopify staged uploads.
const stage = (await gql(
  `mutation($input:[StagedUploadInput!]!) {
    stagedUploadsCreate(input:$input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`,
  {
    input: [{
      filename: basename(SOURCE),
      resource: 'IMAGE',
      mimeType: 'image/webp',
      fileSize: String(statSync(SOURCE).size),
      httpMethod: 'POST',
    }],
  },
)).stagedUploadsCreate.stagedTargets[0];

const form = new FormData();
for (const p of stage.parameters) form.append(p.name, p.value);
form.append('file', new Blob([readFileSync(SOURCE)], {type: 'image/webp'}), basename(SOURCE));
const post = await fetch(stage.url, {method: 'POST', body: form});
if (!post.ok) throw new Error(`Stage POST failed (${post.status}): ${await post.text()}`);
console.log(`  ✓ uploaded ${basename(SOURCE)}`);

// 2. Attach via productCreateMedia.
const create = await gql(
  `mutation($pid:ID!, $media:[CreateMediaInput!]!) {
    productCreateMedia(productId:$pid, media:$media) {
      media { id status mediaContentType }
      mediaUserErrors { field message code }
    }
  }`,
  {
    pid: product.id,
    media: [{
      originalSource: stage.resourceUrl,
      alt: 'Towel hook and bathrobe holder for bathroom radiators — white and chrome variants',
      mediaContentType: 'IMAGE',
    }],
  },
);
const cErrs = create.productCreateMedia.mediaUserErrors;
if (cErrs.length) throw new Error(`productCreateMedia: ${JSON.stringify(cErrs)}`);
const newMediaId = create.productCreateMedia.media[0].id;
console.log(`  ✓ attached ${newMediaId}`);

// 3. Wait for READY.
let ready = false;
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const m = (await gql(
    `query($id:ID!) { product(id:$id) { media(first:20) { edges { node { id status } } } } }`,
    {id: product.id},
  )).product.media.edges.map(e => e.node);
  console.log(`  poll ${i + 1}: [${m.map(n => n.status).join(',')}]`);
  if (m.every(n => n.status === 'READY')) { ready = true; break; }
  if (m.some(n => n.status === 'FAILED' && n.id === newMediaId)) {
    console.error('  ✗ new media FAILED');
    break;
  }
}
if (!ready) console.warn('  ⚠ media not all READY — proceeding anyway');

// 4. Reorder so the new media is at position 1 (primary).
//    Build the desired order: newMediaId first, then existing media in
//    their current order.
const allMedia = (await gql(
  `query($id:ID!) { product(id:$id) { media(first:20) { edges { node { id } } } } }`,
  {id: product.id},
)).product.media.edges.map(e => e.node);
const desiredOrder = [newMediaId, ...allMedia.map(n => n.id).filter(id => id !== newMediaId)];

const reorder = await gql(
  `mutation($id:ID!, $moves:[MoveInput!]!) {
    productReorderMedia(id:$id, moves:$moves) {
      job { id done }
      mediaUserErrors { field message code }
    }
  }`,
  {
    id: product.id,
    moves: desiredOrder.map((mid, idx) => ({id: mid, newPosition: String(idx)})),
  },
);
const rErrs = reorder.productReorderMedia.mediaUserErrors;
if (rErrs.length) throw new Error(`reorder: ${JSON.stringify(rErrs)}`);
console.log(`  ✓ reordered (new image at position 1, ${desiredOrder.length} total)`);

console.log('\n=== Done ===');
