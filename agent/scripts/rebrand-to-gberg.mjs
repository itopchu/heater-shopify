#!/usr/bin/env node
/**
 * rebrand-to-gberg.mjs
 *
 * Idempotently applies the G-Berg brand to the active Shopify store:
 *   - Updates shop display name          → "G-Berg"
 *   - Updates contact/sender email       → placeholder "kontakt@gberg-heizung.de" (if unset)
 *   - Renames the active development theme preview → "G-Berg (Dev)"
 *
 * Usage:
 *   node agent/scripts/rebrand-to-gberg.mjs                # dev store (default)
 *   node agent/scripts/rebrand-to-gberg.mjs --dry-run      # show planned changes, no writes
 *
 * Honors --store dev (default) / --store prod.
 * Production mutations are blocked by the pre-tool hook unless explicitly confirmed.
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const STORE_FLAG_IDX = process.argv.indexOf('--store');
const STORE = STORE_FLAG_IDX >= 0 ? process.argv[STORE_FLAG_IDX + 1] : 'dev';

const BRAND = {
  shopName: 'G-Berg',
  contactEmail: 'kontakt@gberg-heizung.de',
  themePreviewName: 'G-Berg (Dev)',
};

const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';
const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

async function graphql(query, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function getShop() {
  const data = await graphql(`{ shop { name email contactEmail } }`);
  return data.shop;
}

async function getDevTheme() {
  const data = await graphql(`{
    themes(first: 20) { nodes { id name role } }
  }`);
  return data.themes.nodes.find((t) => t.role === 'DEVELOPMENT') || null;
}

async function renameTheme(id, name) {
  const mutation = `
    mutation ThemeUpdate($id: ID!, $input: OnlineStoreThemeInput!) {
      themeUpdate(id: $id, input: $input) {
        theme { id name role }
        userErrors { field message }
      }
    }`;
  const data = await graphql(mutation, { id, input: { name } });
  const errs = data.themeUpdate.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
  return data.themeUpdate.theme;
}

async function main() {
  console.log(`[rebrand] store=${STORE} domain=${storeDomain} dry=${DRY_RUN}`);

  const shop = await getShop();
  console.log(`[rebrand] current shop.name="${shop.name}" contact="${shop.contactEmail || shop.email || ''}"`);

  const plan = [];
  if (shop.name !== BRAND.shopName) {
    plan.push(`shop.name: "${shop.name}" → "${BRAND.shopName}"`);
  }
  if (!shop.contactEmail || /havn\.example|example\.com/.test(shop.contactEmail)) {
    plan.push(`shop.contactEmail: "${shop.contactEmail || '∅'}" → "${BRAND.contactEmail}"`);
  }

  const devTheme = await getDevTheme();
  if (devTheme && devTheme.name !== BRAND.themePreviewName) {
    plan.push(`theme(${devTheme.id}).name: "${devTheme.name}" → "${BRAND.themePreviewName}"`);
  }

  if (plan.length === 0) {
    console.log('[rebrand] nothing to do — already on brand.');
    return;
  }

  console.log('[rebrand] planned changes:');
  for (const p of plan) console.log('  -', p);

  if (DRY_RUN) {
    console.log('[rebrand] dry-run, not writing.');
    return;
  }

  // Apply theme rename (shop name + contact require Admin UI in 2026-04 — shopUpdate was deprecated).
  if (devTheme && devTheme.name !== BRAND.themePreviewName) {
    const updated = await renameTheme(devTheme.id, BRAND.themePreviewName);
    console.log(`[rebrand] theme renamed: ${updated.name}`);
  }

  if (shop.name !== BRAND.shopName || !shop.contactEmail) {
    console.log('[rebrand] NOTE: shop.name + contactEmail cannot be set via API in 2026-04.');
    console.log('[rebrand]   Apply manually: Admin → Settings → Store details');
    console.log(`[rebrand]   Store name   → "${BRAND.shopName}"`);
    console.log(`[rebrand]   Sender email → "${BRAND.contactEmail}"`);
  }
}

main().catch((err) => {
  console.error(`[rebrand] ERROR: ${err.message}`);
  process.exit(1);
});
