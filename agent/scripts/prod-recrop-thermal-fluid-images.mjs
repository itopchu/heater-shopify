#!/usr/bin/env node
/**
 * Recompose the Thermal Fluid product gallery so the bottle sits centered
 * in frame instead of high. The originals are 896×1200 portraits with a
 * tall window/wall scene above the bottle. The user reported "images are
 * too high" — bottle reads as floating up in the card with empty room
 * above it.
 *
 * Fix: crop ~150px off the top of each image (the upper window/wall
 * area) and re-upload. Net result: 896×1050 with the bottle centered.
 *
 * Workflow:
 *   1. Download both originals via the public Shopify CDN URLs.
 *   2. Crop to 896×1050 (drop top 150px) using sharp.
 *   3. stagedUploadsCreate + multipart POST per image.
 *   4. productCreateMedia for the two cropped versions.
 *   5. Wait READY, delete the two originals, reorder so the bottle
 *      front shot stays at position 1 and the label shot at position 2.
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
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
const APPLY = process.argv.includes('--apply');

const HANDLE = 'thermoflussigkeit-fur-elektro-badheizkorper';
const CROP_TOP_PX = 150;        // drop the upper third — re-balances the bottle into frame
const TMP_DIR = resolve(ROOT, 'tmp', 'thermal-fluid-recrop');

// Lazy import sharp (only needed in apply mode).
async function getSharp() {
  try {
    const mod = await import('sharp');
    return mod.default;
  } catch {
    console.error('sharp not installed. Run: pnpm add -w sharp -D');
    process.exit(1);
  }
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

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// 0. Inspect product
const product = (await gql(
  `query($h:String!){productByHandle(handle:$h){id title media(first:20){edges{node{id mediaContentType ... on MediaImage{image{url width height altText}}}}}}}`,
  {h: HANDLE},
)).productByHandle;
if (!product) { console.error(`product ${HANDLE} not found`); process.exit(1); }
console.log(`→ ${product.title} (${product.id})`);
const mediaList = product.media.edges.map(e => e.node);
for (const [i, m] of mediaList.entries()) {
  console.log(`  [${i}] ${m.id}  ${m.image?.width}x${m.image?.height}  ${m.image?.url}`);
}

if (mediaList.length !== 2) {
  console.error(`expected exactly 2 media; found ${mediaList.length}`);
  process.exit(1);
}

// 1. Download + 2. crop
mkdirSync(TMP_DIR, {recursive: true});
const sharp = await getSharp();
const planned = [];
for (const [i, m] of mediaList.entries()) {
  const url = m.image.url;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const origPath = resolve(TMP_DIR, `orig-${i+1}.png`);
  writeFileSync(origPath, buf);
  const meta = await sharp(buf).metadata();
  const cropTop = CROP_TOP_PX;
  const newH = meta.height - cropTop;
  const cropped = await sharp(buf)
    .extract({left: 0, top: cropTop, width: meta.width, height: newH})
    .png()
    .toBuffer();
  const outPath = resolve(TMP_DIR, `cropped-${i+1}.png`);
  writeFileSync(outPath, cropped);
  console.log(`  cropped ${i+1}: ${meta.width}x${meta.height} → ${meta.width}x${newH} (${(cropped.length/1024).toFixed(0)} KB)`);
  planned.push({
    oldId: m.id,
    altText: m.image.altText,
    cropPath: outPath,
    width: meta.width,
    height: newH,
  });
}

if (!APPLY) {
  console.log(`\nDRY RUN. Cropped files in ${TMP_DIR}/. Re-run with --apply to push.`);
  process.exit(0);
}

// 3. Stage + upload + attach each cropped image
const newIds = [];
for (const p of planned) {
  const fname = basename(p.cropPath);
  const size = readFileSync(p.cropPath).length;
  console.log(`\n→ stagedUploadsCreate (${fname}, ${size} bytes)`);
  const stage = (await gql(
    `mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}userErrors{field message}}}`,
    {input: [{filename: fname, resource: 'IMAGE', mimeType: 'image/png',
      fileSize: String(size), httpMethod: 'POST'}]},
  )).stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const sp of stage.parameters) form.append(sp.name, sp.value);
  form.append('file', new Blob([readFileSync(p.cropPath)], {type: 'image/png'}), fname);
  const post = await fetch(stage.url, {method: 'POST', body: form});
  if (!post.ok) throw new Error(`stage POST ${post.status}: ${await post.text()}`);
  console.log(`  ✓ uploaded`);

  const created = await gql(
    `mutation($pid:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$pid,media:$media){media{id status}mediaUserErrors{field message code}}}`,
    {pid: product.id, media: [{originalSource: stage.resourceUrl, alt: p.altText, mediaContentType: 'IMAGE'}]},
  );
  if (created.productCreateMedia.mediaUserErrors.length) {
    throw new Error(JSON.stringify(created.productCreateMedia.mediaUserErrors));
  }
  newIds.push(created.productCreateMedia.media[0].id);
  console.log(`  ✓ attached ${created.productCreateMedia.media[0].id}`);
}

// 4. Wait for READY on the two new media
console.log(`\n→ waiting for READY on ${newIds.length} new media`);
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const m = (await gql(
    `query($id:ID!){product(id:$id){media(first:20){edges{node{id status}}}}}`,
    {id: product.id},
  )).product.media.edges.map(e => e.node);
  const news = m.filter(n => newIds.includes(n.id));
  console.log(`  poll ${i+1}: ${news.map(n=>n.status).join(',')}`);
  if (news.every(n => n.status === 'READY')) break;
  if (news.some(n => n.status === 'FAILED')) { console.error('one FAILED'); process.exit(1); }
}

// 5. Delete originals
console.log(`\n→ deleting ${planned.length} originals`);
const del = await gql(
  `mutation($pid:ID!,$ids:[ID!]!){productDeleteMedia(productId:$pid,mediaIds:$ids){deletedMediaIds mediaUserErrors{field message code}}}`,
  {pid: product.id, ids: planned.map(p => p.oldId)},
);
if (del.productDeleteMedia.mediaUserErrors.length) {
  throw new Error(JSON.stringify(del.productDeleteMedia.mediaUserErrors));
}
console.log(`  ✓ deleted ${del.productDeleteMedia.deletedMediaIds.length}`);

// 6. Reorder: new images in same position they were created (1, 2)
console.log(`\n→ reorder`);
await gql(
  `mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){mediaUserErrors{field message}}}`,
  {id: product.id, moves: newIds.map((id, idx) => ({id, newPosition: String(idx)}))},
);
console.log(`  ✓ reordered`);

// 7. Final
const after = (await gql(
  `query($h:String!){productByHandle(handle:$h){media(first:10){edges{node{... on MediaImage{id image{url width height}}}}}}}`,
  {h: HANDLE},
)).productByHandle.media.edges.map(e => e.node);
console.log(`\n=== Final media ===`);
for (const [i, m] of after.entries()) console.log(`  [${i}] ${m.id}  ${m.image?.width}x${m.image?.height}`);
console.log(`\nDone.`);
