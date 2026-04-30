#!/usr/bin/env node
/**
 * Attach owner-licensed product images to each Shopify product, sourced from
 * the product's `media.local_images` metafield (JSON array of paths relative
 * to the project root).
 *
 * Reads from each product on Shopify:
 *   - metafield(namespace:"media", key:"local_images")  → JSON array of paths
 *   - metafield(namespace:"media", key:"image_status")  → "placeholder_needed" | "owner_licensed" | ...
 *   - existing media (to skip already-attached files via altText match)
 *
 * Uploads via stagedUploadsCreate + productCreateMedia. Idempotent.
 *
 * Usage:
 *   node agent/scripts/attach-product-images-local.mjs [options]
 *
 * Options:
 *   --dry-run            Print what would upload, no API writes
 *   --limit <N>          Process only the first N matching products
 *   --handle <handle>    Process only one product by handle
 *   --store dev|prod     Target store (default: dev)
 *   --replace-existing   For each product, DELETE all current MediaImage nodes
 *                        before uploading. Use this when local files were
 *                        regenerated in place (same paths, new content) so
 *                        the altText dedup would otherwise skip them.
 *   --from-catalog-tree  Discover image paths by walking catalog/<...>/<handle>/
 *                        instead of reading the media.local_images metafield.
 *                        The leaf folder name must equal the Shopify product handle.
 *   --create-missing     With --from-catalog-tree: catalog folders whose handle
 *                        has no matching Shopify product get a minimal DRAFT
 *                        product created before image upload (vendor=G-Berg,
 *                        productType=Heater, status=DRAFT). Status stays DRAFT
 *                        so they don't appear on the storefront until reviewed.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const ACCEPTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_BYTES = 20 * 1024 * 1024; // Shopify hard limit
const STAGE_THROTTLE_MS = 250;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

// --- env loader ---------------------------------------------------------
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

// --- args ---------------------------------------------------------------
function parseArgs(argv) {
  const out = { dryRun: false, limit: null, handle: null, store: 'dev' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--handle') out.handle = argv[++i];
    else if (a === '--store') out.store = argv[++i];
    else if (a === '--replace-existing') out.replaceExisting = true;
    else if (a === '--from-catalog-tree') out.fromCatalogTree = true;
    else if (a === '--create-missing') out.createMissing = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node attach-product-images-local.mjs [--dry-run] [--limit N] [--handle <h>] [--store dev|prod] [--replace-existing] [--from-catalog-tree] [--create-missing]');
      process.exit(0);
    }
  }
  if (!['dev', 'prod'].includes(out.store)) {
    console.error(`Invalid --store value: ${out.store}. Must be dev or prod.`);
    process.exit(1);
  }
  if (out.limit !== null && (!Number.isFinite(out.limit) || out.limit <= 0)) {
    console.error(`Invalid --limit value.`);
    process.exit(1);
  }
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));

const STORE = ARGS.store === 'prod' ? process.env.SHOPIFY_PROD_STORE : process.env.SHOPIFY_DEV_STORE;
const TOKEN = ARGS.store === 'prod' ? process.env.SHOPIFY_PROD_ADMIN_TOKEN : process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error(`Missing SHOPIFY_${ARGS.store.toUpperCase()}_STORE or SHOPIFY_${ARGS.store.toUpperCase()}_ADMIN_TOKEN in .env.local.`);
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

// --- helpers ------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  // Throttle / 429 / 502 transient backoff
  const transient = res.status === 429 || res.status >= 500
    || (json.errors && JSON.stringify(json.errors).includes('THROTTLED'));
  if (transient && attempt <= 5) {
    const wait = 500 * Math.pow(2, attempt - 1);
    console.warn(`  ! transient ${res.status}, retrying in ${wait}ms (attempt ${attempt})`);
    await sleep(wait);
    return gql(query, variables, attempt + 1);
  }
  if (!res.ok || json.errors) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

function mimeFor(ext) {
  switch (ext) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    default: throw new Error(`Unsupported extension: ${ext}`);
  }
}

/**
 * ASCII-safe filename for staged upload (Shopify's S3 multipart can choke on
 * some non-ASCII bytes). We preserve the original filename in the alt text.
 */
function asciiSafeName(name) {
  // Manual transliterations for letters that don't decompose via NFD
  let s = name
    .replace(/ß/g, 'ss')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ä/g, 'A').replace(/ä/g, 'a');
  // Decompose remaining accents and strip combining marks
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  // Replace any remaining non-ASCII with '_', collapse repeats
  s = s.replace(/[^\x20-\x7E]/g, '_').replace(/_+/g, '_');
  return s;
}

function buildAlt(filePath, productTitle) {
  // Use the original filename (without extension) so the merchant sees a
  // human-readable label; append product title for accessibility.
  const base = basename(filePath, extname(filePath));
  return `${base} — ${productTitle}`;
}

// --- Shopify queries ----------------------------------------------------
async function fetchAllProducts() {
  const products = [];
  let cursor = null;
  while (true) {
    const data = await gql(
      `query($cursor: String) {
        products(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              handle
              title
              localImages: metafield(namespace: "media", key: "local_images") { value type }
              imageStatus: metafield(namespace: "media", key: "image_status") { value }
              media(first: 50) {
                edges { node { ... on MediaImage { id image { altText url } } } }
              }
            }
          }
        }
      }`,
      { cursor },
    );
    for (const edge of data.products.edges) products.push(edge.node);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}

async function stageUpload(filePath) {
  const ext = extname(filePath).toLowerCase();
  const safeName = asciiSafeName(basename(filePath));
  const fileSize = statSync(filePath).size;

  const data = await gql(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [{
        filename: safeName,
        mimeType: mimeFor(ext),
        resource: 'IMAGE',
        httpMethod: 'POST',
        fileSize: String(fileSize),
      }],
    },
  );
  const errs = data.stagedUploadsCreate.userErrors;
  if (errs.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errs)}`);
  const target = data.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  const blob = new Blob([readFileSync(filePath)], { type: mimeFor(ext) });
  form.append('file', blob, safeName);

  const upload = await fetch(target.url, { method: 'POST', body: form });
  if (!upload.ok) {
    const body = await upload.text();
    throw new Error(`Upload to staged target failed: ${upload.status} ${body.slice(0, 500)}`);
  }
  return target.resourceUrl;
}

/**
 * Walk catalog/ and return [{ handle, paths: [relPath, ...] }, ...] for every
 * leaf directory that contains at least one image file. The leaf directory
 * name is the Shopify product handle.
 */
function discoverCatalogTree() {
  const catalogRoot = resolve(REPO_ROOT, 'catalog');
  const out = [];
  function walk(dir) {
    const entries = readdirSyncSafe(dir);
    const subdirs = [];
    const images = [];
    for (const name of entries) {
      const abs = resolve(dir, name);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) subdirs.push(abs);
      else if (st.isFile() && ACCEPTED_EXT.has(extname(name).toLowerCase())) images.push(abs);
    }
    if (images.length > 0) {
      const handle = basename(dir);
      const paths = images
        .sort((a, b) => a.localeCompare(b))
        .map((p) => p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'));
      out.push({ handle, paths });
    }
    for (const sub of subdirs) walk(sub);
  }
  walk(catalogRoot);
  return out;
}

function readdirSyncSafe(dir) {
  try { return readdirSync(dir); } catch { return []; }
}


/** Humanize a handle into a title. e.g. "badheizkorper-alpha-weiss" → "Badheizkorper Alpha Weiss". */
function humanizeHandle(handle) {
  return handle
    .split(/[-_]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}


/**
 * Create a minimal draft product for a catalog folder that doesn't yet have a
 * Shopify product. Returns the new product { id, handle, title, media: { edges: [] } }.
 */
async function createDraftProduct(handle) {
  const title = humanizeHandle(handle);
  const data = await gql(
    `mutation($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle title }
        userErrors { field message }
      }
    }`,
    {
      input: {
        handle,
        title,
        vendor: 'G-Berg',
        productType: 'Heater',
        status: 'DRAFT',
      },
    },
  );
  const errs = data.productCreate.userErrors;
  if (errs.length) throw new Error(`productCreate(${handle}): ${JSON.stringify(errs)}`);
  const p = data.productCreate.product;
  return { id: p.id, handle: p.handle, title: p.title, media: { edges: [] }, localImages: null, imageStatus: null };
}


async function deleteAllMediaImages(productId, mediaIds) {
  if (mediaIds.length === 0) return 0;
  const data = await gql(
    `mutation($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        userErrors { field message }
      }
    }`,
    { productId, mediaIds },
  );
  const errs = data.productDeleteMedia.userErrors;
  if (errs.length) throw new Error(`productDeleteMedia: ${JSON.stringify(errs)}`);
  return (data.productDeleteMedia.deletedMediaIds || []).length;
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
      media: [{ alt, mediaContentType: 'IMAGE', originalSource: resourceUrl }],
    },
  );
  const errs = data.productCreateMedia.userErrors;
  if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
}

// --- main ---------------------------------------------------------------
function parseLocalImages(metafield) {
  if (!metafield || !metafield.value) return [];
  try {
    const parsed = JSON.parse(metafield.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p === 'string' && p.length > 0);
  } catch {
    return [];
  }
}

async function main() {
  console.log(`-> Attach images on ${STORE} (api ${API_VERSION})${ARGS.dryRun ? ' [DRY RUN]' : ''}`);
  if (ARGS.fromCatalogTree) console.log(`   --from-catalog-tree: ignoring metafield, walking catalog/ directly`);
  if (ARGS.replaceExisting) console.log(`   --replace-existing: existing MediaImage will be deleted before upload`);
  if (ARGS.createMissing) console.log(`   --create-missing: catalog folders without a matching product will get a DRAFT product created`);

  const allProducts = await fetchAllProducts();
  let candidates = allProducts;
  const catalogFoldersMissingProduct = []; // handles in catalog/ that don't match any Shopify product

  if (ARGS.fromCatalogTree) {
    const tree = discoverCatalogTree();
    const productByHandle = new Map(allProducts.map((p) => [p.handle, p]));
    candidates = [];
    for (const { handle, paths } of tree) {
      let product = productByHandle.get(handle);
      if (!product) {
        if (!ARGS.createMissing) {
          catalogFoldersMissingProduct.push(handle);
          continue;
        }
        // Defer creation — we'll create real products lazily inside the loop
        // so that dry-run can also report what would be created.
        product = { _toCreate: true, handle, title: humanizeHandle(handle), media: { edges: [] } };
      }
      product._overridePaths = paths;
      candidates.push(product);
    }
  }

  if (ARGS.handle) candidates = candidates.filter((p) => p.handle === ARGS.handle);
  if (ARGS.limit) candidates = candidates.slice(0, ARGS.limit);

  console.log(`   ${candidates.length} product(s) selected (of ${allProducts.length} on Shopify)`);
  if (ARGS.fromCatalogTree && catalogFoldersMissingProduct.length > 0) {
    console.log(`   ${catalogFoldersMissingProduct.length} catalog folder(s) have no matching Shopify product (use --create-missing to create them)`);
  }
  console.log();

  const report = {
    productsProcessed: 0,
    productsCreated: 0,
    productsSkippedPlaceholder: 0,
    productsSkippedNoMetafield: 0,
    productsWithUploads: 0,
    filesUploaded: 0,
    filesSkippedAlreadyAttached: 0,
    filesMissing: [],
    fileFailures: [],
    bytesUploaded: 0,
    catalogFoldersMissingProduct,
  };

  for (const product of candidates) {
    let { handle, title } = product;
    const status = product.imageStatus?.value;

    // In metafield mode, honor the existing skip rules.
    if (!ARGS.fromCatalogTree) {
      if (status === 'placeholder_needed') {
        console.log(`[skip] ${handle} -- placeholder_needed`);
        report.productsSkippedPlaceholder++;
        continue;
      }
    }

    // Decide which paths to upload from. Override (catalog-tree mode) wins.
    const paths = product._overridePaths
      ? product._overridePaths
      : parseLocalImages(product.localImages);

    if (paths.length === 0) {
      console.log(`[skip] ${handle} -- no local_images metafield`);
      report.productsSkippedNoMetafield++;
      continue;
    }

    // Lazy product creation for catalog folders without a matching product.
    if (product._toCreate) {
      if (ARGS.dryRun) {
        console.log(`[ ok ] ${handle} -- would CREATE draft product (--create-missing)`);
        // In dry-run we don't have a real product.id; carry on with the loop
        // for the path-level reporting using a fake id we won't actually use.
        product.id = 'gid://dry-run/PendingProduct';
      } else {
        const created = await createDraftProduct(handle);
        product.id = created.id;
        product.title = created.title;
        product.media = { edges: [] };
        title = created.title;
        report.productsCreated++;
        console.log(`[ ok ] ${handle} -- created draft product ${created.id}`);
      }
    }

    report.productsProcessed++;

    // --replace-existing: wipe all current MediaImage nodes before upload so
    // re-uploads of same-named regenerated files aren't skipped by altText dedup.
    if (ARGS.replaceExisting) {
      const existingMediaIds = product.media.edges
        .map((e) => e.node?.id)
        .filter(Boolean);
      if (ARGS.dryRun) {
        console.log(`[ ok ] ${handle} -- would delete ${existingMediaIds.length} existing media (--replace-existing)`);
      } else if (existingMediaIds.length > 0) {
        const deleted = await deleteAllMediaImages(product.id, existingMediaIds);
        console.log(`[ ok ] ${handle} -- deleted ${deleted}/${existingMediaIds.length} existing media (--replace-existing)`);
      }
      // Clear the in-memory edges so the dedup set below is empty.
      product.media.edges = [];
    }

    // Build the set of altText values already on the product so we can be idempotent.
    const existingAlts = new Set(
      product.media.edges
        .map((e) => e.node?.image?.altText)
        .filter(Boolean),
    );

    console.log(`[ ok ] ${handle} -- ${paths.length} planned, ${existingAlts.size} already on product`);

    let uploadedForProduct = 0;
    for (const relPath of paths) {
      const absPath = resolve(REPO_ROOT, relPath);
      const fileName = basename(absPath);
      const alt = buildAlt(absPath, title);

      if (!existsSync(absPath)) {
        console.warn(`         ! missing ${relPath}`);
        report.filesMissing.push({ handle, path: relPath });
        continue;
      }

      const ext = extname(absPath).toLowerCase();
      if (!ACCEPTED_EXT.has(ext)) {
        console.warn(`         ! skip (unsupported ext) ${relPath}`);
        report.fileFailures.push({ handle, path: relPath, reason: `unsupported ext ${ext}` });
        continue;
      }

      let size = 0;
      try { size = statSync(absPath).size; } catch {}
      if (size > MAX_FILE_BYTES) {
        console.warn(`         ! skip (>${MAX_FILE_BYTES} bytes) ${relPath}`);
        report.fileFailures.push({ handle, path: relPath, reason: `file too large (${size} bytes)` });
        continue;
      }

      if (existingAlts.has(alt)) {
        console.log(`         . skip already-attached ${fileName}`);
        report.filesSkippedAlreadyAttached++;
        continue;
      }

      if (ARGS.dryRun) {
        console.log(`         + would upload ${fileName} (${size} bytes) alt="${alt}"`);
        report.filesUploaded++; // count planned uploads
        report.bytesUploaded += size;
        uploadedForProduct++;
        continue;
      }

      try {
        const resourceUrl = await stageUpload(absPath);
        await attachImage(product.id, resourceUrl, alt);
        existingAlts.add(alt);
        report.filesUploaded++;
        report.bytesUploaded += size;
        uploadedForProduct++;
        console.log(`         + uploaded ${fileName} (${size} bytes)`);
        await sleep(STAGE_THROTTLE_MS);
      } catch (err) {
        console.error(`         x failed ${fileName}: ${err.message}`);
        report.fileFailures.push({ handle, path: relPath, reason: err.message });
      }
    }

    if (uploadedForProduct > 0) report.productsWithUploads++;
  }

  // --- Final report ----------------------------------------------------
  console.log('\n=== Final report ===');
  console.log(`Store:                            ${STORE}${ARGS.dryRun ? '  [DRY RUN]' : ''}`);
  console.log(`Products selected:                ${candidates.length}`);
  console.log(`Products processed (had photos):  ${report.productsProcessed}`);
  console.log(`Products created (draft):         ${report.productsCreated}`);
  console.log(`Products skipped (placeholder):   ${report.productsSkippedPlaceholder}`);
  console.log(`Products skipped (no metafield):  ${report.productsSkippedNoMetafield}`);
  console.log(`Products with new uploads:        ${report.productsWithUploads}`);
  console.log(`Files ${ARGS.dryRun ? 'planned' : 'uploaded'}:                  ${report.filesUploaded}`);
  console.log(`Files skipped (already attached): ${report.filesSkippedAlreadyAttached}`);
  console.log(`Files missing on disk:            ${report.filesMissing.length}`);
  console.log(`File failures:                    ${report.fileFailures.length}`);
  console.log(`Bytes ${ARGS.dryRun ? 'planned' : 'uploaded'}:                  ${report.bytesUploaded.toLocaleString()} (${(report.bytesUploaded / 1024 / 1024).toFixed(2)} MB)`);

  if (report.filesMissing.length) {
    console.log('\n-- Missing files --');
    for (const m of report.filesMissing) console.log(`  ${m.handle}: ${m.path}`);
  }
  if (report.fileFailures.length) {
    console.log('\n-- File failures --');
    for (const f of report.fileFailures) console.log(`  ${f.handle}: ${f.path}\n    ${f.reason}`);
  }
  if (report.catalogFoldersMissingProduct?.length) {
    console.log(`\n-- Catalog folders with no matching Shopify product (${report.catalogFoldersMissingProduct.length}) --`);
    console.log('   (use --create-missing to create DRAFT products for these)');
    for (const h of report.catalogFoldersMissingProduct) console.log(`  ${h}`);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
