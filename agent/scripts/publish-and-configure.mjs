#!/usr/bin/env node
/*
 * publish-and-configure.mjs
 *
 * Date:    2026-04-23
 * Purpose: Drive the "merchant actions" programmatically so nobody has to
 *          click around Shopify Admin.
 *
 * Steps (all idempotent):
 *   1. Verify granted Admin API scopes.
 *   2. Look up the Online Store publication ID.
 *   3. Publish every product and collection to the Online Store channel.
 *   4. Enable German (de) as a published storefront language.
 *   5. Report final storefront URLs.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 *
 * Requires scopes: read_products, read_publications, write_publications,
 *                  read_product_listings, write_locales, read_locales.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

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

// --- 1. Scope check -------------------------------------------------------

async function checkScopes() {
  const data = await gql(`{ currentAppInstallation { accessScopes { handle } } }`);
  const granted = new Set(data.currentAppInstallation.accessScopes.map((s) => s.handle));
  const required = [
    'read_products', 'write_products',
    'read_publications', 'write_publications',
    'read_product_listings',
    'read_locales', 'write_locales',
    'read_online_store_pages', 'write_online_store_pages',
    'read_markets', 'write_markets',
  ];
  const missing = required.filter((s) => !granted.has(s));
  console.log(`→ Granted ${granted.size} scopes. Checking required set…`);
  if (missing.length) {
    console.warn(`⚠ Missing scopes (non-fatal for this run): ${missing.join(', ')}`);
  } else {
    console.log('✓ All required scopes present.');
  }
}

// --- 2. Online Store publication -----------------------------------------

async function findOnlineStorePublicationId() {
  const data = await gql(`{ publications(first: 20) { edges { node { id name } } } }`);
  const edge = data.publications.edges.find((e) => e.node.name === 'Online Store');
  if (!edge) throw new Error('Online Store publication not found');
  return edge.node.id;
}

// --- 3. Publish resources --------------------------------------------------

const PUBLISH_MUTATION = `
  mutation($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

async function publishAll(onlineStoreId, type, query) {
  const data = await gql(query);
  const key = type === 'product' ? 'products' : 'collections';
  const nodes = data[key].edges.map((e) => e.node);
  console.log(`→ ${nodes.length} ${key} to publish.`);
  let published = 0;
  for (const n of nodes) {
    const res = await gql(PUBLISH_MUTATION, {
      id: n.id,
      input: [{ publicationId: onlineStoreId }],
    });
    const errs = res.publishablePublish.userErrors;
    if (errs.length) {
      console.warn(`  ✗ ${n.handle}: ${JSON.stringify(errs)}`);
    } else {
      published += 1;
      console.log(`  ✓ ${key.slice(0, -1)}:${n.handle}`);
    }
  }
  console.log(`→ ${published}/${nodes.length} ${key} published.`);
}

// --- 4. Enable DE locale --------------------------------------------------

async function enableLocale(locale) {
  const existing = await gql(`{ shopLocales { locale primary published } }`);
  const match = existing.shopLocales.find((l) => l.locale === locale);
  if (match && match.published) {
    console.log(`→ Locale ${locale} already published (primary=${match.primary}). Skipping.`);
    return;
  }
  if (!match) {
    const created = await gql(
      `mutation { shopLocaleEnable(locale: "${locale}") { shopLocale { locale published primary } userErrors { field message } } }`
    );
    const errs = created.shopLocaleEnable.userErrors;
    if (errs.length) throw new Error(`shopLocaleEnable: ${JSON.stringify(errs)}`);
    console.log(`→ Enabled locale ${locale}.`);
  }
  const published = await gql(
    `mutation { shopLocaleUpdate(locale: "${locale}", shopLocale: { published: true }) { shopLocale { locale published primary } userErrors { field message } } }`
  );
  const errs = published.shopLocaleUpdate.userErrors;
  if (errs.length) throw new Error(`shopLocaleUpdate: ${JSON.stringify(errs)}`);
  console.log(`→ Published locale ${locale} on storefront.`);
}

// --- 5. Verification snapshot ---------------------------------------------

async function snapshot() {
  const data = await gql(`
    {
      shopLocales { locale primary published }
      products(first: 10) { edges { node { handle status onlineStoreUrl totalVariants } } }
      collections(first: 10) { edges { node { handle title productsCount { count } } } }
    }
  `);
  console.log('\n— Snapshot —');
  console.log('Locales:', data.shopLocales.map((l) => `${l.locale}${l.primary ? '*' : ''}${l.published ? ' (pub)' : ''}`).join(', '));
  for (const p of data.products.edges) {
    const n = p.node;
    console.log(`  product ${n.handle} · ${n.status} · ${n.totalVariants}v · ${n.onlineStoreUrl || '(not on storefront)'}`);
  }
  for (const c of data.collections.edges) {
    const n = c.node;
    console.log(`  collection ${n.handle} · ${n.productsCount.count} products`);
  }
}

// --- main -----------------------------------------------------------------

async function main() {
  console.log(`→ Configuring ${STORE} (Admin API ${API_VERSION})\n`);
  await checkScopes();

  const onlineStoreId = await findOnlineStorePublicationId();
  console.log(`→ Online Store publication: ${onlineStoreId}\n`);

  await publishAll(
    onlineStoreId,
    'product',
    `{ products(first: 50) { edges { node { id handle } } } }`
  );
  await publishAll(
    onlineStoreId,
    'collection',
    `{ collections(first: 50) { edges { node { id handle } } } }`
  );

  console.log('');
  await enableLocale('de');

  await snapshot();
  await warnIfStorefrontPasswordProtected();
}

// --- 6. Diagnose onlineStoreUrl null (password-protected dev store) -------

async function warnIfStorefrontPasswordProtected() {
  try {
    const data = await gql(`{ products(first: 1) { edges { node { status onlineStoreUrl } } } }`);
    const first = data.products.edges[0]?.node;
    if (!first) return;
    if (first.status === 'ACTIVE' && first.onlineStoreUrl === null) {
      console.warn('');
      console.warn('⚠ Products are ACTIVE and published, but onlineStoreUrl is null.');
      console.warn('  Shopify only populates onlineStoreUrl once the storefront is publicly reachable.');
      console.warn('  The dev store is almost certainly password-protected — Admin → Online Store → Preferences → Password protection.');
      console.warn('  Remove the password (or add the visitor to the preview allowlist) to unblock Online Store URLs.');
    }
  } catch (err) {
    console.warn(`⚠ Could not verify storefront accessibility: ${err.message}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
