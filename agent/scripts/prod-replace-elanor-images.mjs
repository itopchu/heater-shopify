#!/usr/bin/env node
/**
 * Replace the xxl-CDN images on the recreated Elanor white replacement
 * product with the locally-stored owner-licensed renders. The product
 * was recreated earlier in this session pointing at xxl-heizung's CDN,
 * which violates the policy that no upstream renderings ever land in
 * our store. The local renders live at:
 *   catalog/elanor/weiss/badheizkorper-elmar-weiss-seitlich-offen-rechts-oder-links/
 *
 * Pipeline:
 *   1. stagedUploadsCreate — get pre-signed Shopify Files upload URLs
 *   2. multipart POST each local file to its pre-signed URL
 *   3. productCreateMedia — attach the new resourceUrls to the product
 *   4. productDeleteMedia — remove the xxl-sourced images
 *
 * Usage: node agent/scripts/prod-replace-elanor-images.mjs --apply
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const PRODUCT_HANDLE = 'elanor-replacement-towel-warmer-white';
const LOCAL_DIR = resolve(
  ROOT,
  'catalog/elanor/weiss/badheizkorper-elmar-weiss-seitlich-offen-rechts-oder-links',
);
const LOCAL_FILES = ['01.jpg', '02.jpg', '03.jpg'];

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

// 1. Find product + current media
const p = await gql(`{
  productByHandle(handle:"${PRODUCT_HANDLE}"){
    id title
    media(first:20){ nodes{ id ... on MediaImage{ image{ url } } } }
  }
}`);
const product = p.productByHandle;
if (!product) throw new Error(`Product "${PRODUCT_HANDLE}" not found`);
console.log('Product:', product.id);
console.log('Current media count:', product.media.nodes.length);

if (!APPLY) {
  console.log('\n[dry-run] would upload:');
  for (const f of LOCAL_FILES) console.log(`  - ${resolve(LOCAL_DIR, f)}`);
  process.exit(0);
}

// 2. stagedUploadsCreate
const inputs = LOCAL_FILES.map((f) => ({
  filename: `elanor-replacement-white-${f}`,
  mimeType: 'image/jpeg',
  resource: 'IMAGE',
  fileSize: String(statSync(resolve(LOCAL_DIR, f)).size),
  httpMethod: 'POST',
}));

const staged = await gql(`
  mutation($input:[StagedUploadInput!]!){
    stagedUploadsCreate(input:$input){
      stagedTargets{
        url resourceUrl
        parameters{ name value }
      }
      userErrors{ field message }
    }
  }
`, { input: inputs });
const targets = staged.stagedUploadsCreate.stagedTargets;
const errs = staged.stagedUploadsCreate.userErrors;
if (errs.length) throw new Error(JSON.stringify(errs));
console.log(`✓ Got ${targets.length} staged-upload targets`);

// 3. POST files to staged URLs
for (let i = 0; i < LOCAL_FILES.length; i++) {
  const target = targets[i];
  const file = resolve(LOCAL_DIR, LOCAL_FILES[i]);
  const buf = readFileSync(file);
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), LOCAL_FILES[i]);
  const r = await fetch(target.url, { method: 'POST', body: form });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Upload ${i} failed: ${r.status} ${t.slice(0, 200)}`);
  }
  console.log(`  ✓ Uploaded ${LOCAL_FILES[i]}`);
}

// 4. Attach the new images to the product
const mediaInputs = targets.map((t, i) => ({
  mediaContentType: 'IMAGE',
  originalSource: t.resourceUrl,
  alt: `Elanor — Replacement Towel Warmer, Side Connection, White (${i + 1}/${targets.length})`,
}));
const create = await gql(`
  mutation($pid:ID!, $media:[CreateMediaInput!]!){
    productCreateMedia(productId:$pid, media:$media){
      media{ id ... on MediaImage{ image{ url } } }
      mediaUserErrors{ field message }
    }
  }
`, { pid: product.id, media: mediaInputs });
const me = create.productCreateMedia.mediaUserErrors;
if (me.length) console.log('  warnings:', JSON.stringify(me));
console.log(`✓ Created ${create.productCreateMedia.media.length} new media entries`);

// 5. Delete the old xxl-CDN media
const oldIds = product.media.nodes.map((m) => m.id);
if (oldIds.length) {
  const del = await gql(`
    mutation($pid:ID!, $mediaIds:[ID!]!){
      productDeleteMedia(productId:$pid, mediaIds:$mediaIds){
        deletedMediaIds
        mediaUserErrors{ field message }
      }
    }
  `, { pid: product.id, mediaIds: oldIds });
  const de = del.productDeleteMedia.mediaUserErrors;
  if (de.length) console.log('  delete warnings:', JSON.stringify(de));
  console.log(`✓ Removed ${del.productDeleteMedia.deletedMediaIds.length} old (xxl-sourced) media`);
}

console.log(`\nDone — https://www.gberg-heizung.de/en/products/${PRODUCT_HANDLE}`);
