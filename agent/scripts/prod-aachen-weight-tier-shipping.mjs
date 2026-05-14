#!/usr/bin/env node
/**
 * Aachen valve radiator delivery rebuild (2026-05-14).
 *
 * Old model: €20/unit baked into the product price; everything ships free.
 * New model: prices revert to the xxl base price; the 2 Aachen products move
 * onto a dedicated delivery profile with weight-tier brackets that bill
 * €100 per "8 units" of valve radiator in the cart (1–8 = €100,
 * 9–16 = €200, 17–24 = €300, …). All other products keep free shipping.
 *
 * Implementation: Shopify's native rate engine has no item-count gate, only
 * price/weight. We use weight: every Aachen variant's `inventoryItem.weight`
 * is forced to a uniform 62.5 kg, so 8 units = exactly 500 kg = first
 * bracket. The 62.5 kg figure is internal — customers never see a weight
 * on the storefront (per ops policy).
 *
 * Steps (in safe order — a mid-run failure can't overcharge):
 *   1. Move the 2 Aachen products onto the new "Aachen valve radiators
 *      (paid delivery)" profile FIRST. Until step 4 lands the rate brackets,
 *      this profile inherits the default rate (it's empty), so the customer
 *      sees the safer side (no surcharge yet).
 *   2. Set every Aachen variant's weight to 62.5 kg.
 *   3. Lower every variant's price by €20 and drop the `shipping-in-price`
 *      tag from the products.
 *   4. Configure the new profile with 10 weight-tier method definitions
 *      (€100 → €1000 in 500 kg / 8-unit blocks, on DE/NL/BE/LU).
 *
 * Idempotent: a product already on the new profile / variants already at
 * 62.5 kg / prices already lowered (no `shipping-in-price` tag) are skipped.
 *
 *   node agent/scripts/prod-aachen-weight-tier-shipping.mjs            # dry-run
 *   node agent/scripts/prod-aachen-weight-tier-shipping.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API = '2026-04';
const HANDLES = ['aachen-ventilheizkorper-typ-22', 'aachen-ventilheizkorper-typ-33'];
const PROFILE_NAME = 'Aachen valve radiators (paid delivery)';
const SURCHARGE_EUR = 20;
const UNIFORM_KG = 62.5;
const SHIPPING_TAG = 'shipping-in-price';

// 10 brackets: €100 per 500 kg, capped at 5000 kg / €1000 / 80 units.
const BRACKETS = Array.from({length: 10}, (_, i) => ({
  min: i === 0 ? 0.001 : i * 500 + 0.001,
  max: (i + 1) * 500,
  price: (i + 1) * 100,
}));
const COUNTRIES = [
  {code: 'DE', name: 'Germany',     zoneName: 'Germany · DHL'},
  {code: 'NL', name: 'Netherlands', zoneName: 'Netherlands · PostNL'},
  {code: 'BE', name: 'Belgium',     zoneName: 'Belgium · bpost'},
  {code: 'LU', name: 'Luxembourg',  zoneName: 'Luxembourg · Post.lu'},
];

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

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// === FETCH ===
const products = [];
for (const h of HANDLES) {
  const d = await gql(
    `query($h:String!){
      productByHandle(handle:$h){
        id title handle tags
        variants(first:100){nodes{
          id title price compareAtPrice
          inventoryItem{ id measurement{ weight{ value unit } } }
        }}
      }
    }`, {h});
  if (!d.productByHandle) { console.log(`⚠ ${h} — not found`); continue; }
  products.push(d.productByHandle);
}
const allVariantIds = products.flatMap((p) => p.variants.nodes.map((v) => v.id));
console.log(`Loaded ${products.length} products / ${allVariantIds.length} variants\n`);

// Current default profile + any existing Aachen profile.
const profilesData = await gql(
  `{ deliveryProfiles(first:50){ nodes{
    id name default
    profileLocationGroups{
      locationGroup{ id locations(first:5){ edges{ node{ id name } } } }
      locationGroupZones(first:50){ edges{ node{
        zone{ id name countries{ code{countryCode} } }
        methodDefinitions(first:30){ edges{ node{
          id name active
          rateProvider{ ... on DeliveryRateDefinition{ id price{amount currencyCode} } }
        }}}
      }}}
    }
  }}}`);
const defaultProfile = profilesData.deliveryProfiles.nodes.find((p) => p.default);
let aachenProfile = profilesData.deliveryProfiles.nodes.find((p) => p.name === PROFILE_NAME);
const locationId = defaultProfile.profileLocationGroups[0].locationGroup.locations.edges[0]?.node.id;
console.log(`Default profile: ${defaultProfile.name}`);
console.log(`Aachen profile : ${aachenProfile ? aachenProfile.name + ' (exists)' : '(will create)'}\n`);

function buildZoneCreate(country) {
  // One method definition per bracket, gated by weight conditions.
  const methods = BRACKETS.map((b) => ({
    name: `Standard delivery (€${b.price})`,
    active: true,
    rateDefinition: {price: {amount: b.price.toFixed(2), currencyCode: 'EUR'}},
    weightConditions: [
      {operator: 'GREATER_THAN_OR_EQUAL_TO', criteria: {value: b.min, unit: 'KILOGRAMS'}},
      {operator: 'LESS_THAN_OR_EQUAL_TO',    criteria: {value: b.max, unit: 'KILOGRAMS'}},
    ],
  }));
  return {
    name: country.zoneName,
    countries: [{code: country.code, includeAllProvinces: true}],
    methodDefinitionsToCreate: methods,
  };
}

// === STEP 1: create-or-find the Aachen profile and associate all 55 variants. ===
console.log(`STEP 1 — re-associate ${allVariantIds.length} variants → "${PROFILE_NAME}"`);
if (APPLY) {
  if (!aachenProfile) {
    const r = await gql(
      `mutation($p:DeliveryProfileInput!){
        deliveryProfileCreate(profile:$p){
          profile{ id name }
          userErrors{ field message }
        }
      }`,
      {p: {
        name: PROFILE_NAME,
        locationGroupsToCreate: [{
          locations: [locationId],
          // Create empty zones first (no methods); STEP 4 fills them.
          zonesToCreate: COUNTRIES.map((c) => ({
            name: c.zoneName,
            countries: [{code: c.code, includeAllProvinces: true}],
          })),
        }],
        variantsToAssociate: allVariantIds,
      }});
    if (r.deliveryProfileCreate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileCreate.userErrors));
    console.log(`  ✓ created profile ${r.deliveryProfileCreate.profile.id} with ${allVariantIds.length} variants`);
    // Re-fetch to get the populated profileLocationGroups for STEP 4.
    const refetch = await gql(
      `query($id:ID!){ deliveryProfile(id:$id){
        id name
        profileLocationGroups{
          locationGroup{ id }
          locationGroupZones(first:50){ edges{ node{
            zone{ id name }
            methodDefinitions(first:30){ edges{ node{ id name } } }
          }}}
        }
      }}`, {id: r.deliveryProfileCreate.profile.id});
    aachenProfile = refetch.deliveryProfile;
  } else {
    const r = await gql(
      `mutation($id:ID!,$p:DeliveryProfileInput!){
        deliveryProfileUpdate(id:$id,profile:$p){ profile{id} userErrors{field message} }
      }`,
      {id: aachenProfile.id, p: {variantsToAssociate: allVariantIds}});
    if (r.deliveryProfileUpdate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileUpdate.userErrors));
    console.log(`  ✓ associated ${allVariantIds.length} variants to existing profile`);
  }
} else console.log('  (dry-run)');

// === STEP 2: set weight to 62.5 kg on every variant. ===
console.log(`\nSTEP 2 — set weight = ${UNIFORM_KG} kg on every Aachen variant`);
for (const p of products) {
  const updates = [];
  for (const v of p.variants.nodes) {
    const w = v.inventoryItem?.measurement?.weight;
    if (w && w.unit === 'KILOGRAMS' && Math.abs(w.value - UNIFORM_KG) < 0.001) continue;
    updates.push({id: v.id, inventoryItem: {measurement: {weight: {value: UNIFORM_KG, unit: 'KILOGRAMS'}}}});
  }
  console.log(`  • ${p.handle}: ${updates.length}/${p.variants.nodes.length} variants need weight update`);
  if (!APPLY || updates.length === 0) continue;
  const r = await gql(
    `mutation($pid:ID!,$variants:[ProductVariantsBulkInput!]!){
      productVariantsBulkUpdate(productId:$pid,variants:$variants){ productVariants{id} userErrors{field message} }
    }`, {pid: p.id, variants: updates});
  if (r.productVariantsBulkUpdate.userErrors.length) throw new Error(JSON.stringify(r.productVariantsBulkUpdate.userErrors));
  console.log(`    ✓ updated ${updates.length} variant weights`);
}

// === STEP 3: subtract €20 from each variant's price + drop shipping-in-price tag. ===
console.log(`\nSTEP 3 — subtract €${SURCHARGE_EUR} from variant prices + drop "${SHIPPING_TAG}" tag`);
for (const p of products) {
  const hasTag = p.tags.includes(SHIPPING_TAG);
  if (!hasTag) {
    console.log(`  • ${p.handle}: tag absent — assume already de-baked, skip prices too`);
    continue;
  }
  const priceUpdates = p.variants.nodes.map((v) => ({
    id: v.id,
    price: (Number(v.price) - SURCHARGE_EUR).toFixed(2),
    compareAtPrice: null,
  }));
  console.log(`  • ${p.handle}: ${priceUpdates.length} variants  (e.g. €${p.variants.nodes[0].price} → €${priceUpdates[0].price})`);
  if (!APPLY) continue;
  const rp = await gql(
    `mutation($pid:ID!,$variants:[ProductVariantsBulkInput!]!){
      productVariantsBulkUpdate(productId:$pid,variants:$variants){ productVariants{id} userErrors{field message} }
    }`, {pid: p.id, variants: priceUpdates});
  if (rp.productVariantsBulkUpdate.userErrors.length) throw new Error(JSON.stringify(rp.productVariantsBulkUpdate.userErrors));
  console.log(`    ✓ ${priceUpdates.length} prices updated`);
  await gql(
    `mutation($id:ID!,$tags:[String!]!){ tagsRemove(id:$id,tags:$tags){ userErrors{message} } }`,
    {id: p.id, tags: [SHIPPING_TAG]});
  console.log(`    ✓ removed tag ${SHIPPING_TAG}`);
}

// === STEP 4: build out the weight-tier rate methods on the Aachen profile. ===
console.log(`\nSTEP 4 — populate ${BRACKETS.length} weight-tier methods × ${COUNTRIES.length} zones`);
if (APPLY) {
  // Aachen profile zones may need creating (if we just made an empty profile)
  // OR they may already exist with methods. Strategy: for each managed zone,
  // delete it (kills its methods) then re-create it with our 10 brackets.
  const lg = aachenProfile.profileLocationGroups[0];
  const existingZoneByName = new Map();
  for (const ze of lg.locationGroupZones.edges) {
    existingZoneByName.set(ze.node.zone.name, ze.node.zone.id);
  }
  const zonesToDelete = COUNTRIES.map((c) => existingZoneByName.get(c.zoneName)).filter(Boolean);
  const zonesToCreate = COUNTRIES.map(buildZoneCreate);
  const profileInput = {};
  if (zonesToDelete.length) profileInput.zonesToDelete = zonesToDelete;
  profileInput.locationGroupsToUpdate = [{
    id: lg.locationGroup.id,
    zonesToCreate,
  }];
  const r = await gql(
    `mutation($id:ID!,$p:DeliveryProfileInput!){
      deliveryProfileUpdate(id:$id,profile:$p){ profile{id} userErrors{field message} }
    }`, {id: aachenProfile.id, p: profileInput});
  if (r.deliveryProfileUpdate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileUpdate.userErrors));
  console.log(`  ✓ rebuilt ${zonesToCreate.length} zones with ${BRACKETS.length} brackets each`);
} else {
  console.log(`  (dry-run — would create ${COUNTRIES.length} zones × ${BRACKETS.length} brackets)`);
  console.log(`  brackets: ${BRACKETS.map((b) => `${b.min.toFixed(3)}–${b.max} kg → €${b.price}`).join(', ')}`);
}

console.log(`\n${APPLY ? 'Done.' : 'Dry-run complete. Re-run with --apply.'}`);
