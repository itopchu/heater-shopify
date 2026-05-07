/**
 * Register Shopify translations for product option NAMES and option VALUES
 * across all four storefront locales (de, nl, fr — en is the source).
 *
 * Why: the storefront uses Storefront API @inContext(language: …) to serve
 * localized content. Product titles and bodies already have de/nl/fr
 * translations registered, but option names ("Size", "Color") and their
 * values ("White", "Anthracite, Straight") are mostly English-only — so a
 * Dutch shopper sees "Color: White" instead of "Kleur: Wit".
 *
 * Strategy:
 *   - Source language is English (verified via shopLocales: en is primary).
 *   - We do NOT machine-translate. The set of option names + values is
 *     small and deterministic (4 names, ~15 distinct values), so we use a
 *     hand-curated dictionary — guaranteed quality, no API key, no drift.
 *   - Size values like "60 × 180" or "400 × 1000 mm" are dimension strings;
 *     they pass through untranslated (the script skips values not in the
 *     dictionary, leaving the source string to render in every locale).
 *   - Composite values like "Anthracite, Straight" are split on commas,
 *     each part is translated, then re-joined.
 *   - Idempotent: translationsRegister overwrites by (resourceId, locale,
 *     key). Re-running the script after adding new products is safe.
 *
 * Flags:
 *   --apply           perform writes (default: dry-run preview)
 *   --locales=de,nl   restrict to these target locales (default: de,nl,fr)
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');

const APPLY = process.argv.includes('--apply');
const localesArg = process.argv.find((a) => a.startsWith('--locales='));
const TARGET_LOCALES = localesArg
  ? localesArg.slice('--locales='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : ['de', 'nl', 'fr'];

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}  locales=${TARGET_LOCALES.join(',')}`);

const API = `https://${STORE}/admin/api/2026-04/graphql.json`;
async function gql(q, v) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

// ---- Translation dictionaries (English source → target locales) ----
//
// Option names. Match Shopify's source values exactly (case-sensitive).
const OPTION_NAME_TRANSLATIONS = {
  'Size':     {de: 'Größe',    nl: 'Maat',      fr: 'Taille'},
  'Color':    {de: 'Farbe',    nl: 'Kleur',     fr: 'Couleur'},
  'Colour':   {de: 'Farbe',    nl: 'Kleur',     fr: 'Couleur'},
  'Material': {de: 'Material', nl: 'Materiaal', fr: 'Matériau'},
  'Side':     {de: 'Seite',    nl: 'Zijde',     fr: 'Côté'},
};

// Atomic option-value translations. Composite values like
// "Anthracite, Straight" are tokenised on commas before lookup.
const OPTION_VALUE_TRANSLATIONS = {
  // Colours
  'White':           {de: 'Weiß',       nl: 'Wit',        fr: 'Blanc'},
  'Black':           {de: 'Schwarz',    nl: 'Zwart',      fr: 'Noir'},
  'Anthracite':      {de: 'Anthrazit',  nl: 'Antraciet',  fr: 'Anthracite'},
  'Chrome':          {de: 'Chrom',      nl: 'Chroom',     fr: 'Chrome'},
  // Connection / shape modifiers
  'Straight':        {de: 'Gerade',     nl: 'Recht',      fr: 'Droit'},
  'Angle':           {de: 'Winkel',     nl: 'Hoek',       fr: 'Coudé'},
  // Materials
  'Stainless steel': {de: 'Edelstahl',  nl: 'Roestvast staal', fr: 'Acier inoxydable'},
  // Sides
  'Left':            {de: 'Links',      nl: 'Links',      fr: 'Gauche'},
  'Right':           {de: 'Rechts',     nl: 'Rechts',     fr: 'Droite'},
  // The synthetic "Default Title" Shopify uses for single-variant products.
  // Translating it is harmless and keeps the variant selector tidy when
  // exposed (most of our PDPs hide it, but better safe).
  'Default Title':   {de: 'Standard',   nl: 'Standaard',  fr: 'Standard'},
};

function translateValue(value, locale) {
  // Pass through dimension / number strings ("60 × 180", "400 × 1000 mm",
  // "1200" etc.) — these are language-neutral.
  if (/^[\d\s×x*,.\-/+°mm]+$/i.test(value)) return null;

  // Atomic match
  if (OPTION_VALUE_TRANSLATIONS[value]?.[locale]) {
    return OPTION_VALUE_TRANSLATIONS[value][locale];
  }
  // Composite: split on ", ", translate each part, rejoin
  if (value.includes(',')) {
    const parts = value.split(',').map((p) => p.trim());
    const translatedParts = parts.map((p) => OPTION_VALUE_TRANSLATIONS[p]?.[locale] ?? p);
    // Only return a translation if at least one part actually got translated
    if (translatedParts.some((tp, i) => tp !== parts[i])) {
      return translatedParts.join(', ');
    }
  }
  return null;
}

// ---- Walk all products ----
async function* iterProducts() {
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($c:String){
        products(first:50, after:$c) {
          pageInfo{hasNextPage endCursor}
          nodes{
            id handle title
            options { id name optionValues { id name } }
          }
        }
      }`,
      {c: cursor},
    );
    for (const p of d.products.nodes) yield p;
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
}

// ---- Get translation digests for a resource ----
async function getNameDigest(resourceId) {
  const d = await gql(
    `query($id:ID!){
      translatableResource(resourceId:$id){
        translatableContent{ key value digest locale }
      }
    }`,
    {id: resourceId},
  );
  const r = d.translatableResource;
  if (!r) return null;
  const c = r.translatableContent.find((x) => x.key === 'name');
  return c ?? null;
}

// ---- Register translations ----
async function registerTranslations(resourceId, translations) {
  if (!APPLY) return {userErrors: []};
  const d = await gql(
    `mutation($id:ID!, $translations:[TranslationInput!]!){
      translationsRegister(resourceId:$id, translations:$translations){
        userErrors{ field message }
      }
    }`,
    {id: resourceId, translations},
  );
  return d.translationsRegister;
}

// ---- Main pass ----
let stats = {
  productsScanned: 0,
  optionNames:    {checked: 0, registered: 0, skipped: 0, errors: 0},
  optionValues:   {checked: 0, registered: 0, skipped: 0, errors: 0},
};

for await (const product of iterProducts()) {
  stats.productsScanned++;
  for (const option of product.options) {
    // 1. Option name
    stats.optionNames.checked++;
    const dict = OPTION_NAME_TRANSLATIONS[option.name];
    if (!dict) {
      stats.optionNames.skipped++;
      console.log(`  · skip option name "${option.name}" (not in dictionary)`);
    } else {
      const meta = await getNameDigest(option.id);
      if (!meta?.digest) {
        stats.optionNames.skipped++;
        console.log(`  · skip option name "${option.name}" (no translatable resource)`);
      } else {
        const translations = TARGET_LOCALES
          .filter((loc) => dict[loc] && dict[loc] !== meta.value)
          .map((loc) => ({
            locale: loc,
            key: 'name',
            value: dict[loc],
            translatableContentDigest: meta.digest,
          }));
        if (translations.length === 0) {
          stats.optionNames.skipped++;
        } else {
          const result = await registerTranslations(option.id, translations);
          if (result.userErrors?.length) {
            stats.optionNames.errors++;
            console.log(`  ✗ option name "${option.name}" → ${JSON.stringify(result.userErrors)}`);
          } else {
            stats.optionNames.registered += translations.length;
            console.log(`  ✓ option "${option.name}" → ${translations.map((t) => `${t.locale}:${t.value}`).join(', ')}`);
          }
        }
      }
    }

    // 2. Option values
    for (const value of option.optionValues || []) {
      stats.optionValues.checked++;
      const meta = await getNameDigest(value.id);
      if (!meta?.digest) {
        stats.optionValues.skipped++;
        continue;
      }
      const translations = [];
      for (const loc of TARGET_LOCALES) {
        const translated = translateValue(value.name, loc);
        if (translated && translated !== meta.value) {
          translations.push({
            locale: loc,
            key: 'name',
            value: translated,
            translatableContentDigest: meta.digest,
          });
        }
      }
      if (translations.length === 0) {
        stats.optionValues.skipped++;
        continue;
      }
      const result = await registerTranslations(value.id, translations);
      if (result.userErrors?.length) {
        stats.optionValues.errors++;
        console.log(`  ✗ option value "${value.name}" → ${JSON.stringify(result.userErrors)}`);
      } else {
        stats.optionValues.registered += translations.length;
        console.log(`  ✓ value "${value.name}" → ${translations.map((t) => `${t.locale}:${t.value}`).join(', ')}`);
      }
    }
  }
}

console.log('');
console.log('Summary:');
console.log(`  products scanned : ${stats.productsScanned}`);
console.log(`  option names     : ${stats.optionNames.registered} translations registered, ${stats.optionNames.skipped} skipped, ${stats.optionNames.errors} errors`);
console.log(`  option values    : ${stats.optionValues.registered} translations registered, ${stats.optionValues.skipped} skipped, ${stats.optionValues.errors} errors`);
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
