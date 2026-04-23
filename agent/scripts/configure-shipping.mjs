#!/usr/bin/env node
/**
 * Configures shipping zones + rates on the default delivery profile for the
 * Europe multi-country market.
 *
 * Design choice: one zone per country, two rates each (flat below €300,
 * free above €300). Single zone per country (instead of one big "Europe"
 * zone) so per-country carrier swaps are easy later.
 *
 * Idempotent: skips any zone whose name already exists on the profile.
 *
 * Scopes required: read_shipping, write_shipping.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const FREE_SHIPPING_THRESHOLD_EUR = 300;
const FLAT_RATE_EUR = 9.9;

const COUNTRIES = [
  { code: 'DE', name: 'Germany', zoneName: 'Germany · DHL' },
  { code: 'BE', name: 'Belgium', zoneName: 'Belgium · bpost' },
  { code: 'ES', name: 'Spain', zoneName: 'Spain · Correos' },
  { code: 'AT', name: 'Austria', zoneName: 'Austria · Post.at' },
  { code: 'NL', name: 'Netherlands', zoneName: 'Netherlands · PostNL' },
];

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

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing env vars'); process.exit(1); }
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
        name: `Standard delivery (under €${FREE_SHIPPING_THRESHOLD_EUR})`,
        active: true,
        rateDefinition: {
          price: { amount: FLAT_RATE_EUR.toFixed(2), currencyCode: 'EUR' },
        },
        priceConditionsToCreate: [
          {
            operator: 'LESS_THAN_OR_EQUAL_TO',
            criteria: { amount: FREE_SHIPPING_THRESHOLD_EUR.toFixed(2), currencyCode: 'EUR' },
          },
        ],
      },
      {
        name: `Free delivery (€${FREE_SHIPPING_THRESHOLD_EUR}+)`,
        active: true,
        rateDefinition: {
          price: { amount: '0.00', currencyCode: 'EUR' },
        },
        priceConditionsToCreate: [
          {
            operator: 'GREATER_THAN_OR_EQUAL_TO',
            criteria: { amount: FREE_SHIPPING_THRESHOLD_EUR.toFixed(2), currencyCode: 'EUR' },
          },
        ],
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
  // Remove Shopify's default "Domestic" + "International" zones so our
  // per-country zones can claim each European country unambiguously.
  const toDelete = [];
  const managed = new Set(COUNTRIES.map((c) => c.zoneName));
  for (const group of profile.profileLocationGroups) {
    for (const edge of group.locationGroupZones.edges) {
      const z = edge.node.zone;
      if (managed.has(z.name)) continue;
      if (z.name === 'Domestic' || z.name === 'International') {
        toDelete.push(z.id);
      }
    }
  }
  return toDelete;
}

async function main() {
  console.log(`→ Configuring shipping zones on ${STORE}\n`);
  console.log(`  Rates per zone:`);
  console.log(`    • €${FLAT_RATE_EUR.toFixed(2)} flat for orders under €${FREE_SHIPPING_THRESHOLD_EUR}`);
  console.log(`    • Free for orders €${FREE_SHIPPING_THRESHOLD_EUR}+\n`);

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
    console.log(`  removing default zones (Domestic / International) so per-country zones can claim each EU country`);
    await deleteZones(profile.id, toDelete);
    console.log(`  ✓ deleted ${toDelete.length} default zone(s)`);
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
