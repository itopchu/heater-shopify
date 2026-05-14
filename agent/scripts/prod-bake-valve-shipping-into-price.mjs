#!/usr/bin/env node
/**
 * Bake the €20 valve-radiator shipping surcharge into the product price.
 *
 * Why: the store is on the Basic plan. No Shopify Function target can change a
 * delivery rate, and CarrierService (calculated rates) needs a higher plan + a
 * hosted callback. So instead of charging €20/item at checkout we add €20 to
 * every valve-radiator variant's price and ship everything free. Customer cost
 * is identical and still per-item (each unit carries its own +€20).
 *
 * Order of operations (chosen so a mid-run failure never overcharges anyone):
 *   1. Re-associate the 55 valve-radiator variants onto the default (free)
 *      delivery profile — kills the €20-at-checkout rate immediately.
 *   2. Raise every variant's `price` by SURCHARGE_EUR (compareAtPrice → null).
 *      Swap the obsolete `shipping:paid` tag for `shipping-in-price` so the
 *      price-sync script knows to re-apply the surcharge after pulling xxl.
 *   3. Delete the now-empty "Valve radiators (paid shipping)" profile.
 *
 * Idempotent: a product already carrying `shipping-in-price` is skipped in
 * step 2 (so re-running won't double-bump prices).
 *
 *   node agent/scripts/prod-bake-valve-shipping-into-price.mjs            # dry-run
 *   node agent/scripts/prod-bake-valve-shipping-into-price.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API = '2026-04';
const SURCHARGE_EUR = 20;
const PAID_PROFILE_NAME = 'Valve radiators (paid shipping)';
// Renamed from `konrad-…` → `aachen-…` on 2026-05-14 (Konrad series → Aachen).
// Old handles still resolve via Shopify URL redirects, but this script looks
// products up by their CURRENT handle.
const HANDLES = ['aachen-ventilheizkorper-typ-22', 'aachen-ventilheizkorper-typ-33'];
const APPLIED_TAG = 'shipping-in-price';
const OBSOLETE_TAG = 'shipping:paid';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes('--apply');
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const EP = `https://${STORE}/admin/api/${API}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(EP, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}  surcharge=€${SURCHARGE_EUR}\n`);

// Load products + variants
const products = [];
for (const handle of HANDLES) {
  const d = await gql(
    `query($h:String!){ productByHandle(handle:$h){ id title handle tags
       variants(first:100){ nodes{ id title price compareAtPrice } } } }`, {h: handle});
  if (!d.productByHandle) { console.log(`  ⚠ ${handle} — not found`); continue; }
  products.push(d.productByHandle);
}
const allVariantIds = products.flatMap((p) => p.variants.nodes.map((v) => v.id));

// Profiles
const profData = await gql(`{ deliveryProfiles(first:50){ nodes{ id name default } } }`);
const defaultProfile = profData.deliveryProfiles.nodes.find((n) => n.default);
const paidProfile = profData.deliveryProfiles.nodes.find((n) => n.name === PAID_PROFILE_NAME);
console.log(`Profiles: default="${defaultProfile?.name}"  paid=${paidProfile ? `"${paidProfile.name}"` : '(none)'}\n`);

// --- STEP 1: variants → default (free) profile ---
console.log(`STEP 1 — re-associate ${allVariantIds.length} variants → default profile`);
if (APPLY && allVariantIds.length) {
  const r = await gql(
    `mutation($id:ID!,$p:DeliveryProfileInput!){ deliveryProfileUpdate(id:$id,profile:$p){ profile{id} userErrors{field message} } }`,
    {id: defaultProfile.id, p: {variantsToAssociate: allVariantIds}});
  if (r.deliveryProfileUpdate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileUpdate.userErrors));
  console.log('  ✓ done — valve radiators now ship on the free profile');
} else console.log('  (dry-run)');

// --- STEP 2: bump prices + swap tags ---
console.log(`\nSTEP 2 — raise variant prices by €${SURCHARGE_EUR}`);
for (const p of products) {
  if (p.tags.includes(APPLIED_TAG)) { console.log(`  • ${p.handle} — already surcharged, skip`); continue; }
  const updates = p.variants.nodes.map((v) => ({id: v.id, price: (Number(v.price) + SURCHARGE_EUR).toFixed(2), compareAtPrice: null}));
  console.log(`  • ${p.title} — ${updates.length} variants  (e.g. €${p.variants.nodes[0].price} → €${updates[0].price})`);
  if (APPLY) {
    const r = await gql(
      `mutation($pid:ID!,$variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid,variants:$variants){ productVariants{id} userErrors{field message} } }`,
      {pid: p.id, variants: updates});
    if (r.productVariantsBulkUpdate.userErrors.length) throw new Error(JSON.stringify(r.productVariantsBulkUpdate.userErrors));
    console.log(`    ✓ ${r.productVariantsBulkUpdate.productVariants.length} variants updated`);
    await gql(`mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id,tags:$tags){ userErrors{message} } }`, {id: p.id, tags: [APPLIED_TAG]});
    await gql(`mutation($id:ID!,$tags:[String!]!){ tagsRemove(id:$id,tags:$tags){ userErrors{message} } }`, {id: p.id, tags: [OBSOLETE_TAG]});
    console.log(`    ✓ tags: +${APPLIED_TAG}  -${OBSOLETE_TAG}`);
  } else console.log('    (dry-run)');
}

// --- STEP 3: delete empty paid profile ---
console.log(`\nSTEP 3 — delete empty "${PAID_PROFILE_NAME}" profile`);
if (paidProfile) {
  if (APPLY) {
    const r = await gql(`mutation($id:ID!){ deliveryProfileRemove(id:$id){ job{id done} userErrors{field message} } }`, {id: paidProfile.id});
    if (r.deliveryProfileRemove.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileRemove.userErrors));
    console.log(`  ✓ removal job queued (${r.deliveryProfileRemove.job?.id ?? 'n/a'})`);
  } else console.log('  (dry-run)');
} else console.log('  (no paid profile — nothing to do)');

console.log(`\n${APPLY ? 'Done.' : 'Dry-run complete. Re-run with --apply.'}`);
