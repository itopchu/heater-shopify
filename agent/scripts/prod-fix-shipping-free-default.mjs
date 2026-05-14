#!/usr/bin/env node
/**
 * Migrate prod shipping to the "free-default + valve-radiators-paid" model.
 *
 * Policy 2026-05 (revised):
 *   - Default delivery profile: FREE shipping (€0) for DE / NL / BE / LU.
 *   - Custom "Valve radiators" profile: €20/item for the same four zones.
 *     Only the two `konrad-ventilheizkorper-typ-{22,33}` products are
 *     associated with this profile (so they ship at the per-item DHL rate
 *     while every other product ships free).
 *
 * Why this shape:
 *   - Shopify zone-level rate conditions can only gate on price/weight,
 *     not on tags — so a single profile cannot say "free for X, €20 for Y".
 *   - Multiple delivery profiles is the canonical Shopify-native way to
 *     express "this product ships under different rules" without a
 *     Function. Storefront tokens already have read/write_shipping; no
 *     re-auth needed.
 *
 * Idempotent. Run with --apply to write; default is dry-run.
 *
 * Usage:
 *   node agent/scripts/prod-fix-shipping-free-default.mjs              # dry-run
 *   node agent/scripts/prod-fix-shipping-free-default.mjs --apply
 *   node agent/scripts/prod-fix-shipping-free-default.mjs --store dev --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API_VERSION = '2026-04';
const PAID_RATE_EUR = 20;
const PAID_PROFILE_NAME = 'Valve radiators (paid shipping)';
const PAID_PRODUCT_HANDLES = [
  // Renamed 2026-05-14 (Konrad → Aachen rebrand). NOTE this script is now
  // OBSOLETE — the dual-profile model was replaced by the price-bake model
  // (see prod-bake-valve-shipping-into-price.mjs). Kept for rollback only.
  'aachen-ventilheizkorper-typ-22',
  'aachen-ventilheizkorper-typ-33',
];
const COUNTRIES = [
  {code: 'DE', name: 'Germany',     zoneName: 'Germany · DHL'},
  {code: 'NL', name: 'Netherlands', zoneName: 'Netherlands · PostNL'},
  {code: 'BE', name: 'Belgium',     zoneName: 'Belgium · bpost'},
  {code: 'LU', name: 'Luxembourg',  zoneName: 'Luxembourg · Post.lu'},
];
const MANAGED_ZONE_NAMES = new Set(COUNTRIES.map((c) => c.zoneName));

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const APPLY = process.argv.includes('--apply');
const STORE_FLAG = process.argv.includes('--store')
  ? process.argv[process.argv.indexOf('--store') + 1]
  : 'prod';
const SUFFIX = STORE_FLAG === 'dev' ? 'DEV' : 'PROD';
const STORE = process.env[`SHOPIFY_${SUFFIX}_STORE`];
const TOKEN = process.env[`SHOPIFY_${SUFFIX}_ADMIN_TOKEN`];
if (!STORE || !TOKEN) {
  console.error(`Missing SHOPIFY_${SUFFIX}_* env vars`);
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

const PROFILE_FIELDS = `
  id name default
  profileLocationGroups {
    locationGroup { id locations(first: 5) { edges { node { id name } } } }
    locationGroupZones(first: 50) { edges { node {
      zone { id name countries { code { countryCode } } }
      methodDefinitions(first: 10) { edges { node {
        id name active
        rateProvider { ... on DeliveryRateDefinition { id price { amount currencyCode } } }
      }}}
    }}}
  }
`;

function methodName(amount) {
  return amount === 0
    ? 'Free shipping'
    : `Standard delivery (€${amount}/item)`;
}

function buildZoneCreate(country, amount) {
  return {
    name: country.zoneName,
    countries: [{code: country.code, includeAllProvinces: true}],
    methodDefinitionsToCreate: [
      {
        name: methodName(amount),
        active: true,
        rateDefinition: {price: {amount: amount.toFixed(2), currencyCode: 'EUR'}},
      },
    ],
  };
}

async function fetchProfiles() {
  const d = await gql(`{ deliveryProfiles(first: 50) { edges { node { ${PROFILE_FIELDS} } } } }`);
  return d.deliveryProfiles.edges.map((e) => e.node);
}

function describeProfile(p) {
  const lines = [`  ${p.default ? '[DEFAULT] ' : ''}${p.name} (${p.id})`];
  for (const g of p.profileLocationGroups) {
    for (const ze of g.locationGroupZones.edges) {
      const z = ze.node.zone;
      const cs = z.countries.map((c) => c.code.countryCode).join(',');
      lines.push(`    zone "${z.name}" [${cs}]`);
      for (const me of ze.node.methodDefinitions.edges) {
        const md = me.node;
        const pr = md.rateProvider?.price;
        const price = pr ? `${pr.amount} ${pr.currencyCode}` : '(calc/none)';
        lines.push(`      · "${md.name}"  active=${md.active}  price=${price}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Reconcile a profile's zones against COUNTRIES at the target rate.
 * - Deletes any zone not in MANAGED_ZONE_NAMES (e.g. legacy ES, Domestic).
 * - For zones in MANAGED_ZONE_NAMES: ensures exactly one method exists at the target rate.
 * - Creates zones missing from the profile.
 */
async function reconcileProfile(profile, targetAmount, label, dryRun) {
  const ops = [];

  const lg = profile.profileLocationGroups[0];
  if (!lg) throw new Error(`Profile "${profile.name}" has no location group; cannot reconcile.`);
  const locationGroupId = lg.locationGroup.id;

  const existingByName = new Map();
  const zonesToDelete = [];
  for (const ze of lg.locationGroupZones.edges) {
    const z = ze.node.zone;
    if (MANAGED_ZONE_NAMES.has(z.name)) {
      existingByName.set(z.name, {zone: z, methods: ze.node.methodDefinitions.edges.map((m) => m.node)});
    } else {
      zonesToDelete.push(z);
    }
  }

  const zonesToCreate = [];
  const methodUpdates = [];

  for (const c of COUNTRIES) {
    const exist = existingByName.get(c.zoneName);
    if (!exist) {
      zonesToCreate.push(c);
      continue;
    }
    // ensure exactly one method at the target rate
    const wantPrice = targetAmount.toFixed(2);
    const wantName = methodName(targetAmount);
    const matchingExact = exist.methods.find(
      (m) => m.rateProvider?.price?.amount === wantPrice && m.active === true,
    );
    if (matchingExact) {
      // Already correct rate. Optionally fix the name if it drifted.
      if (matchingExact.name !== wantName) {
        methodUpdates.push({
          rateDefinitionId: matchingExact.rateProvider.id,
          methodDefinitionId: matchingExact.id,
          zoneName: c.zoneName,
          newName: wantName,
          newAmount: wantPrice,
          reason: 'rename',
        });
      }
      continue;
    }
    // Either wrong amount or missing method. The cleanest path is to recreate the
    // zone (delete + create) — Shopify's deliveryProfileUpdate can do this in one call.
    methodUpdates.push({
      zoneName: c.zoneName,
      methodDefinitionsToReplace: exist.methods.map((m) => m.id),
      zoneId: exist.zone.id,
      newName: wantName,
      newAmount: wantPrice,
      reason: 'rebuild-method',
    });
  }

  console.log(`\n→ ${label} (${profile.id})`);
  if (zonesToDelete.length > 0) {
    console.log(`  delete legacy zones (${zonesToDelete.length}): ${zonesToDelete.map((z) => z.name).join(', ')}`);
  }
  if (zonesToCreate.length > 0) {
    console.log(`  create zones (${zonesToCreate.length}): ${zonesToCreate.map((c) => `${c.zoneName} @ €${targetAmount}`).join(', ')}`);
  }
  for (const u of methodUpdates) {
    if (u.reason === 'rename') {
      console.log(`  rename method in ${u.zoneName} → "${u.newName}" (price unchanged @ €${u.newAmount})`);
    } else {
      console.log(`  rebuild method in ${u.zoneName} → "${u.newName}" @ €${u.newAmount} (replacing ${u.methodDefinitionsToReplace.length} method(s))`);
    }
  }
  if (zonesToDelete.length === 0 && zonesToCreate.length === 0 && methodUpdates.length === 0) {
    console.log('  ✓ already in target state — no changes needed');
    return;
  }
  if (dryRun) {
    console.log('  (dry-run — re-run with --apply to write)');
    return;
  }

  // Apply: do deletions + creations + rebuilds in one deliveryProfileUpdate where possible.
  const profileInput = {};
  if (zonesToDelete.length > 0) profileInput.zonesToDelete = zonesToDelete.map((z) => z.id);

  // Method rebuilds → easier: delete those zones and re-create them.
  const rebuildZones = methodUpdates.filter((u) => u.reason === 'rebuild-method');
  if (rebuildZones.length > 0) {
    profileInput.zonesToDelete = (profileInput.zonesToDelete || []).concat(rebuildZones.map((u) => u.zoneId));
    for (const u of rebuildZones) {
      // After delete, treat as create
      const country = COUNTRIES.find((c) => c.zoneName === u.zoneName);
      zonesToCreate.push(country);
    }
  }

  if (zonesToCreate.length > 0 || (profileInput.zonesToDelete || []).length > 0) {
    const locationGroupsToUpdate = [];
    if (zonesToCreate.length > 0) {
      locationGroupsToUpdate.push({
        id: locationGroupId,
        zonesToCreate: zonesToCreate.map((c) => buildZoneCreate(c, targetAmount)),
      });
    }
    if (locationGroupsToUpdate.length > 0) profileInput.locationGroupsToUpdate = locationGroupsToUpdate;

    const r = await gql(
      `mutation($id:ID!, $profile:DeliveryProfileInput!){
        deliveryProfileUpdate(id:$id, profile:$profile){
          profile { id }
          userErrors { field message }
        }
      }`,
      {id: profile.id, profile: profileInput},
    );
    const errs = r.deliveryProfileUpdate.userErrors;
    if (errs?.length) throw new Error(`${label} update failed: ${JSON.stringify(errs)}`);
    console.log(`  ✓ applied`);
  }

  // Renames (price unchanged) — handled separately via deliveryRateDefinitionUpdate? Skipped: cosmetic.
  for (const u of methodUpdates.filter((m) => m.reason === 'rename')) {
    console.log(`  (skipping rename of "${u.newName}" — cosmetic only)`);
  }
}

async function findOrCreatePaidProfile(profiles, locationGroupId, dryRun) {
  let paid = profiles.find((p) => p.name === PAID_PROFILE_NAME);
  if (paid) {
    console.log(`\n→ Found existing paid profile: ${paid.name} (${paid.id})`);
    return paid;
  }

  console.log(`\n→ Paid profile "${PAID_PROFILE_NAME}" missing.`);
  if (dryRun) {
    console.log(`  would create with 4 zones (DE/NL/BE/LU) @ €${PAID_RATE_EUR}/item`);
    return null;
  }

  const r = await gql(
    `mutation($p:DeliveryProfileInput!){
      deliveryProfileCreate(profile:$p){
        profile { id name }
        userErrors { field message }
      }
    }`,
    {
      p: {
        name: PAID_PROFILE_NAME,
        locationGroupsToCreate: [
          {
            locations: [locationGroupId],
            zonesToCreate: COUNTRIES.map((c) => buildZoneCreate(c, PAID_RATE_EUR)),
          },
        ],
      },
    },
  );
  const errs = r.deliveryProfileCreate.userErrors;
  if (errs?.length) throw new Error(`Create paid profile failed: ${JSON.stringify(errs)}`);
  console.log(`  ✓ created paid profile ${r.deliveryProfileCreate.profile.id}`);

  // Re-fetch profile (with zones) so the caller sees full structure.
  const refetched = (await fetchProfiles()).find((p) => p.id === r.deliveryProfileCreate.profile.id);
  return refetched;
}

async function fetchPaidProductVariants() {
  const variantIds = [];
  for (const handle of PAID_PRODUCT_HANDLES) {
    const d = await gql(
      `query($h:String!){
        productByHandle(handle:$h){
          id title handle
          variants(first:100){ edges { node { id title } } }
        }
      }`,
      {h: handle},
    );
    const p = d.productByHandle;
    if (!p) {
      console.warn(`  ⚠️  product "${handle}" not found — skipping`);
      continue;
    }
    for (const ve of p.variants.edges) variantIds.push(ve.node.id);
    console.log(`  ${handle}: ${p.variants.edges.length} variant(s)`);
  }
  return variantIds;
}

async function associateVariants(profileId, variantIds, dryRun) {
  if (variantIds.length === 0) {
    console.log('  no variants to associate');
    return;
  }
  console.log(`  associate ${variantIds.length} variant(s) → ${profileId}`);
  if (dryRun) {
    console.log('  (dry-run)');
    return;
  }
  const r = await gql(
    `mutation($id:ID!, $p:DeliveryProfileInput!){
      deliveryProfileUpdate(id:$id, profile:$p){
        profile { id }
        userErrors { field message }
      }
    }`,
    {id: profileId, p: {variantsToAssociate: variantIds}},
  );
  const errs = r.deliveryProfileUpdate.userErrors;
  if (errs?.length) throw new Error(`variantsToAssociate failed: ${JSON.stringify(errs)}`);
  console.log('  ✓ associated');
}

async function main() {
  console.log(`\n${APPLY ? 'APPLY' : 'DRY-RUN'} — store=${STORE}\n`);

  const profilesBefore = await fetchProfiles();
  console.log('=== BEFORE ===');
  for (const p of profilesBefore) console.log(describeProfile(p));

  const defaultProfile = profilesBefore.find((p) => p.default);
  if (!defaultProfile) throw new Error('No default profile found');
  const lg0 = defaultProfile.profileLocationGroups[0];
  if (!lg0) throw new Error('Default profile has no location group');
  const locationId = lg0.locationGroup.locations.edges[0]?.node.id;
  if (!locationId) throw new Error('No location found under default profile location group');

  // 1. Default profile → free
  await reconcileProfile(defaultProfile, 0, 'Default profile (free)', !APPLY);

  // 2. Paid profile (create if missing, then reconcile zones to €20)
  let paidProfile = await findOrCreatePaidProfile(profilesBefore, locationId, !APPLY);
  if (paidProfile) {
    await reconcileProfile(paidProfile, PAID_RATE_EUR, `Paid profile (€${PAID_RATE_EUR}/item)`, !APPLY);
  }

  // 3. Associate the valve radiator products to the paid profile
  console.log(`\n→ Variants for paid products`);
  const paidVariantIds = await fetchPaidProductVariants();
  if (paidProfile && paidVariantIds.length > 0) {
    await associateVariants(paidProfile.id, paidVariantIds, !APPLY);
  } else if (!paidProfile) {
    console.log('  (paid profile was not created in dry-run — variants will be associated on --apply)');
  }

  if (APPLY) {
    console.log('\n=== AFTER ===');
    const after = await fetchProfiles();
    for (const p of after) console.log(describeProfile(p));
  }

  console.log(`\n${APPLY ? 'Done.' : 'Dry-run complete. Re-run with --apply to write.'}`);
  console.log(`Verify at Admin → Settings → Shipping and delivery.`);
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
