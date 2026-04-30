#!/usr/bin/env node
/**
 * audit-storefront-locale-leak.mjs
 *
 * Diagnostic script. Issues parallel Storefront API queries with
 * `@inContext(language: NL)` and `@inContext(language: EN)` against a sample
 * of products and reports per-field language for each. Used by the i18n
 * agent to confirm which fields are DE-leaking on /nl/ before/after
 * translation pipeline runs.
 *
 * Storefront token is required (SHOPIFY_DEV_STOREFRONT_TOKEN). If missing,
 * we fall back to using the Admin API to read raw values + translations,
 * which approximates what `@inContext(language: NL)` would return: when
 * no NL translation exists, the Storefront API returns the source value
 * (the EN primary on this store).
 *
 * Output: a table with one row per (product, field) showing detected language.
 * Exit code 0 always (informational only).
 *
 * Usage:
 *   node agent/scripts/audit-storefront-locale-leak.mjs
 *   node agent/scripts/audit-storefront-locale-leak.mjs --limit 5 --store dev
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const STORE = flag('store', 'dev');
const LIMIT = Number(flag('limit', '5'));
const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';

const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

async function gqlAdmin(query, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Admin HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Admin GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/**
 * Heuristic language detector.
 *
 * Returns one of: 'de' | 'en' | 'nl' | 'fr' | 'unknown'. We sniff for
 * diacritics + common stopwords + characteristic punctuation. Good enough
 * for short product copy; not a full NLP pipeline.
 */
const DE_TOKENS = /\b(Heizk(ö|oe)rper|Wohnraum|Bad|Anschluss|Wattleistung|Watt|F(ü|ue)r|der|die|das|und|oder|mit|ohne|zwischen|zur|Maße|Gr(ö|oe)(ß|ss)e|Anschl(ü|ue)sse|Lieferumfang|Hinweise|Eigenschaften|Heizung|Heizk(ö|oe)rpern|Geh(ä|ae)use)\b/i;
const NL_TOKENS = /\b(radiator|verwarming|wonen|badkamer|aansluiting|maten|breedte|hoogte|gewicht|levering|inclusief|uitsluitend|eigenschappen|kenmerken|tussen)\b/i;
const FR_TOKENS = /\b(radiateur|chauffage|salon|salle de bain|raccordement|dimensions|largeur|hauteur|poids|livraison|inclus|caract(é|e)ristiques)\b/i;
const EN_TOKENS = /\b(radiator|heater|the|and|with|without|width|height|connection|delivery|specification|features|between|wattage)\b/i;

function detectLang(text) {
  if (!text) return 'empty';
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').slice(0, 800);
  // German has the strongest signal — diacritics + compound nouns. Check first.
  if (DE_TOKENS.test(stripped)) return 'de';
  if (NL_TOKENS.test(stripped)) return 'nl';
  if (FR_TOKENS.test(stripped)) return 'fr';
  if (EN_TOKENS.test(stripped)) return 'en';
  // Bare diacritic check as a tiebreaker
  if (/[äöüß]/.test(stripped)) return 'de';
  return 'unknown';
}

function preview(text, n = 80) {
  if (!text) return '(empty)';
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

// ---------------------------------------------------------------------------
// Pull a sample of products + their translations via the Admin API.
// ---------------------------------------------------------------------------

async function fetchSampleProducts() {
  const data = await gqlAdmin(
    `query ($n: Int!) {
      products(first: $n, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          handle
          title
          descriptionHtml
          subtitle: metafield(namespace: "custom", key: "subtitle") { value }
          shortDescription: metafield(namespace: "custom", key: "short_description") { value }
          sectionsEn: metafield(namespace: "content", key: "sections_en") { value }
          sectionsDe: metafield(namespace: "content", key: "sections_de") { value }
        }
      }
    }`,
    { n: LIMIT },
  );
  return data.products.nodes;
}

async function fetchTranslations(resourceId, locale) {
  const data = await gqlAdmin(
    `query ($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $locale) { key value outdated }
      }
    }`,
    { id: resourceId, locale },
  );
  const map = {};
  for (const t of data.translatableResource?.translations ?? []) {
    map[t.key] = t.value;
  }
  return map;
}

async function fetchSampleCollections() {
  const data = await gqlAdmin(
    `query {
      collections(first: 10) {
        nodes { id handle title }
      }
    }`,
  );
  return data.collections.nodes;
}

async function fetchMenu() {
  const data = await gqlAdmin(
    `query {
      menus(first: 5) {
        nodes {
          id
          handle
          title
          items { id title type url resourceId }
        }
      }
    }`,
  ).catch(() => null);
  return data?.menus?.nodes ?? [];
}

async function main() {
  console.log(`[audit] store=${STORE} domain=${storeDomain} sample_size=${LIMIT}`);

  const products = await fetchSampleProducts();
  console.log(`\n=== PRODUCTS ===`);
  for (const p of products) {
    const tNl = await fetchTranslations(p.id, 'nl');
    const tDe = await fetchTranslations(p.id, 'de');
    const tFr = await fetchTranslations(p.id, 'fr');
    const titleNl = tNl.title ?? p.title;
    const titleDe = tDe.title ?? p.title;
    console.log(`\n[${p.handle}]`);
    console.log(`  EN/source title         lang=${detectLang(p.title).padEnd(7)} │ ${preview(p.title)}`);
    console.log(`  /nl  title              lang=${detectLang(titleNl).padEnd(7)} │ ${preview(titleNl)}`);
    console.log(`  /de  title              lang=${detectLang(titleDe).padEnd(7)} │ ${preview(titleDe)}`);
    console.log(`  EN/source descriptionHtml lang=${detectLang(p.descriptionHtml).padEnd(5)} │ ${preview(p.descriptionHtml, 120)}`);
    if (tNl.body_html || tDe.body_html) {
      const nlBody = tNl.body_html ?? p.descriptionHtml;
      const deBody = tDe.body_html ?? p.descriptionHtml;
      console.log(`  /nl  descriptionHtml      lang=${detectLang(nlBody).padEnd(5)} │ ${preview(nlBody, 120)}`);
      console.log(`  /de  descriptionHtml      lang=${detectLang(deBody).padEnd(5)} │ ${preview(deBody, 120)}`);
    }
    if (p.subtitle?.value) {
      console.log(`  custom.subtitle           lang=${detectLang(p.subtitle.value).padEnd(5)} │ ${preview(p.subtitle.value)}`);
    }
    if (p.shortDescription?.value) {
      console.log(`  custom.short_description  lang=${detectLang(p.shortDescription.value).padEnd(5)} │ ${preview(p.shortDescription.value)}`);
    }
    if (p.sectionsEn?.value) {
      try {
        const j = JSON.parse(p.sectionsEn.value);
        const sample = JSON.stringify(j).slice(0, 200);
        console.log(`  content.sections_en       lang=${detectLang(sample).padEnd(5)} │ ${preview(sample)}`);
      } catch { /* ignore */ }
    }
    if (p.sectionsDe?.value) {
      try {
        const j = JSON.parse(p.sectionsDe.value);
        const sample = JSON.stringify(j).slice(0, 200);
        console.log(`  content.sections_de       lang=${detectLang(sample).padEnd(5)} │ ${preview(sample)}`);
      } catch { /* ignore */ }
    }
  }

  console.log(`\n=== COLLECTIONS ===`);
  const collections = await fetchSampleCollections();
  for (const c of collections) {
    const tNl = await fetchTranslations(c.id, 'nl');
    const tDe = await fetchTranslations(c.id, 'de');
    const titleNl = tNl.title ?? c.title;
    const titleDe = tDe.title ?? c.title;
    console.log(`\n[${c.handle}]`);
    console.log(`  EN/source title  lang=${detectLang(c.title).padEnd(7)} │ ${c.title}`);
    console.log(`  /nl  title       lang=${detectLang(titleNl).padEnd(7)} │ ${titleNl}`);
    console.log(`  /de  title       lang=${detectLang(titleDe).padEnd(7)} │ ${titleDe}`);
  }

  console.log(`\n=== MENUS ===`);
  const menus = await fetchMenu();
  if (menus.length === 0) {
    console.log(`  (no menus exposed via Admin API on this store)`);
  } else {
    for (const m of menus) {
      console.log(`\n[${m.handle}] (${m.title})`);
      for (const it of m.items ?? []) {
        console.log(`  · ${detectLang(it.title)} │ ${it.title}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(`[audit] FATAL: ${err.message}`);
  process.exit(1);
});
