#!/usr/bin/env node
/**
 * seed-collections.mjs
 *
 * Idempotently upserts the G-Berg collection taxonomy on the active store.
 * Mirrors xxl-heizung.de's information architecture — 4 top-level families,
 * 7 sub-collections. Collections are flat in Shopify; parent/child is
 * expressed via the main menu (see agent/scripts/configure-phase-6.mjs for
 * menu wiring, or Admin → Online Store → Navigation).
 *
 * Usage:
 *   node agent/scripts/seed-collections.mjs
 *   node agent/scripts/seed-collections.mjs --dry-run
 *   node agent/scripts/seed-collections.mjs --store prod
 *
 * Each collection is a MANUAL collection; the catalog-sync pipeline (Phase D)
 * assigns products to them by mapping xxl-heizung product_type / tags.
 *
 * Re-run after schema changes; existing handles are updated in-place.
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const STORE_FLAG_IDX = process.argv.indexOf('--store');
const STORE = STORE_FLAG_IDX >= 0 ? process.argv[STORE_FLAG_IDX + 1] : 'dev';

const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';
const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

/**
 * Collection tree. EN is source of truth (store default locale).
 * DE is registered via seed-translations.mjs / translate-products.mjs after seeding.
 * `group` is a logical parent used by the menu builder, not a Shopify concept.
 */
const COLLECTIONS = [
  // Radiators
  { handle: 'heizkoerper', title: 'Radiators', de: 'Heizkörper', group: 'heizkoerper', isGroup: true,
    description: 'Panel radiators, design radiators, towel warmers — every radiator we sell.' },
  { handle: 'badheizkoerper', title: 'Bathroom radiators', de: 'Badheizkörper', group: 'heizkoerper',
    description: 'Bathroom radiators and towel warmers.' },
  { handle: 'badheizkoerper-elektrisch', title: 'Electric bathroom radiators', de: 'Elektrische Badheizkörper', group: 'heizkoerper',
    description: 'Electric towel warmers and bathroom radiators — no central heating required.' },
  { handle: 'austauschheizkoerper', title: 'Replacement radiators', de: 'Austauschheizkörper', group: 'heizkoerper',
    description: 'Drop-in replacements sized to fit existing connection centres.' },
  { handle: 'wohnraumheizkoerper', title: 'Living room radiators', de: 'Wohnraumheizkörper', group: 'heizkoerper',
    description: 'Panel and design radiators for living rooms, bedrooms, and hallways.' },

  // Bathroom
  { handle: 'bad', title: 'Bathroom', de: 'Bad', group: 'bad', isGroup: true,
    description: 'Everything for the bathroom beyond radiators.' },
  { handle: 'toiletten', title: 'Toilets', de: 'Toiletten', group: 'bad',
    description: 'Wall-hung and floor-standing toilets.' },

  // Floor heating
  { handle: 'fussbodenheizung', title: 'Floor heating', de: 'Fußbodenheizung', group: 'fussbodenheizung', isGroup: true,
    description: 'Underfloor heating systems and components.' },
  { handle: 'fussbodenheizungsrohre', title: 'Floor heating pipes', de: 'Fußbodenheizungsrohre', group: 'fussbodenheizung',
    description: 'Pipes and tubing for underfloor heating installations.' },
  { handle: 'pe-rt-rohre', title: 'PE-RT pipes', de: 'PE-RT Rohre', group: 'fussbodenheizung',
    description: 'PE-RT (polyethylene of raised temperature) pipes.' },

  // Accessories
  { handle: 'zubehoer', title: 'Accessories', de: 'Zubehör', group: 'zubehoer', isGroup: true,
    description: 'Thermostats, valves, brackets, connection sets, and other fittings.' },
];

async function graphql(query, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function findByHandle(handle) {
  const data = await graphql(
    `query ($handle: String!) {
      collectionByHandle(handle: $handle) { id handle title descriptionHtml }
    }`,
    { handle },
  );
  return data.collectionByHandle;
}

async function createCollection({ handle, title, descriptionHtml }) {
  const data = await graphql(
    `mutation ($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle title }
        userErrors { field message }
      }
    }`,
    { input: { handle, title, descriptionHtml } },
  );
  const errs = data.collectionCreate.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
  return data.collectionCreate.collection;
}

let cachedPublicationIds = null;
async function getStorefrontPublicationIds() {
  if (cachedPublicationIds) return cachedPublicationIds;
  const data = await graphql(`{ publications(first: 20) { nodes { id name } } }`);
  const wanted = new Set(['Online Store', 'Shop']);
  cachedPublicationIds = data.publications.nodes.filter((p) => wanted.has(p.name)).map((p) => p.id);
  return cachedPublicationIds;
}

async function publishToStorefront(collectionGid) {
  const pubIds = await getStorefrontPublicationIds();
  if (pubIds.length === 0) return;
  const data = await graphql(
    `mutation ($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: collectionGid, input: pubIds.map((id) => ({ publicationId: id })) },
  );
  const errs = data.publishablePublish.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
}

async function updateCollection(id, { title, descriptionHtml }) {
  const data = await graphql(
    `mutation ($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id handle title }
        userErrors { field message }
      }
    }`,
    { input: { id, title, descriptionHtml } },
  );
  const errs = data.collectionUpdate.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
  return data.collectionUpdate.collection;
}

async function registerGermanTranslation(resourceId, title) {
  const translation = {
    key: 'title',
    value: title,
    locale: 'de',
    translatableContentDigest: null,
  };
  const digestRes = await graphql(
    `query ($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: resourceId },
  );
  const src = (digestRes.translatableResource?.translatableContent || []).find((c) => c.key === 'title');
  if (!src) return null;
  translation.translatableContentDigest = src.digest;
  const data = await graphql(
    `mutation ($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    { resourceId, translations: [translation] },
  );
  const errs = data.translationsRegister.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
  return data.translationsRegister.translations;
}

async function main() {
  console.log(`[collections] store=${STORE} domain=${storeDomain} dry=${DRY_RUN}`);
  let created = 0;
  let updated = 0;
  let untouched = 0;
  let translated = 0;

  for (const c of COLLECTIONS) {
    const existing = await findByHandle(c.handle);
    const descHtml = `<p>${c.description}</p>`;

    if (!existing) {
      console.log(`[collections] CREATE ${c.handle} — "${c.title}"`);
      if (!DRY_RUN) {
        const col = await createCollection({ handle: c.handle, title: c.title, descriptionHtml: descHtml });
        await publishToStorefront(col.id);
        const tr = await registerGermanTranslation(col.id, c.de);
        if (tr) translated++;
        created++;
      }
    } else {
      const needsUpdate = existing.title !== c.title || existing.descriptionHtml !== descHtml;
      if (needsUpdate) {
        console.log(`[collections] UPDATE ${c.handle} — "${existing.title}" → "${c.title}"`);
        if (!DRY_RUN) {
          await updateCollection(existing.id, { title: c.title, descriptionHtml: descHtml });
          updated++;
        }
      } else {
        untouched++;
      }
      if (!DRY_RUN) {
        await publishToStorefront(existing.id);
        const tr = await registerGermanTranslation(existing.id, c.de);
        if (tr) translated++;
      }
    }
  }

  console.log(`[collections] done — created=${created} updated=${updated} untouched=${untouched} de-translations=${translated}`);
  if (DRY_RUN) console.log('[collections] dry-run — no writes.');
}

main().catch((err) => {
  console.error(`[collections] ERROR: ${err.message}`);
  process.exit(1);
});
