/**
 * Reverts the Mounting Kit color split — restores the original single
 * product (befestigungsset-fur-badheizkorper) with Color [Chrome,
 * Anthracite, White] as a buyer choice option, and deletes the two
 * standalone color products.
 *
 * The cropped per-color images turned out unrecognizable at thumbnail
 * size (small mounting brackets seen in isolation lose context), so
 * keeping a single product with the multi-color group shot is the
 * better merchandising decision.
 *
 * Steps:
 *   1. Delete mounting-kit-anthracite and mounting-kit-white products.
 *   2. Re-title the chrome-only product back to "Mounting Kit for
 *      Bathroom Radiators".
 *   3. Add Anthracite + White option values to the Color option.
 *   4. Recreate the Anthracite + White variants with original SKUs.
 *   5. Replace the cropped chrome.jpg with the original group shot
 *      (catalog/befestigungsset/.../01.jpg) and the secondary 02.png.
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

const SOURCE_HANDLE = 'befestigungsset-fur-badheizkorper';
const TO_DELETE_HANDLES = ['mounting-kit-anthracite', 'mounting-kit-white'];
const ORIGINAL_TITLE = 'Mounting Kit for Bathroom Radiators';
const VARIANTS_TO_ADD = [
  {color: 'Anthracite', sku: 'GB-XXL-MS-002', price: '29.90'},
  {color: 'White',      sku: 'GB-XXL-MS-003', price: '29.90'},
];
const PRIMARY_IMAGE = resolve(ROOT, 'catalog/befestigungsset/uncolored/befestigungsset-fur-badheizkorper/01.jpg');
const SECONDARY_IMAGE = resolve(ROOT, 'catalog/befestigungsset/uncolored/befestigungsset-fur-badheizkorper/02.png');

// 1. Delete the two split products.
for (const handle of TO_DELETE_HANDLES) {
  const p = (await gql(
    `query($h:String!) { productByHandle(handle:$h) { id title } }`,
    {h: handle},
  )).productByHandle;
  if (!p) { console.log(`  skip — ${handle} not found`); continue; }
  await gql(
    `mutation($id:ID!) {
      productDelete(input:{id:$id}) {
        deletedProductId
        userErrors { field message }
      }
    }`,
    {id: p.id},
  );
  console.log(`✓ deleted ${p.title} (${handle})`);
}

// 2. Re-title the surviving product back.
const src = (await gql(
  `query($h:String!) {
    productByHandle(handle:$h) {
      id title handle
      options { id name optionValues { id name } }
      variants(first:10) { edges { node { id sku selectedOptions { name value } } } }
      media(first:10) { edges { node { id status mediaContentType } } }
    }
  }`,
  {h: SOURCE_HANDLE},
)).productByHandle;
if (!src) { console.error(`✗ ${SOURCE_HANDLE} not found`); process.exit(1); }
console.log(`\n→ ${src.title} (${src.id})`);

await gql(
  `mutation($input:ProductInput!) {
    productUpdate(input:$input) {
      product { id title }
      userErrors { field message }
    }
  }`,
  {input: {id: src.id, title: ORIGINAL_TITLE}},
);
console.log(`  ✓ retitled to "${ORIGINAL_TITLE}"`);

// 3. Add Anthracite + White back to the Color option.
const colorOption = src.options.find(o => o.name === 'Color');
if (!colorOption) throw new Error('Color option missing on source — cannot reattach values');
const existingValues = new Set(colorOption.optionValues.map(v => v.name));
const valuesToAdd = VARIANTS_TO_ADD
  .map(v => v.color)
  .filter(c => !existingValues.has(c));
if (valuesToAdd.length) {
  const r = await gql(
    `mutation($pid:ID!, $oid:ID!, $add:[OptionValueCreateInput!]) {
      productOptionUpdate(
        productId:$pid,
        option:{id:$oid},
        optionValuesToAdd:$add,
        variantStrategy: LEAVE_AS_IS
      ) {
        userErrors { field message code }
      }
    }`,
    {pid: src.id, oid: colorOption.id, add: valuesToAdd.map(name => ({name}))},
  );
  const errs = r.productOptionUpdate.userErrors;
  if (errs.length) throw new Error(`option add: ${JSON.stringify(errs)}`);
  console.log(`  ✓ added option values: ${valuesToAdd.join(', ')}`);
}

// 4. Recreate the Anthracite + White variants.
const existingVariantColors = new Set(
  src.variants.edges.map(e => e.node.selectedOptions.find(o => o.name === 'Color')?.value),
);
const newVariants = VARIANTS_TO_ADD
  .filter(v => !existingVariantColors.has(v.color))
  .map(v => ({
    price: v.price,
    optionValues: [{optionName: 'Color', name: v.color}],
    inventoryItem: {tracked: false, sku: v.sku},
    inventoryPolicy: 'CONTINUE',
  }));
if (newVariants.length) {
  const r = await gql(
    `mutation($pid:ID!, $vars:[ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId:$pid, variants:$vars) {
        productVariants { id sku title }
        userErrors { field message }
      }
    }`,
    {pid: src.id, vars: newVariants},
  );
  const errs = r.productVariantsBulkCreate.userErrors;
  if (errs.length) throw new Error(`variant create: ${JSON.stringify(errs)}`);
  console.log(`  ✓ created variants: ${r.productVariantsBulkCreate.productVariants.map(v => v.title).join(', ')}`);
}

// 5. Replace cropped image(s) with the original full group shot + secondary.
const oldMediaIds = src.media.edges.map(e => e.node.id);
if (oldMediaIds.length) {
  await gql(
    `mutation($pid:ID!, $ids:[ID!]!) {
      productDeleteMedia(productId:$pid, mediaIds:$ids) {
        deletedMediaIds
        mediaUserErrors { field message }
      }
    }`,
    {pid: src.id, ids: oldMediaIds},
  );
  console.log(`  ✓ deleted ${oldMediaIds.length} cropped media`);
}

async function uploadStaged(file, mime) {
  const t = (await gql(
    `mutation($input:[StagedUploadInput!]!) {
      stagedUploadsCreate(input:$input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {input: [{
      filename: basename(file),
      resource: 'IMAGE',
      mimeType: mime,
      fileSize: String(statSync(file).size),
      httpMethod: 'POST',
    }]},
  )).stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([readFileSync(file)], {type: mime}), basename(file));
  const r = await fetch(t.url, {method: 'POST', body: form});
  if (!r.ok) throw new Error(`stage POST: ${r.status}`);
  return t.resourceUrl;
}

const primaryUrl = await uploadStaged(PRIMARY_IMAGE, 'image/jpeg');
const secondaryUrl = await uploadStaged(SECONDARY_IMAGE, 'image/png');
const create = await gql(
  `mutation($pid:ID!, $media:[CreateMediaInput!]!) {
    productCreateMedia(productId:$pid, media:$media) {
      media { id status }
      mediaUserErrors { field message code }
    }
  }`,
  {
    pid: src.id,
    media: [
      {
        originalSource: primaryUrl,
        alt: 'Mounting kit for bathroom radiators — chrome, anthracite and white variants',
        mediaContentType: 'IMAGE',
      },
      {
        originalSource: secondaryUrl,
        alt: 'Mounting kit for bathroom radiators — anthracite detail',
        mediaContentType: 'IMAGE',
      },
    ],
  },
);
const cErrs = create.productCreateMedia.mediaUserErrors;
if (cErrs.length) throw new Error(`media: ${JSON.stringify(cErrs)}`);
console.log(`  ✓ uploaded original group shot + anthracite detail`);

// Poll for READY.
for (let i = 0; i < 8; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const m = (await gql(
    `query($id:ID!) { product(id:$id) { media(first:10) { edges { node { status } } } } }`,
    {id: src.id},
  )).product.media.edges.map(e => e.node);
  console.log(`  poll ${i + 1}: [${m.map(n => n.status).join(',')}]`);
  if (m.every(n => n.status === 'READY')) break;
  if (m.some(n => n.status === 'FAILED')) { console.error('  ✗ media FAILED'); break; }
}

console.log('\n=== Done ===');
console.log('  Mounting Kit restored as a single product with Color [Chrome, Anthracite, White].');
