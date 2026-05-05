/**
 * Split the Mounting Kit for Bathroom Radiators (handle:
 * befestigungsset-fur-badheizkorper) into three colorway products,
 * mirroring the heizstab split:
 *
 *   befestigungsset-fur-badheizkorper → Mounting Kit … — Chrome   (existing, mutated)
 *   mounting-kit-anthracite           → Mounting Kit … — Anthracite (cloned)
 *   mounting-kit-white                → Mounting Kit … — White       (cloned)
 *
 * Source product currently has Color [Chrome, Anthracite, White] with one
 * variant per color and a single multi-color group shot. We crop that
 * shot into three color-specific JPGs (see crop-mounting-kit-by-color.mjs)
 * and upload via stagedUploadsCreate so each new product owns its own
 * media (no cross-product CDN refs that fail to ingest).
 *
 * Variant per product: single Color [<one>] option, sku from source
 * (GB-XXL-MS-001/002/003), price €29.90, inventory untracked + CONTINUE
 * so the variant is sellable without an explicit stock count.
 *
 * Idempotent on the create side: skips if the target handle already
 * exists.
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
const APPLY = process.argv.includes('--apply');

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

const SOURCE_HANDLE = 'befestigungsset-fur-badheizkorper';

const PER_COLOR = {
  Chrome: {
    handle:    SOURCE_HANDLE,                   // existing — mutated in place
    title:     'Mounting Kit for Bathroom Radiators — Chrome',
    file:      resolve(ROOT, 'data/mounting-kit-crops/chrome.jpg'),
    alt:       'Mounting kit for bathroom radiators, chrome — product shot',
    sku:       'GB-XXL-MS-001',
    price:     '29.90',
    isExisting: true,
  },
  Anthracite: {
    handle:    'mounting-kit-anthracite',
    title:     'Mounting Kit for Bathroom Radiators — Anthracite',
    file:      resolve(ROOT, 'data/mounting-kit-crops/anthracite.jpg'),
    alt:       'Mounting kit for bathroom radiators, anthracite — product shot',
    sku:       'GB-XXL-MS-002',
    price:     '29.90',
    isExisting: false,
  },
  White: {
    handle:    'mounting-kit-white',
    title:     'Mounting Kit for Bathroom Radiators — White',
    file:      resolve(ROOT, 'data/mounting-kit-crops/white.jpg'),
    alt:       'Mounting kit for bathroom radiators, white — product shot',
    sku:       'GB-XXL-MS-003',
    price:     '29.90',
    isExisting: false,
  },
};

// 1. Snapshot source product.
const src = (await gql(
  `query($h:String!) {
    productByHandle(handle:$h) {
      id title handle status vendor productType tags
      descriptionHtml seo { title description }
      options { id name position values }
      variants(first:50) { edges { node {
        id title sku price selectedOptions { name value }
      } } }
      metafields(first:50) { edges { node { namespace key value type } } }
      collections(first:20) { edges { node { id handle ruleSet { rules { column } } } } }
    }
  }`,
  {h: SOURCE_HANDLE},
)).productByHandle;
if (!src) { console.error(`Source ${SOURCE_HANDLE} not found`); process.exit(1); }

console.log(`→ Source: ${src.title} (${src.id})`);
console.log(`  Options: ${src.options.map(o => `${o.name} [${o.values.join(', ')}]`).join(' · ')}`);
console.log(`  Variants: ${src.variants.edges.length}`);
console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// Metafields to copy (skip media-specific ones, we're swapping images).
const SHARED_MF_KEYS = new Set([
  'media.image_status',
  'custom.copy_status',
  'content.sections_de',
  'custom.subtitle',
  'custom.short_description',
  'seo.primary_keyword',
  'localization.market_visibility',
  'specs.heating_medium',
  'filters.product_type',
  'content.sections_en',
]);
const sharedMetafields = src.metafields.edges
  .map(e => e.node)
  .filter(m => SHARED_MF_KEYS.has(`${m.namespace}.${m.key}`))
  .map(m => ({namespace: m.namespace, key: m.key, value: m.value, type: m.type}));
console.log(`  Shared metafields to copy: ${sharedMetafields.length}`);

const manualCollections = src.collections.edges
  .map(e => e.node)
  .filter(c => !c.ruleSet || c.ruleSet.rules.length === 0)
  .map(c => c.id);
console.log(`  Manual collections to mirror: ${manualCollections.length}`);

// ---------- Helpers ----------
async function uploadStaged(file) {
  const target = {
    filename: basename(file),
    resource: 'IMAGE',
    mimeType: 'image/jpeg',
    fileSize: String(statSync(file).size),
    httpMethod: 'POST',
  };
  const staged = await gql(
    `mutation($input:[StagedUploadInput!]!) {
      stagedUploadsCreate(input:$input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {input: [target]},
  );
  const errs = staged.stagedUploadsCreate.userErrors;
  if (errs.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errs)}`);
  const t = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([readFileSync(file)], {type: 'image/jpeg'}), basename(file));
  const r = await fetch(t.url, {method: 'POST', body: form});
  if (!r.ok) throw new Error(`stage POST failed (${r.status}): ${await r.text()}`);
  return t.resourceUrl;
}

async function attachImage(productId, fileResourceUrl, alt) {
  const r = await gql(
    `mutation($pid:ID!, $media:[CreateMediaInput!]!) {
      productCreateMedia(productId:$pid, media:$media) {
        media { id status }
        mediaUserErrors { field message code }
      }
    }`,
    {pid: productId, media: [{originalSource: fileResourceUrl, alt, mediaContentType: 'IMAGE'}]},
  );
  const errs = r.productCreateMedia.mediaUserErrors;
  if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
  return r.productCreateMedia.media[0];
}

async function deleteAllMedia(productId) {
  const list = await gql(
    `query($id:ID!) { product(id:$id) { media(first:50) { edges { node { id } } } } }`,
    {id: productId},
  );
  const ids = list.product.media.edges.map(e => e.node.id);
  if (!ids.length) return;
  await gql(
    `mutation($pid:ID!, $ids:[ID!]!) {
      productDeleteMedia(productId:$pid, mediaIds:$ids) { deletedMediaIds mediaUserErrors { field message } }
    }`,
    {pid: productId, ids},
  );
}

async function setMetafieldsOn(productId, metafields) {
  if (!metafields.length) return;
  const r = await gql(
    `mutation($mf:[MetafieldsSetInput!]!) {
      metafieldsSet(metafields:$mf) { userErrors { field message code } }
    }`,
    {mf: metafields.map(m => ({...m, ownerId: productId}))},
  );
  const errs = r.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`metafieldsSet: ${JSON.stringify(errs)}`);
}

async function pollMediaReady(productId) {
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const m = (await gql(
      `query($id:ID!) { product(id:$id) { media(first:10) { edges { node { id status } } } } }`,
      {id: productId},
    )).product.media.edges.map(e => e.node);
    const all = m.map(n => n.status).join(',');
    if (m.every(n => n.status === 'READY')) return true;
    if (m.some(n => n.status === 'FAILED')) {
      console.warn(`  ⚠ media status: [${all}]`);
      return false;
    }
  }
  return false;
}

// ---------- 1. Mutate existing → Chrome ----------
async function mutateExistingToChrome() {
  const cfg = PER_COLOR.Chrome;
  console.log(`\n[Chrome] mutating existing product…`);

  if (!APPLY) {
    console.log(`  would: title=${cfg.title}, drop Anthracite+White variants, set Color option=[Chrome] only, replace images with ${basename(cfg.file)}, ensure SKU=${cfg.sku}`);
    return;
  }

  // Title.
  await gql(
    `mutation($input:ProductInput!) {
      productUpdate(input:$input) {
        product { id title }
        userErrors { field message }
      }
    }`,
    {input: {id: src.id, title: cfg.title}},
  );
  console.log(`  ✓ title → "${cfg.title}"`);

  // Delete non-chrome variants.
  const dropIds = src.variants.edges
    .map(e => e.node)
    .filter(v => v.selectedOptions.find(o => o.name === 'Color')?.value !== 'Chrome')
    .map(v => v.id);
  if (dropIds.length) {
    await gql(
      `mutation($pid:ID!, $ids:[ID!]!) {
        productVariantsBulkDelete(productId:$pid, variantsIds:$ids) {
          userErrors { field message }
        }
      }`,
      {pid: src.id, ids: dropIds},
    );
    console.log(`  ✓ deleted ${dropIds.length} non-chrome variants`);
  }

  // Trim Color option to a single value [Chrome] so the dropdown stops
  // offering colors this product no longer owns. productOptionUpdate +
  // optionValuesToDelete handles the orphan values.
  const colorOption = src.options.find(o => o.name === 'Color');
  if (colorOption) {
    // Re-fetch fresh option values (variant deletion could have already
    // removed them on Shopify's side).
    const fresh = (await gql(
      `query($id:ID!) { product(id:$id) { options { id name optionValues { id name } } } }`,
      {id: src.id},
    )).product.options.find(o => o.name === 'Color');
    const orphanIds = fresh.optionValues
      .filter(ov => ov.name !== 'Chrome')
      .map(ov => ov.id);
    if (orphanIds.length) {
      const r = await gql(
        `mutation($pid:ID!, $oid:ID!, $del:[ID!]!) {
          productOptionUpdate(productId:$pid, option:{id:$oid}, optionValuesToDelete:$del, variantStrategy: LEAVE_AS_IS) {
            userErrors { field message code }
          }
        }`,
        {pid: src.id, oid: colorOption.id, del: orphanIds},
      );
      const errs = r.productOptionUpdate.userErrors;
      if (errs.length) console.warn(`  ⚠ option-value delete: ${JSON.stringify(errs)}`);
      else console.log(`  ✓ trimmed Color option to [Chrome]`);
    }
  }

  // SKU on the surviving variant.
  const survivor = src.variants.edges
    .map(e => e.node)
    .find(v => v.selectedOptions.find(o => o.name === 'Color')?.value === 'Chrome');
  if (survivor && survivor.sku !== cfg.sku) {
    await gql(
      `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId:$pid, variants:$vars) {
          productVariants { id sku } userErrors { field message }
        }
      }`,
      {pid: src.id, vars: [{id: survivor.id, inventoryItem: {sku: cfg.sku, tracked: false}, inventoryPolicy: 'CONTINUE'}]},
    );
    console.log(`  ✓ chrome variant sku → ${cfg.sku}, untracked + CONTINUE`);
  } else if (survivor) {
    await gql(
      `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId:$pid, variants:$vars) {
          productVariants { id sku } userErrors { field message }
        }
      }`,
      {pid: src.id, vars: [{id: survivor.id, inventoryItem: {tracked: false}, inventoryPolicy: 'CONTINUE'}]},
    );
    console.log(`  ✓ chrome variant untracked + CONTINUE (sku already ${cfg.sku})`);
  }

  // Replace images.
  await deleteAllMedia(src.id);
  console.log(`  ✓ deleted old media`);
  const url = await uploadStaged(cfg.file);
  await attachImage(src.id, url, cfg.alt);
  console.log(`  ✓ uploaded chrome.jpg`);
  await pollMediaReady(src.id);
}

// ---------- 2. Create Anthracite / White ----------
async function createColorProduct(color) {
  const cfg = PER_COLOR[color];
  console.log(`\n[${color}] creating product…`);

  const existing = (await gql(
    `query($h:String!) { productByHandle(handle:$h) { id title } }`,
    {h: cfg.handle},
  )).productByHandle;
  if (existing) {
    console.log(`  skip — handle "${cfg.handle}" already exists (${existing.id})`);
    return existing.id;
  }
  if (!APPLY) {
    console.log(`  would create handle=${cfg.handle}, title=${cfg.title}, 1 variant SKU=${cfg.sku} €${cfg.price}, 1 image, ${sharedMetafields.length} metafields, mirror collections=${manualCollections.length}`);
    return null;
  }

  const create = await gql(
    `mutation($input:ProductInput!) {
      productCreate(input:$input) {
        product { id title handle }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: cfg.title,
        handle: cfg.handle,
        descriptionHtml: src.descriptionHtml,
        vendor: src.vendor,
        productType: src.productType,
        tags: src.tags,
        status: src.status,
        seo: src.seo,
        productOptions: [
          {name: 'Color', position: 1, values: [{name: color}]},
        ],
      },
    },
  );
  const errs = create.productCreate.userErrors;
  if (errs.length) throw new Error(`productCreate: ${JSON.stringify(errs)}`);
  const pid = create.productCreate.product.id;
  console.log(`  ✓ created ${pid} (${cfg.handle})`);

  // Update auto-created variant with sku/price/inventory.
  const auto = (await gql(
    `query($id:ID!) {
      product(id:$id) {
        variants(first:5) { edges { node { id selectedOptions { name value } } } }
      }
    }`,
    {id: pid},
  )).product.variants.edges.map(e => e.node);
  await gql(
    `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId:$pid, variants:$vars) {
        productVariants { id sku price inventoryItem { tracked } inventoryPolicy }
        userErrors { field message }
      }
    }`,
    {
      pid,
      vars: auto.map(v => ({
        id: v.id,
        price: cfg.price,
        inventoryItem: {tracked: false, sku: cfg.sku},
        inventoryPolicy: 'CONTINUE',
      })),
    },
  );
  console.log(`  ✓ variant sku=${cfg.sku} price=€${cfg.price} untracked + CONTINUE`);

  // Image (staged upload, not cross-CDN ref).
  const url = await uploadStaged(cfg.file);
  await attachImage(pid, url, cfg.alt);
  console.log(`  ✓ uploaded ${basename(cfg.file)}`);

  // Metafields.
  await setMetafieldsOn(pid, sharedMetafields);
  console.log(`  ✓ copied ${sharedMetafields.length} shared metafields`);

  // Collections.
  for (const cid of manualCollections) {
    await gql(
      `mutation($id:ID!, $pids:[ID!]!) {
        collectionAddProducts(id:$id, productIds:$pids) {
          userErrors { field message }
        }
      }`,
      {id: cid, pids: [pid]},
    );
  }
  console.log(`  ✓ added to ${manualCollections.length} manual collection(s)`);

  // Publish to same channels as source.
  const srcPubs = (await gql(
    `query($id:ID!) {
      product(id:$id) {
        resourcePublicationsV2(first:50) {
          edges { node { publication { id } isPublished } }
        }
      }
    }`,
    {id: src.id},
  )).product.resourcePublicationsV2.edges
    .map(e => e.node)
    .filter(n => n.isPublished)
    .map(n => ({publicationId: n.publication.id}));
  if (srcPubs.length) {
    await gql(
      `mutation($id:ID!, $input:[PublicationInput!]!) {
        publishablePublish(id:$id, input:$input) { userErrors { field message } }
      }`,
      {id: pid, input: srcPubs},
    );
    console.log(`  ✓ published to ${srcPubs.length} channels`);
  }

  await pollMediaReady(pid);
  return pid;
}

await mutateExistingToChrome();
await createColorProduct('Anthracite');
await createColorProduct('White');

console.log('\n=== Done ===');
