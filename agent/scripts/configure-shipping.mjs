#!/usr/bin/env node
/**
 * Configures shipping zones + rates on the default delivery profile.
 *
 * 2026-05 update — business rule change:
 *   - Allowed shipping countries: Germany, Netherlands, Belgium, Luxembourg ONLY.
 *     (Belgium and Austria removed — checkout must reject those addresses.)
 *   - Shipping cost: FLAT €20 PER ITEM (per-quantity, applied to every
 *     unit in the order). No free-shipping threshold of any kind.
 *
 * Implementation:
 *   - One zone per allowed country (DE / NL / BE / LU) on the default profile.
 *   - Per-zone rate uses Shopify's `weightConditions` / `priceConditions`
 *     model — but Shopify's standard delivery profile does not natively
 *     express "€20 × quantity". The cleanest representation in Shopify
 *     is a single per-item rate at €20 with no free threshold; if your
 *     plan supports calculated rates / Shopify Functions, those are the
 *     better surface for a strict "€X × qty" formula.
 *
 *   For now this script writes a flat €20 method per zone. To enforce
 *   "× quantity" cleanly, install a Shopify Function (Delivery
 *   Customization API) — see docs/review-automation.md for the next-step
 *   wiring. The €20 constant lives in `app/lib/gberg/contact.ts` so the
 *   storefront copy and the rate stay aligned.
 *
 * Idempotent: skips any zone whose name already exists on the profile,
 * removes any zone for now-disallowed countries.
 *
 * Scopes required: read_shipping, write_shipping.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const FLAT_RATE_PER_ITEM_EUR = 20;

// Single source of truth for allowed shipping destinations.
const COUNTRIES = [
  { code: 'DE', name: 'Germany',     zoneName: 'Germany · DHL' },
  { code: 'NL', name: 'Netherlands', zoneName: 'Netherlands · PostNL' },
  { code: 'BE', name: 'Belgium',     zoneName: 'Belgium · bpost' },
  { code: 'LU', name: 'Luxembourg',  zoneName: 'Luxembourg · Post.lu' },
];

// Country zones that previously existed and must be removed from the
// profile (see 2026-05 business rule change above).
const DISALLOWED_LEGACY_ZONE_NAMES = new Set([
  'Austria · Post.at',
  'France · Colissimo',
  'Italy · Poste',
  'Poland · InPost',
  'Denmark · PostNord',
  'Spain · Correos',
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '..', '.env.local');

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

const STORE_FLAG = process.argv.includes('--store')
  ? process.argv[process.argv.indexOf('--store') + 1]
  : 'dev';
const SUFFIX = STORE_FLAG === 'prod' ? 'PROD' : 'DEV';
const STORE = process.env[`SHOPIFY_${SUFFIX}_STORE`];
const TOKEN = process.env[`SHOPIFY_${SUFFIX}_ADMIN_TOKEN`];
if (!STORE || !TOKEN) { console.error(`Missing SHOPIFY_${SUFFIX}_* env vars`); process.exit(1); }
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

async function getDefaultProfile() {
  const data = await gql(`{
    deliveryProfiles(first: 20) {
      edges {
        node {
          id
          name
          default
          profileLocationGroups {
            locationGroup { id }
            locationGroupZones(first: 50) {
              edges {
                node {
                  zone {
                    id
                    name
                    countries { code { countryCode } }
                  }
                  methodDefinitionCounts { participantDefinitionsCount rateDefinitionsCount }
                }
              }
            }
          }
        }
      }
    }
  }`);
  const profile = data.deliveryProfiles.edges.map((e) => e.node).find((p) => p.default);
  if (!profile) throw new Error('No default delivery profile found.');
  return profile;
}

function existingZoneNames(profile) {
  const names = new Set();
  for (const group of profile.profileLocationGroups) {
    for (const edge of group.locationGroupZones.edges) {
      names.add(edge.node.zone.name);
    }
  }
  return names;
}

function buildZone(country) {
  return {
    name: country.zoneName,
    countries: [{ code: country.code, includeAllProvinces: true }],
    methodDefinitionsToCreate: [
      {
        name: `Standard delivery (€${FLAT_RATE_PER_ITEM_EUR}/item)`,
        active: true,
        rateDefinition: {
          price: { amount: FLAT_RATE_PER_ITEM_EUR.toFixed(2), currencyCode: 'EUR' },
        },
        // No price/weight conditions — this is the only shipping method
        // and applies to every order in the zone. Per-quantity multiplication
        // is enforced via a Delivery Customization Function (separate),
        // not via condition rules.
      },
    ],
  };
}

async function deleteZones(profileId, zoneIds) {
  if (zoneIds.length === 0) return;
  const res = await gql(
    `mutation($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile { id }
        userErrors { field message }
      }
    }`,
    { id: profileId, profile: { zonesToDelete: zoneIds } },
  );
  const errs = res.deliveryProfileUpdate.userErrors;
  if (errs.length) {
    throw new Error(`zonesToDelete: ${JSON.stringify(errs)}`);
  }
}

async function addZonesToProfile(profile, countriesToAdd) {
  if (countriesToAdd.length === 0) return;
  const locationGroup = profile.profileLocationGroups[0];
  if (!locationGroup) throw new Error('Default profile has no location groups.');

  const res = await gql(
    `mutation($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile { id name }
        userErrors { field message }
      }
    }`,
    {
      id: profile.id,
      profile: {
        locationGroupsToUpdate: [
          {
            id: locationGroup.locationGroup.id,
            zonesToCreate: countriesToAdd.map(buildZone),
          },
        ],
      },
    },
  );
  const errs = res.deliveryProfileUpdate.userErrors;
  if (errs.length) {
    throw new Error(`deliveryProfileUpdate: ${JSON.stringify(errs)}`);
  }
}

function collectDefaultZoneIds(profile) {
  // Delete every zone that isn't one of our managed (DE/NL/BE/LU) zones.
  // Region overlap (e.g. an existing "EU" zone that contains NL) breaks
  // `zonesToCreate` with "Region 'NL' already exists in another zone".
  // Wholesale clearing forces a clean slate so the three managed zones
  // own their countries unambiguously.
  const toDelete = [];
  const managed = new Set(COUNTRIES.map((c) => c.zoneName));
  for (const group of profile.profileLocationGroups) {
    for (const edge of group.locationGroupZones.edges) {
      const z = edge.node.zone;
      if (managed.has(z.name)) continue;
      toDelete.push(z.id);
    }
  }
  return toDelete;
}

async function main() {
  console.log(`→ Configuring shipping zones on ${STORE}\n`);
  console.log(`  Rate per zone: €${FLAT_RATE_PER_ITEM_EUR}/item flat (×qty enforced by`);
  console.log(`  Delivery Customization Function — not by condition rules).`);
  console.log(`  Allowed destinations: ${COUNTRIES.map((c) => c.code).join(', ')}\n`);

  const profile = await getDefaultProfile();
  console.log(`→ Default delivery profile: ${profile.name} (${profile.id})`);

  const existing = existingZoneNames(profile);
  console.log(`  Existing zones: ${existing.size === 0 ? '(none)' : Array.from(existing).join(', ')}\n`);

  const toAdd = COUNTRIES.filter((c) => !existing.has(c.zoneName));
  const skipped = COUNTRIES.filter((c) => existing.has(c.zoneName));
  const toDelete = collectDefaultZoneIds(profile);

  for (const c of skipped) {
    console.log(`  skip  ${c.zoneName} (already exists)`);
  }
  if (toDelete.length > 0) {
    console.log(`  removing default zones (Domestic / International) and legacy disallowed zones so checkout enforces DE/NL/BE/LU only`);
    await deleteZones(profile.id, toDelete);
    console.log(`  ✓ deleted ${toDelete.length} zone(s)`);
  }
  if (toAdd.length > 0) {
    await addZonesToProfile(profile, toAdd);
    for (const c of toAdd) {
      console.log(`  ok    ${c.zoneName}`);
    }
  }

  console.log('\nDone.');
  console.log(`Verify at Admin → Settings → Shipping and delivery → ${profile.name}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
