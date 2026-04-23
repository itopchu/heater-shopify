#!/usr/bin/env node
/**
 * Attach product images from data/images/<handle>/*.{jpg,png,webp} to each
 * product on the dev store.
 *
 * Uses Shopify Admin GraphQL stagedUploadsCreate + productCreateMedia.
 * Idempotent: skips files that are already attached (compared by filename).
 *
 * Replaces the removed attach-product-images.mjs which hotlinked images
 * from xxl-heizung.de (copyright risk).
 *
 * Usage:
 *   1. Drop licensed/AI-rendered images into data/images/<product-handle>/
 *   2. node agent/scripts/attach-product-images-local.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const ACCEPTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');
const IMAGES_DIR = resolve(REPO_ROOT, 'data', 'images');

function loadEnvLocal(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal(ENV_PATH);

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing SHOPIFY_DEV_STORE or SHOPIFY_DEV_ADMIN_TOKEN in .env.local.');
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

function mimeFor(ext) {
  switch (ext) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    default: throw new Error(`Unsupported extension: ${ext}`);
  }
}

async function getProductSnapshot(handle) {
  const data = await gql(
    `query($handle: String!) {
      productByHandle(handle: $handle) {
        id
        media(first: 50) { edges { node { ... on MediaImage { image { altText } } } } }
      }
    }`,
    { handle },
  );
  return data.productByHandle;
}

async function stageUpload(filePath) {
  const ext = extname(filePath).toLowerCase();
  const data = await gql(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          filename: basename(filePath),
          mimeType: mimeFor(ext),
          resource: 'IMAGE',
          httpMethod: 'POST',
        },
      ],
    },
  );
  const errs = data.stagedUploadsCreate.userErrors;
  if (errs.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errs)}`);
  const target = data.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  const blob = new Blob([readFileSync(filePath)], { type: mimeFor(ext) });
  form.append('file', blob, basename(filePath));

  const upload = await fetch(target.url, { method: 'POST', body: form });
  if (!upload.ok) throw new Error(`Upload to staged target failed: ${upload.status} ${await upload.text()}`);

  return target.resourceUrl;
}

async function attachImage(productId, resourceUrl, alt) {
  const data = await gql(
    `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id image { altText } } }
        userErrors { field message }
      }
    }`,
    {
      productId,
      media: [
        {
          alt,
          mediaContentType: 'IMAGE',
          originalSource: resourceUrl,
        },
      ],
    },
  );
  const errs = data.productCreateMedia.userErrors;
  if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
}

function listProductFolders() {
  if (!existsSync(IMAGES_DIR)) return [];
  return readdirSync(IMAGES_DIR)
    .filter((name) => {
      const p = join(IMAGES_DIR, name);
      return statSync(p).isDirectory();
    });
}

function listImages(dir) {
  return readdirSync(dir)
    .filter((f) => ACCEPTED_EXT.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => join(dir, f));
}

async function main() {
  const folders = listProductFolders();
  if (folders.length === 0) {
    console.warn('No product folders found in data/images/. Nothing to upload.');
    console.warn('Add licensed/AI-rendered images per data/images/README.md, then re-run.');
    return;
  }

  console.log(`→ Attaching images from data/images/ to ${folders.length} products on ${STORE}\n`);

  for (const handle of folders) {
    const product = await getProductSnapshot(handle);
    if (!product) {
      console.warn(`  ⚠ Product "${handle}" not found on store. Skipping.`);
      continue;
    }
    const existingAlts = new Set(
      product.media.edges
        .map((e) => e.node?.image?.altText)
        .filter(Boolean),
    );
    const images = listImages(join(IMAGES_DIR, handle));
    if (images.length === 0) {
      console.log(`  ${handle}: no image files in folder.`);
      continue;
    }
    console.log(`  ${handle}: ${images.length} local file(s), ${existingAlts.size} already on product`);
    for (const file of images) {
      const alt = `${handle}-${basename(file)}`;
      if (existingAlts.has(alt)) {
        console.log(`    skip  ${basename(file)} (alt match)`);
        continue;
      }
      const resourceUrl = await stageUpload(file);
      await attachImage(product.id, resourceUrl, alt);
      console.log(`    ok    ${basename(file)}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
