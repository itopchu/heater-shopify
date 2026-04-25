#!/usr/bin/env node
/**
 * translate-theme-content.mjs
 *
 * Registers translations for theme JSON-template content (section + block
 * settings stored in theme/templates/*.json). Without this, the storefront on
 * /de/ falls back to the EN source value for every section heading, body,
 * kicker, and button label — products / collections / metaobjects / menus
 * translate fine, but section copy stays English.
 *
 * Idempotent: queries `translatableResources(resourceType:
 * ONLINE_STORE_THEME_JSON_TEMPLATE)` for the live MAIN theme, looks up each
 * source value in the EN→target dictionary, and registers when a translation
 * is missing or the source digest changed.
 *
 * Skips:
 *   - URL fields (links, not text)
 *   - Liquid placeholders ({{ … }}) — already locale-aware
 *   - Strings not in the dictionary (logged as MISSING for follow-up)
 *
 * Usage:
 *   node agent/scripts/translate-theme-content.mjs                # locale=de, dev store
 *   node agent/scripts/translate-theme-content.mjs --locale de --store dev
 *   node agent/scripts/translate-theme-content.mjs --dry-run      # preview, no writes
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const DRY_RUN = args.includes('--dry-run');
const LOCALE = flag('locale', 'de');
const STORE = flag('store', 'dev');
const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';
const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// Dictionary — EN source → DE target
// Keep keys verbatim (case + punctuation) — they must match the live theme's
// translatableContent.value byte-for-byte for the lookup to hit.
// ---------------------------------------------------------------------------
const DE_TRANSLATIONS = {
  // header-group.json (announcement bar USPs)
  'Expert advice — reply within 2 hours': 'Expertenberatung — Antwort innerhalb von 2 Stunden',
  '10-year warranty': '10 Jahre Garantie',
  'Fast EU delivery': 'Schnelle EU-Lieferung',
  'Secure checkout · Klarna · PayPal': 'Sicherer Checkout · Klarna · PayPal',
  // footer-group.json
  'Quick links': 'Schnellzugriff',
  'Info': 'Info',
  'Legal': 'Rechtliches',
  'Our mission': 'Unsere Mission',
  'Subscribe to our emails': 'Newsletter abonnieren',
  'Payment methods': 'Zahlungsmethoden',
  // article.json
  'Share': 'Teilen',

  // cart.json
  'Featured collection': 'Empfohlene Kollektion',

  // index.json — hero
  'Warmth that feels like home.': 'Wärme, die sich wie Zuhause anfühlt.',
  'Radiators, towel warmers, and underfloor heating built to German standards. 10-year warranty on every unit, free EU delivery.':
    'Heizkörper, Handtuchwärmer und Fußbodenheizung nach deutscher Norm. 10 Jahre Garantie auf jedes Produkt, kostenloser Versand in der gesamten EU.',
  'Shop radiators': 'Heizkörper kaufen',
  'Expert advice': 'Expertenberatung',

  // index.json — category-grid + bestsellers
  'Find your radiator.': 'Finde deinen Heizkörper.',
  'Popular radiators': 'Beliebte Heizkörper',

  // index.json — trust-badges
  'Built for your home': 'Gebaut für dein Zuhause',
  'Why choose G-Berg.': 'Darum G-Berg.',

  // index.json — value-props
  'German engineering': 'Deutsche Technik',
  'Built to German standards, TÜV-tested.': 'Gefertigt nach deutscher Norm, TÜV-geprüft.',
  '<p>Every G-Berg radiator is manufactured to DIN EN 442 and arrives ready for your plumber. Powder-coated steel, corrosion-resistant, and sized for retrofit into existing connections.</p>':
    '<p>Jeder G-Berg Heizkörper wird nach DIN EN 442 gefertigt und kommt einbaufertig für Ihren Installateur. Pulverbeschichteter Stahl, korrosionsbeständig und passgenau für vorhandene Anschlüsse.</p>',
  '10-year warranty': '10 Jahre Garantie',
  'Peace of mind, baked in.': 'Sicherheit von Anfang an.',
  '<p>Material and workmanship covered for a full decade. If anything fails, we handle it — no back-and-forth with the manufacturer.</p>':
    '<p>Material und Verarbeitung über zehn volle Jahre abgedeckt. Sollte etwas defekt sein, kümmern wir uns — ohne Hin und Her mit dem Hersteller.</p>',
  'Europe-wide shipping': 'EU-weiter Versand',
  'Free delivery across the EU.': 'Kostenloser Versand in der gesamten EU.',
  '<p>Shipping free to Germany, Belgium, Netherlands, Austria, and Spain. 2–4 business days from our Schwelm warehouse. Damage-free guarantee.</p>':
    '<p>Kostenloser Versand nach Deutschland, Belgien, Niederlande, Österreich und Spanien. 2–4 Werktage ab unserem Lager in Schwelm. Garantie auf unversehrte Lieferung.</p>',

  // index.json — testimonials + faq + newsletter
  'Customer stories': 'Kundenstimmen',
  'What our customers say.': 'Das sagen unsere Kunden.',
  'FAQ': 'FAQ',
  'Questions, answered.': 'Antworten auf häufige Fragen.',
  'Stay warm with G-Berg.': 'Bleib warm mit G-Berg.',
  '<p>Seasonal tips, radiator guides, and early access to new products. No spam — promise.</p>':
    '<p>Saisonale Tipps, Heizkörper-Ratgeber und früher Zugang zu neuen Produkten. Kein Spam — versprochen.</p>',

  // list-collections.json
  'Collections': 'Kollektionen',

  // password.json
  'Opening soon': 'Wir öffnen bald',
  '<p>Be the first to know when we launch.</p>': '<p>Sei der Erste, der von unserem Start erfährt.</p>',

  // product.json — section copy
  'Materials': 'Material',
  'Shipping & Returns': 'Versand & Rücksendung',
  'Dimensions': 'Maße',
  'Care Instructions': 'Pflegehinweise',
  'Specs & details.': 'Technische Daten & Details.',
  'Technical datasheet': 'Technisches Datenblatt',
  'Download': 'Herunterladen',
  'Save with the set': 'Im Set sparen',
  'View': 'Ansehen',
  'You may also like': 'Das könnte dir auch gefallen',

  // header-group — top announcement bar
  'Expert advice — reply within 2 hours': 'Expertenberatung — Antwort in 2 Stunden',
  'Fast EU delivery': 'Schneller EU-Versand',
  'Secure checkout · Klarna · PayPal': 'Sicherer Checkout · Klarna · PayPal',
  // ('10-year warranty' already covered above for value-props block)

  // footer-group
  'Subscribe to our emails': 'Newsletter abonnieren',
  'Quick links': 'Schnellzugriff',
  'Info': 'Info',
  'Our mission': 'Unsere Mission',
  '<p>Share contact information, store details, and brand content with your customers.</p>':
    '<p>Teilen Sie Kontaktdaten, Geschäftsinformationen und Markeninhalte mit Ihren Kunden.</p>',
};

// Liquid template strings we deliberately don't translate (already merchant-aware)
const LIQUID_PASSTHROUGH = /^\s*\{\{[^}]+\}\}\s*$/;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Resource types covering all customer-visible theme content surfaces.
const RESOURCE_TYPES = [
  'ONLINE_STORE_THEME_JSON_TEMPLATE',     // section/block settings in theme/templates/*.json
  'ONLINE_STORE_THEME_SECTION_GROUP',     // header-group + footer-group (announcement bar, footer columns)
  'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS', // any sections rendered via settings_data
  'ONLINE_STORE_THEME_APP_EMBED',         // app embed blocks
];

function buildResourceQuery(rt, locale) {
  return `
    query($cursor: String) {
      translatableResources(first: 50, resourceType: ${rt}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          resourceId
          translatableContent { key value digest type locale }
          translations(locale: "${locale}") { key value updatedAt outdated }
        } }
      }
    }`;
}

async function fetchAllResources() {
  const out = [];
  for (const rt of RESOURCE_TYPES) {
    let cursor = null;
    const q = buildResourceQuery(rt, LOCALE);
    do {
      const data = await gql(q, { cursor });
      const conn = data.translatableResources;
      for (const e of conn.edges) out.push({ ...e.node, resourceType: rt });
      cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
  }
  return out;
}

async function registerBatch(resourceId, translations) {
  if (translations.length === 0) return { ok: 0, errs: [] };
  const data = await gql(
    `mutation ($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations { key locale }
        userErrors { field message }
      }
    }`,
    { resourceId, translations },
  );
  return {
    ok: data.translationsRegister.translations.length,
    errs: data.translationsRegister.userErrors,
  };
}

async function main() {
  console.log(`[translate] store=${STORE} domain=${storeDomain} locale=${LOCALE} dry=${DRY_RUN}`);
  const resources = await fetchAllResources();
  console.log(`[translate] ${resources.length} JSON-template resources`);

  let registered = 0;
  let skippedExisting = 0;
  let skippedUrl = 0;
  let skippedLiquid = 0;
  const missing = [];
  const errors = [];

  for (const r of resources) {
    const existing = new Map(r.translations.map((t) => [t.key, t]));
    const todo = [];
    for (const c of r.translatableContent) {
      if (c.type === 'URL') { skippedUrl++; continue; }
      if (LIQUID_PASSTHROUGH.test(c.value || '')) { skippedLiquid++; continue; }
      const targetValue = DE_TRANSLATIONS[c.value];
      if (!targetValue) { missing.push({ resource: r.resourceId, key: c.key, value: c.value }); continue; }
      const have = existing.get(c.key);
      if (have && have.value === targetValue && !have.outdated) { skippedExisting++; continue; }
      todo.push({
        key: c.key,
        locale: LOCALE,
        value: targetValue,
        translatableContentDigest: c.digest,
      });
    }
    if (todo.length === 0) continue;
    if (DRY_RUN) {
      console.log(`[translate] ${r.resourceId}: ${todo.length} would register`);
      registered += todo.length;
      continue;
    }
    const { ok, errs } = await registerBatch(r.resourceId, todo);
    registered += ok;
    if (errs.length) errors.push({ resourceId: r.resourceId, errs });
    console.log(`[translate] ${r.resourceId.split('/').pop()}: registered ${ok}/${todo.length}`);
  }

  console.log(`\n[translate] DONE`);
  console.log(`  registered     : ${registered}`);
  console.log(`  skipped(exist) : ${skippedExisting}`);
  console.log(`  skipped(url)   : ${skippedUrl}`);
  console.log(`  skipped(liquid): ${skippedLiquid}`);
  console.log(`  missing(no DE) : ${missing.length}`);
  if (missing.length && missing.length <= 30) {
    console.log('\n[translate] missing source strings (add to dictionary):');
    for (const m of missing) console.log(`    ${m.value}`);
  }
  if (errors.length) {
    console.log(`\n[translate] errors:`); for (const e of errors) console.log('  ', e);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(`[translate] FATAL: ${e.message}`); process.exit(1); });
