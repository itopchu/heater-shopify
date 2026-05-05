/**
 * Re-upload Electric Heating Element — Anthracite product images.
 *
 * Why this exists: prod-split-heizstab-by-color.mjs attached two
 * cross-product CDN URLs as media on the new Anthracite product. Shopify's
 * media ingestion couldn't fetch them (status FAILED) — almost certainly
 * because the originalSource URLs include cache-buster query strings
 * tied to the source product's media records.
 *
 * Fix: delete the failed media, then upload the local source files
 * (catalog/heizstab/uncolored/heizstab/0X.jpg) via stagedUploadsCreate
 * and attach those staged URLs via productCreateMedia.
 *
 * Idempotent: safe to re-run; deletes any FAILED media before uploading.
 */
import {readFileSync, statSync, createReadStream} from 'node:fs';
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

const PRODUCT_HANDLE = 'heizstab-anthracite';
const FILES = [
  {
    path: resolve(ROOT, 'catalog/heizstab/uncolored/heizstab/02.jpg'),
    alt: 'Electric heating element, anthracite — product shot',
  },
  {
    path: resolve(ROOT, 'catalog/heizstab/uncolored/heizstab/05.jpg'),
    alt: 'Electric heating element, anthracite — in-room view',
  },
];

const product = (await gql(
  `query($h:String!) {
    productByHandle(handle:$h) {
      id title
      media(first:20) { edges { node { id status mediaContentType } } }
    }
  }`,
  {h: PRODUCT_HANDLE},
)).productByHandle;
if (!product) { console.error(`✗ ${PRODUCT_HANDLE} not found`); process.exit(1); }

console.log(`→ ${product.title} (${product.id})`);
const failed = product.media.edges
  .map(e => e.node)
  .filter(n => n.status !== 'READY')
  .map(n => n.id);
console.log(`  Failed/pending media: ${failed.length}`);

if (failed.length) {
  await gql(
    `mutation($pid:ID!, $ids:[ID!]!) {
      productDeleteMedia(productId:$pid, mediaIds:$ids) {
        deletedMediaIds
        mediaUserErrors { field message }
      }
    }`,
    {pid: product.id, ids: failed},
  );
  console.log(`  ✓ deleted ${failed.length} failed media`);
}

// Stage uploads.
const targets = FILES.map(f => ({
  filename: basename(f.path),
  resource: 'IMAGE',
  mimeType: 'image/jpeg',
  fileSize: String(statSync(f.path).size),
  httpMethod: 'POST',
}));

const staged = await gql(
  `mutation($input:[StagedUploadInput!]!) {
    stagedUploadsCreate(input:$input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`,
  {input: targets},
);
const errs = staged.stagedUploadsCreate.userErrors;
if (errs.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errs)}`);

const uploads = staged.stagedUploadsCreate.stagedTargets;
console.log(`  ✓ staged ${uploads.length} upload targets`);

// POST each file to its staged URL.
for (let i = 0; i < FILES.length; i++) {
  const f = FILES[i];
  const t = uploads[i];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  // Read file fully into a Blob (POST multipart from Node 18+).
  const buf = readFileSync(f.path);
  form.append('file', new Blob([buf], {type: 'image/jpeg'}), basename(f.path));
  const r = await fetch(t.url, {method: 'POST', body: form});
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Stage POST ${i} failed (${r.status}): ${text.slice(0, 200)}`);
  }
  console.log(`  ✓ uploaded ${basename(f.path)} → ${t.resourceUrl}`);
}

// Attach via productCreateMedia using the staged resource URLs.
const create = await gql(
  `mutation($pid:ID!, $media:[CreateMediaInput!]!) {
    productCreateMedia(productId:$pid, media:$media) {
      media { id mediaContentType ... on MediaImage { image { url } } status }
      mediaUserErrors { field message code }
    }
  }`,
  {
    pid: product.id,
    media: FILES.map((f, i) => ({
      originalSource: uploads[i].resourceUrl,
      alt: f.alt,
      mediaContentType: 'IMAGE',
    })),
  },
);
const cErrs = create.productCreateMedia.mediaUserErrors;
if (cErrs.length) throw new Error(`productCreateMedia: ${JSON.stringify(cErrs)}`);
console.log(`  ✓ attached ${create.productCreateMedia.media.length} media records`);

// Poll for READY.
console.log('\nPolling status…');
for (let attempt = 0; attempt < 8; attempt++) {
  await new Promise(r => setTimeout(r, 1500));
  const m = (await gql(
    `query($id:ID!) { product(id:$id) { media(first:10) { edges { node { id status } } } } }`,
    {id: product.id},
  )).product.media.edges.map(e => e.node);
  const summary = m.map(n => n.status).join(',');
  console.log(`  attempt ${attempt + 1}: [${summary}]`);
  if (m.every(n => n.status === 'READY')) { console.log('  ✓ all READY'); break; }
  if (m.some(n => n.status === 'FAILED')) { console.error('  ✗ at least one FAILED'); break; }
}
