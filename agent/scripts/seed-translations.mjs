#!/usr/bin/env node
/**
 * Registers DE translations for the English homepage copy in
 * theme/templates/index.json, plus DE translations for new theme-settings
 * fields (consent banner, WhatsApp bubble labels).
 *
 * Uses Shopify Translate & Adapt via Admin GraphQL translationsRegister.
 * Digests are fetched fresh each run, so re-running after copy changes just
 * re-registers the affected keys.
 *
 * Idempotent: translationsRegister replaces per-key, never duplicates.
 *
 * Scope required: write_translations, read_translations, read_themes.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const LOCALE = 'de';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

// Value-based translation map. Keys are the English source strings that
// currently live in the template; values are the German translations we want
// registered. Shopify identifies translatable content by (resourceId, key),
// but the EN values act as the anti-drift index for us: if the source copy
// changes, the EN→DE lookup falls through and the script logs "no match".
const DE_TRANSLATIONS = {
  // Hero
  'Warmth that feels like home.': 'Wärme, die sich nach Zuhause anfühlt.',
  'Design radiators for every room — TÜV-tested, 10-year warranty, free EU delivery.':
    'Design-Heizkörper für jeden Raum — TÜV geprüft, 10 Jahre Garantie, kostenloser EU-Versand.',
  'Shop radiators': 'Heizkörper entdecken',
  'Get expert advice': 'Fachberatung anfragen',
  // Category grid
  'Find your radiator.': 'Finde deinen Heizkörper.',
  // Testimonials
  'Customer stories': 'Stimmen unserer Kunden',
  'What our customers say.': 'Was unsere Kunden sagen.',
  // Trust badges
  'Built for your home': 'Für dein Zuhause gebaut',
  'Why Havn.': 'Darum Havn.',
  // FAQ
  'FAQ': 'FAQ',
  'Questions, answered.': 'Antworten auf häufige Fragen.',
  // Top announcement bar (USP blocks)
  'Expert advice — reply within 2 hours': 'Fachberatung — Antwort in 2 Stunden',
  '10-year warranty': '10 Jahre Garantie',
  'Fast EU delivery': 'Schneller EU-Versand',
  'Secure checkout · Klarna · PayPal': 'Sicherer Checkout · Klarna · PayPal',
  // WhatsApp bubble
  'Chat with us': 'Kontakt aufnehmen',
  'Hi! I have a question about your heaters.':
    'Hallo! Ich habe eine Frage zu Ihren Heizkörpern.',
};

async function findMainTheme() {
  const data = await gql(`{
    themes(first: 20) {
      nodes { id name role }
    }
  }`);
  const theme = data.themes.nodes.find((t) => t.role === 'MAIN') || data.themes.nodes[0];
  if (!theme) throw new Error('No themes found on store.');
  return theme;
}

async function listTranslatableResources(resourceType) {
  const all = [];
  let cursor = null;
  for (;;) {
    const data = await gql(
      `query($type: TranslatableResourceType!, $after: String) {
        translatableResources(first: 50, after: $after, resourceType: $type) {
          edges {
            cursor
            node {
              resourceId
              translatableContent { key value digest locale type }
            }
          }
          pageInfo { hasNextPage }
        }
      }`,
      { type: resourceType, after: cursor },
    );
    for (const e of data.translatableResources.edges) all.push(e.node);
    if (!data.translatableResources.pageInfo.hasNextPage) break;
    cursor = data.translatableResources.edges.at(-1).cursor;
  }
  return all;
}

async function registerTranslations(resourceId, translations) {
  if (translations.length === 0) return 0;
  const data = await gql(
    `mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    { resourceId, translations },
  );
  const errs = data.translationsRegister.userErrors;
  if (errs.length) throw new Error(`translationsRegister ${resourceId}: ${JSON.stringify(errs)}`);
  return data.translationsRegister.translations.length;
}

async function translateResourcesOfType(resourceType, label) {
  const resources = await listTranslatableResources(resourceType);
  console.log(`\n→ ${label}: ${resources.length} resource(s)`);

  let totalRegistered = 0;
  let totalMatched = 0;
  const unmatched = new Set();

  for (const res of resources) {
    const translations = [];
    for (const content of res.translatableContent) {
      if (!content.value) continue;
      const deValue = DE_TRANSLATIONS[content.value];
      if (!deValue) {
        unmatched.add(content.value);
        continue;
      }
      totalMatched++;
      translations.push({
        locale: LOCALE,
        key: content.key,
        value: deValue,
        translatableContentDigest: content.digest,
      });
    }
    if (translations.length > 0) {
      const n = await registerTranslations(res.resourceId, translations);
      totalRegistered += n;
      console.log(`  ✓ ${res.resourceId} → ${n} translation(s)`);
    }
  }

  console.log(`  matched ${totalMatched}, registered ${totalRegistered}`);
  return { totalRegistered, unmatched };
}

async function main() {
  const theme = await findMainTheme();
  console.log(`→ Seeding ${LOCALE} translations on ${STORE} (theme: ${theme.name})\n`);

  const results = [];
  // JSON templates (index.json → homepage section settings)
  results.push(
    await translateResourcesOfType('ONLINE_STORE_THEME_JSON_TEMPLATE', 'Theme JSON templates'),
  );
  // Section groups (header-group.json → announcement-top-bar blocks)
  results.push(
    await translateResourcesOfType(
      'ONLINE_STORE_THEME_SECTION_GROUP',
      'Theme section groups (header/footer)',
    ),
  );
  // Settings category (theme settings_schema / settings_data values — includes whatsapp_label etc.)
  results.push(
    await translateResourcesOfType(
      'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
      'Theme settings',
    ),
  );

  const unmatched = new Set();
  for (const r of results) for (const u of r.unmatched) unmatched.add(u);
  const totalRegistered = results.reduce((s, r) => s + r.totalRegistered, 0);

  console.log(`\nTotal DE translations registered: ${totalRegistered}`);
  if (unmatched.size > 0) {
    console.log(`\nUnmatched EN strings (no DE mapping — expected for some):`);
    for (const s of Array.from(unmatched).slice(0, 20)) {
      const short = s.length > 80 ? s.slice(0, 77) + '...' : s;
      console.log(`  · ${short}`);
    }
    if (unmatched.size > 20) console.log(`  ... and ${unmatched.size - 20} more`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
