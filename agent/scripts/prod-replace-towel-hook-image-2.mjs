#!/usr/bin/env node
/**
 * Replace image-2 on the Towel Hook & Bathrobe Holder PDP with the
 * Gemini-generated lifestyle scene at:
 *   tmp/towel-hook-regen/2026-05-10T01-37-23/result-gemini-3-pro-image-preview-1.png
 *
 * Workflow:
 *   1. Inspect current media on the product (catalog hero + bad lifestyle).
 *   2. Upload the new PNG via stagedUploadsCreate + multipart POST.
 *   3. Attach via productCreateMedia (becomes a new node at the end).
 *   4. Poll until status=READY.
 *   5. Delete the old image-2 (the 1024x1024 one with the empty-wall scene).
 *   6. Reorder so the new image sits at position 2 (the catalog hero stays
 *      at position 1).
 *
 * Idempotent guard: if the catalog hero or the new image isn't found, the
 * script aborts before any destructive step.
 */
import {readFileSync, statSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;

const HANDLE = 'handtuchhaken-bademantelhalter-fur-badheizkorper-in-weiss-oder-chrom';
const SOURCE = resolve(ROOT, 'tmp', 'towel-hook-regen', '2026-05-10T01-37-23',
  'result-gemini-3-pro-image-preview-1.png');
const NEW_ALT = 'White towel hook clamped onto a heated bathroom towel-rail with a hand towel draped over it';

if (!statSync(SOURCE, {throwIfNoEntry: false})) {
  console.error(`Source image not found: ${SOURCE}`);
  process.exit(1);
}

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

// 0. Inspect current state
const product = (await gql(
  `query($h:String!){productByHandle(handle:$h){id title media(first:20){edges{node{id mediaContentType ... on MediaImage{image{url width height altText}}}}}}}`,
  {h: HANDLE},
)).productByHandle;
if (!product) { console.error(`product ${HANDLE} not found`); process.exit(1); }

console.log(`→ ${product.title} (${product.id})`);
const mediaList = product.media.edges.map(e => e.node);
console.log(`  current media: ${mediaList.length}`);
for (const [i, m] of mediaList.entries()) {
  console.log(`    [${i}] ${m.id}  ${m.image?.width}x${m.image?.height}  alt="${m.image?.altText ?? ''}"`);
}

if (mediaList.length < 2) { console.error('expected ≥2 existing media; aborting'); process.exit(1); }

// The catalog hero is the 1000x1000 image at index 0. The bad lifestyle is the
// 1024x1024 at index 1. Identify by dimensions to avoid relying on order alone.
const heroId = mediaList.find(m => m.image?.width === 1000 && m.image?.height === 1000)?.id;
const badId  = mediaList.find(m => m.image?.width === 1024 && m.image?.height === 1024)?.id;
if (!heroId || !badId) {
  console.error(`expected one 1000² (hero) and one 1024² (bad lifestyle); found:`,
    mediaList.map(m => `${m.image?.width}x${m.image?.height}`));
  process.exit(1);
}
console.log(`  hero (keep)        ${heroId}`);
console.log(`  bad lifestyle (rm) ${badId}`);

// 1. Stage upload
console.log(`\n→ stagedUploadsCreate (${basename(SOURCE)}, ${statSync(SOURCE).size} bytes)`);
const stage = (await gql(
  `mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}userErrors{field message}}}`,
  {input: [{
    filename: basename(SOURCE),
    resource: 'IMAGE',
    mimeType: 'image/png',
    fileSize: String(statSync(SOURCE).size),
    httpMethod: 'POST',
  }]},
)).stagedUploadsCreate.stagedTargets[0];

const form = new FormData();
for (const p of stage.parameters) form.append(p.name, p.value);
form.append('file', new Blob([readFileSync(SOURCE)], {type: 'image/png'}), basename(SOURCE));
const post = await fetch(stage.url, {method: 'POST', body: form});
if (!post.ok) throw new Error(`stage POST ${post.status}: ${await post.text()}`);
console.log(`  ✓ uploaded`);

// 2. Attach
console.log(`\n→ productCreateMedia`);
const created = await gql(
  `mutation($pid:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$pid,media:$media){media{id status mediaContentType}mediaUserErrors{field message code}}}`,
  {pid: product.id, media: [{originalSource: stage.resourceUrl, alt: NEW_ALT, mediaContentType: 'IMAGE'}]},
);
if (created.productCreateMedia.mediaUserErrors.length) {
  throw new Error(JSON.stringify(created.productCreateMedia.mediaUserErrors));
}
const newId = created.productCreateMedia.media[0].id;
console.log(`  ✓ attached ${newId}`);

// 3. Poll for READY
console.log(`\n→ waiting for READY`);
let ready = false;
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const m = (await gql(
    `query($id:ID!){product(id:$id){media(first:20){edges{node{id status}}}}}`,
    {id: product.id},
  )).product.media.edges.map(e => e.node);
  const newM = m.find(n => n.id === newId);
  console.log(`  poll ${i+1}: new=${newM?.status}  all=[${m.map(n=>n.status).join(',')}]`);
  if (newM?.status === 'READY') { ready = true; break; }
  if (newM?.status === 'FAILED') { console.error('  ✗ FAILED'); process.exit(1); }
}
if (!ready) console.warn('  ⚠ not READY after 15 polls; continuing anyway');

// 4. Delete the bad lifestyle image
console.log(`\n→ deleting bad image ${badId}`);
const del = await gql(
  `mutation($pid:ID!,$ids:[ID!]!){productDeleteMedia(productId:$pid,mediaIds:$ids){deletedMediaIds mediaUserErrors{field message code}}}`,
  {pid: product.id, ids: [badId]},
);
if (del.productDeleteMedia.mediaUserErrors.length) {
  throw new Error(JSON.stringify(del.productDeleteMedia.mediaUserErrors));
}
console.log(`  ✓ deleted ${del.productDeleteMedia.deletedMediaIds}`);

// 5. Reorder: hero at 0, new at 1
console.log(`\n→ productReorderMedia`);
const reorder = await gql(
  `mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id done}mediaUserErrors{field message code}}}`,
  {id: product.id, moves: [
    {id: heroId, newPosition: '0'},
    {id: newId,  newPosition: '1'},
  ]},
);
if (reorder.productReorderMedia.mediaUserErrors.length) {
  throw new Error(JSON.stringify(reorder.productReorderMedia.mediaUserErrors));
}
console.log(`  ✓ reordered`);

// 6. Final state
const after = (await gql(
  `query($h:String!){productByHandle(handle:$h){media(first:10){edges{node{id ... on MediaImage{image{url width height altText}}}}}}}`,
  {h: HANDLE},
)).productByHandle.media.edges.map(e => e.node);
console.log(`\n=== Final media (${after.length}) ===`);
for (const [i, m] of after.entries()) {
  console.log(`  [${i}] ${m.id}  ${m.image?.width}x${m.image?.height}  alt="${m.image?.altText ?? ''}"`);
}
console.log(`\nDone.`);
