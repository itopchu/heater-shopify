#!/usr/bin/env node
/**
 * Two corrections on the Underfloor Heating Pipe product:
 *
 *   A) Title: was "…16×2 mm, 240 m"; the product label visible in the
 *      image clearly reads "600 m Rolle", so the title is now
 *      "…16×2 mm, 600 m". (The handle still contains "240-m" — left
 *      alone for cached/SEO continuity; redirect not needed since the
 *      handle isn't customer-typed.)
 *
 *   B) Watermark: both gallery images carry a small Gemini sparkle
 *      icon at the bottom-right corner (visible at roughly the lower-
 *      right ~80×80 px in a 1024² frame). We clone-patch a clean piece
 *      of wood floor from a few hundred px to its left over the
 *      watermark area, then re-upload both images and delete the
 *      originals. Both source files in catalog/pe-rt/.../ have the
 *      same watermark — same fix applies if those are ever re-imported.
 *
 * Run: node agent/scripts/prod-fix-pipe-images.mjs           (dry-run)
 *      node agent/scripts/prod-fix-pipe-images.mjs --apply
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

const HANDLE = 'fussbodenheizungsrohr-16x2-mm-pe-rt-5-schicht-rohr-240-m';
const NEW_TITLE = 'Underfloor Heating Pipe (PE-RT 5-Layer), 16×2 mm, 600 m';

// Watermark patch geometry on a 1024×1024 image.
// The Gemini sparkle sits at roughly (945, 945)–(1010, 1010) — a small
// 4-point star in the lower-right. We over-paint a 100×100 region with
// a clean wood-floor patch sourced from far-right-edge (where the
// pedestal doesn't reach), at y=920+ which is pure floor only.
const PATCH_W = 110;
const PATCH_H = 110;
const PATCH_DST_X = 905;   // covers the watermark with a small margin
const PATCH_DST_Y = 905;
// Source: bottom-left floor — also pure wood, well outside the
// pedestal region (pedestal occupies roughly x=320–720).
const PATCH_SRC_X = 30;
const PATCH_SRC_Y = 905;

const TMP_DIR = resolve(ROOT, 'tmp', 'pipe-fix');

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

async function patchOut(buf) {
  const meta = await sharp(buf).metadata();
  // Scale patch geometry if image isn't 1024².
  const scaleX = meta.width / 1024;
  const scaleY = meta.height / 1024;
  const w = Math.round(PATCH_W * scaleX);
  const h = Math.round(PATCH_H * scaleY);
  const dx = Math.round(PATCH_DST_X * scaleX);
  const dy = Math.round(PATCH_DST_Y * scaleY);
  const sx = Math.round(PATCH_SRC_X * scaleX);
  const sy = Math.round(PATCH_SRC_Y * scaleY);

  // Extract the clean patch.
  const patch = await sharp(buf)
    .extract({left: sx, top: sy, width: w, height: h})
    .png()
    .toBuffer();
  // Composite over the watermark area.
  return sharp(buf)
    .composite([{input: patch, left: dx, top: dy}])
    .png()
    .toBuffer();
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// Inspect product
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

// Download + patch
mkdirSync(TMP_DIR, {recursive: true});
const planned = [];
for (const [i, m] of mediaList.entries()) {
  const url = m.image.url;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(resolve(TMP_DIR, `orig-${i+1}.png`), buf);
  const patched = await patchOut(buf);
  const out = resolve(TMP_DIR, `patched-${i+1}.png`);
  writeFileSync(out, patched);
  console.log(`  patched ${i+1}: ${m.image.width}x${m.image.height} (${(patched.length/1024).toFixed(0)} KB)`);
  planned.push({oldId: m.id, altText: m.image.altText, path: out, w: m.image.width, h: m.image.height});
}

if (!APPLY) {
  console.log(`\nDRY RUN. Patched files in ${TMP_DIR}/. Re-run with --apply.`);
  process.exit(0);
}

// Title update
console.log(`\n→ productUpdate (title: "${NEW_TITLE}")`);
const upd = await gql(
  `mutation($p:ProductUpdateInput!){productUpdate(product:$p){product{id title}userErrors{field message}}}`,
  {p: {id: product.id, title: NEW_TITLE}},
);
if (upd.productUpdate.userErrors.length) throw new Error(JSON.stringify(upd.productUpdate.userErrors));
console.log(`  ✓ title updated`);

// Upload + attach
const newIds = [];
for (const p of planned) {
  const fname = basename(p.path);
  const size = readFileSync(p.path).length;
  console.log(`\n→ stagedUploadsCreate (${fname}, ${size} bytes)`);
  const stage = (await gql(
    `mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}userErrors{field message}}}`,
    {input: [{filename: fname, resource: 'IMAGE', mimeType: 'image/png',
      fileSize: String(size), httpMethod: 'POST'}]},
  )).stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const sp of stage.parameters) form.append(sp.name, sp.value);
  form.append('file', new Blob([readFileSync(p.path)], {type: 'image/png'}), fname);
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

// Wait READY
console.log(`\n→ waiting for READY`);
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const m = (await gql(
    `query($id:ID!){product(id:$id){media(first:20){edges{node{id status}}}}}`,
    {id: product.id},
  )).product.media.edges.map(e => e.node);
  const news = m.filter(n => newIds.includes(n.id));
  console.log(`  poll ${i+1}: ${news.map(n=>n.status).join(',')}`);
  if (news.every(n => n.status === 'READY')) break;
  if (news.some(n => n.status === 'FAILED')) { console.error('FAILED'); process.exit(1); }
}

// Delete originals
console.log(`\n→ delete originals`);
const del = await gql(
  `mutation($pid:ID!,$ids:[ID!]!){productDeleteMedia(productId:$pid,mediaIds:$ids){deletedMediaIds mediaUserErrors{field message code}}}`,
  {pid: product.id, ids: planned.map(p => p.oldId)},
);
if (del.productDeleteMedia.mediaUserErrors.length) throw new Error(JSON.stringify(del.productDeleteMedia.mediaUserErrors));
console.log(`  ✓ deleted ${del.productDeleteMedia.deletedMediaIds.length}`);

// Reorder
await gql(
  `mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){mediaUserErrors{field message}}}`,
  {id: product.id, moves: newIds.map((id, idx) => ({id, newPosition: String(idx)}))},
);
console.log(`  ✓ reordered`);
console.log(`\nDone.`);
