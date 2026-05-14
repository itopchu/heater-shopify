#!/usr/bin/env node
/**
 * Aachen valve-radiator carrier delivery rebuild.
 *
 * Carrier rule: €100 per 500 kg block of total cart weight on the two Aachen
 * products (was Konrad Typ-22 / Typ-33). Effectively, with a uniform 62.5 kg
 * weight set per variant, that's flat €100 per 1–8 units, €200 per 9–16, etc.
 * Other products are not affected — they continue on the free profile.
 *
 * This script unwinds the previous "+€20 baked into price" workaround
 * (commit f62dde2) and replaces it with native Shopify weight-tier rates on
 * a dedicated delivery profile. End-to-end:
 *
 *   1. For each of the 55 Aachen variants:
 *      - Subtract €20 from `price` (only if product still tagged
 *        `shipping-in-price` — otherwise the price is already the xxl base
 *        and nothing to undo). Force compareAtPrice null.
 *      - Set inventory weight to 62.5 kg (uniform; never customer-visible).
 *   2. Remove `shipping-in-price` and add `shipping-carrier` tag on the two
 *      products, so price-sync stops re-adding €20 and future maintenance
 *      can find them.
 *   3. Find or create the "Aachen carrier delivery (€100 / 500 kg)" delivery
 *      profile. Build 10 weight-bracket methods on each of the four zones
 *      (DE / NL / BE / LU): 0–500 kg → €100, 500.01–1000 kg → €200, …,
 *      4500.01–5000 kg → €1000. (Cap: 80 units / 5000 kg.)
 *   4. Move all 55 variants onto the new profile. Other products remain on
 *      the default free profile.
 *
 * Idempotent on every step:
 *   - price-bake undo: gated on `shipping-in-price` tag
 *   - weight: skipped if already 62.5 kg
 *   - delivery profile: looked up by name; method definitions reconciled by
 *     replacing all of them in one pass
 *   - variant association: re-asserted (Shopify silently no-ops duplicates)
 *
 *   node agent/scripts/prod-aachen-carrier-delivery.mjs            # dry-run
 *   node agent/scripts/prod-aachen-carrier-delivery.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API = '2026-04';
const HANDLES = ['aachen-ventilheizkorper-typ-22', 'aachen-ventilheizkorper-typ-33'];
const SURCHARGE_EUR = 20;             // per-unit shipping that was previously baked into the price
const VARIANT_WEIGHT_KG = 62.5;       // uniform fake weight → 8 units = 500 kg = €100
const PROFILE_NAME = 'Aachen carrier delivery (€100 / 500 kg)';
const COUNTRIES = [
  {code: 'DE', zoneName: 'Germany · DHL'},
  {code: 'NL', zoneName: 'Netherlands · PostNL'},
  {code: 'BE', zoneName: 'Belgium · bpost'},
  {code: 'LU', zoneName: 'Luxembourg · Post.lu'},
];
const BRACKETS = Array.from({length: 10}, (_, i) => ({
  // bracket N (0-indexed i): weight in (i*500, (i+1)*500] kg → price (i+1)*100 EUR
  minKg: i === 0 ? 0.001 : i * 500 + 0.01,
  maxKg: (i + 1) * 500,
  priceEur: (i + 1) * 100,
}));

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

// ---- 1. Load Aachen products (id, tags, variants with price + current weight) ----
const products = [];
for (const handle of HANDLES) {
  const d = await gql(
    `query($q:String!){
      products(first:1, query:$q){
        nodes{
          id title handle tags
          variants(first:100){
            nodes{
              id title price compareAtPrice
              inventoryItem{ id measurement{ weight{ value unit } } }
            }
          }
        }
      }
    }`, {q: `handle:${handle}`});
  if (!d.products.nodes.length) { console.log(`⚠ product ${handle} not found`); continue; }
  products.push(d.products.nodes[0]);
}
const allVariantIds = products.flatMap((p) => p.variants.nodes.map((v) => v.id));
console.log(`Found ${products.length} Aachen products / ${allVariantIds.length} variants\n`);

// ---- STEP 1: undo the +€20 price bake + set uniform weight on every variant ----
console.log(`STEP 1 — undo price bake (-€${SURCHARGE_EUR}) + set ${VARIANT_WEIGHT_KG} kg per variant`);
for (const p of products) {
  const stillBaked = p.tags.includes('shipping-in-price');
  console.log(`  • ${p.handle}  ${stillBaked ? '[still baked → will undo]' : '[already un-baked → price untouched]'}`);
  const variantUpdates = p.variants.nodes.map((v) => {
    const currentKg = v.inventoryItem?.measurement?.weight?.unit === 'KILOGRAMS'
      ? Number(v.inventoryItem.measurement.weight.value)
      : null;
    const needWeight = currentKg !== VARIANT_WEIGHT_KG;
    return {
      id: v.id,
      newPrice: stillBaked ? (Number(v.price) - SURCHARGE_EUR).toFixed(2) : v.price,
      newCompareAt: null,
      needWeight,
    };
  });
  console.log(`    e.g. variant ${p.variants.nodes[0].title}: ${p.variants.nodes[0].price} → ${variantUpdates[0].newPrice}, weight set ${variantUpdates[0].needWeight}`);
  if (!APPLY) continue;
  // productVariantsBulkUpdate handles price + inventoryItem.measurement.weight in one go.
  const input = variantUpdates.map((u) => ({
    id: u.id,
    price: u.newPrice,
    compareAtPrice: u.newCompareAt,
    inventoryItem: {measurement: {weight: {value: VARIANT_WEIGHT_KG, unit: 'KILOGRAMS'}}},
  }));
  const r = await gql(
    `mutation($pid:ID!, $variants:[ProductVariantsBulkInput!]!){
      productVariantsBulkUpdate(productId:$pid, variants:$variants){
        productVariants{ id }
        userErrors{ field message }
      }
    }`, {pid: p.id, variants: input});
  if (r.productVariantsBulkUpdate.userErrors.length) {
    throw new Error(`bulk update ${p.handle}: ${JSON.stringify(r.productVariantsBulkUpdate.userErrors)}`);
  }
  console.log(`    ✓ ${input.length} variants updated`);
}

// ---- STEP 2: tags ----
console.log(`\nSTEP 2 — tag swap: -shipping-in-price  +shipping-carrier`);
for (const p of products) {
  if (!APPLY) { console.log(`  • ${p.handle} (dry-run)`); continue; }
  await gql(`mutation($id:ID!,$tags:[String!]!){tagsAdd(id:$id,tags:$tags){userErrors{message}}}`, {id: p.id, tags: ['shipping-carrier']});
  await gql(`mutation($id:ID!,$tags:[String!]!){tagsRemove(id:$id,tags:$tags){userErrors{message}}}`, {id: p.id, tags: ['shipping-in-price']});
  console.log(`  ✓ ${p.handle}`);
}

// ---- STEP 3: find or create the carrier delivery profile + reconcile its zones/methods ----
console.log(`\nSTEP 3 — delivery profile "${PROFILE_NAME}"`);
const profilesData = await gql(
  `{ deliveryProfiles(first:50){ nodes{
      id name default
      profileLocationGroups{
        locationGroup{ id locations(first:5){ edges{ node{ id name } } } }
        locationGroupZones(first:50){ edges{ node{
          zone{ id name countries{ code{ countryCode } } }
          methodDefinitions(first:30){ edges{ node{ id } } }
        }}}
      }
    }}
  }`);
const defaultProfile = profilesData.deliveryProfiles.nodes.find((n) => n.default);
const defaultLocId = defaultProfile?.profileLocationGroups[0]?.locationGroup?.locations?.edges?.[0]?.node?.id;
let carrierProfile = profilesData.deliveryProfiles.nodes.find((n) => n.name === PROFILE_NAME);

function buildZoneCreate(country) {
  return {
    name: country.zoneName,
    countries: [{code: country.code, includeAllProvinces: true}],
    methodDefinitionsToCreate: BRACKETS.map((b) => ({
      name: 'Standard delivery',
      active: true,
      rateDefinition: {price: {amount: b.priceEur.toFixed(2), currencyCode: 'EUR'}},
      weightConditionsToCreate: [
        {criteria: {value: b.minKg, unit: 'KILOGRAMS'}, operator: 'GREATER_THAN_OR_EQUAL_TO'},
        {criteria: {value: b.maxKg, unit: 'KILOGRAMS'}, operator: 'LESS_THAN_OR_EQUAL_TO'},
      ],
    })),
  };
}

if (!carrierProfile) {
  console.log(`  + creating profile (${BRACKETS.length} brackets × ${COUNTRIES.length} zones = ${BRACKETS.length * COUNTRIES.length} methods)`);
  if (!APPLY) {
    console.log('    (dry-run)');
  } else {
    if (!defaultLocId) throw new Error('No default location id to attach the new profile');
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
          locations: [defaultLocId],
          zonesToCreate: COUNTRIES.map(buildZoneCreate),
        }],
      }});
    if (r.deliveryProfileCreate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileCreate.userErrors));
    carrierProfile = r.deliveryProfileCreate.profile;
    console.log(`    ✓ created ${carrierProfile.id}`);
  }
} else {
  console.log(`  = profile already exists: ${carrierProfile.id}`);
  // Reconcile: nuke existing managed zones and recreate them (cheap to do; few zones).
  const lg = carrierProfile.profileLocationGroups[0];
  const zoneIdsToDelete = lg?.locationGroupZones?.edges?.map((e) => e.node.zone.id) ?? [];
  console.log(`    will reset ${zoneIdsToDelete.length} existing zones and rebuild ${COUNTRIES.length} fresh ones`);
  if (APPLY) {
    const r = await gql(
      `mutation($id:ID!,$p:DeliveryProfileInput!){
        deliveryProfileUpdate(id:$id, profile:$p){ profile{id} userErrors{field message} }
      }`,
      {id: carrierProfile.id, p: {
        zonesToDelete: zoneIdsToDelete,
        locationGroupsToUpdate: [{
          id: lg.locationGroup.id,
          zonesToCreate: COUNTRIES.map(buildZoneCreate),
        }],
      }});
    if (r.deliveryProfileUpdate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileUpdate.userErrors));
    console.log(`    ✓ zones rebuilt`);
  }
}

// ---- STEP 4: associate the 55 Aachen variants with this profile ----
console.log(`\nSTEP 4 — associate ${allVariantIds.length} Aachen variants → "${PROFILE_NAME}"`);
if (APPLY && carrierProfile?.id) {
  const r = await gql(
    `mutation($id:ID!,$p:DeliveryProfileInput!){
      deliveryProfileUpdate(id:$id, profile:$p){ profile{id} userErrors{field message} }
    }`,
    {id: carrierProfile.id, p: {variantsToAssociate: allVariantIds}});
  if (r.deliveryProfileUpdate.userErrors.length) throw new Error(JSON.stringify(r.deliveryProfileUpdate.userErrors));
  console.log(`  ✓ associated`);
} else {
  console.log(`  (dry-run)`);
}

console.log(`\n${APPLY ? 'Done.' : 'Dry-run complete. Re-run with --apply to write.'}`);
