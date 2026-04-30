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
// Dictionaries — EN source → target language
//
// Keep keys verbatim (case + punctuation) — they must match the live theme's
// translatableContent.value byte-for-byte for the lookup to hit. NL/DE/FR
// share the same key set; missing target strings are reported by the runner.
// ---------------------------------------------------------------------------

const NL_TRANSLATIONS = {
  // header-group.json (announcement bar USPs)
  'Expert advice — reply within 2 hours': 'Deskundig advies — antwoord binnen 2 uur',
  '10-year warranty': '10 jaar garantie',
  'Fast EU delivery': 'Snelle EU-levering',
  'Secure checkout · Klarna · PayPal': 'Veilig afrekenen · Klarna · PayPal',

  // footer-group.json
  'Quick links': 'Snelkoppelingen',
  'Info': 'Info',
  'Legal': 'Juridisch',
  'Our mission': 'Onze missie',
  'Subscribe to our emails': 'Abonneer op onze nieuwsbrief',
  'Payment methods': 'Betaalmethoden',

  // article.json
  'Share': 'Delen',

  // cart.json
  'Featured collection': 'Uitgelichte collectie',

  // index.json — hero
  'Warmth that feels like home.': 'Warmte die voelt als thuis.',
  'Radiators, towel warmers, and underfloor heating built to German standards. 10-year warranty on every unit, free EU delivery.':
    'Radiatoren, handdoekradiatoren en vloerverwarming volgens Duitse normen. 10 jaar garantie op elk product, gratis EU-levering.',
  'Shop radiators': 'Radiatoren bekijken',
  'Expert advice': 'Deskundig advies',

  // index.json — category-grid + bestsellers
  'Find your radiator.': 'Vind jouw radiator.',
  'Popular radiators': 'Populaire radiatoren',

  // index.json — trust-badges
  'Built for your home': 'Gebouwd voor jouw thuis',
  'Why choose G-Berg.': 'Waarom G-Berg.',

  // index.json — value-props
  'German engineering': 'Duitse techniek',
  'Built to German standards, TÜV-tested.': 'Gemaakt volgens Duitse normen, TÜV-getest.',
  '<p>Every G-Berg radiator is manufactured to DIN EN 442 and arrives ready for your plumber. Powder-coated steel, corrosion-resistant, and sized for retrofit into existing connections.</p>':
    '<p>Elke G-Berg radiator wordt vervaardigd volgens DIN EN 442 en komt installatieklaar bij je loodgieter aan. Poedergecoat staal, corrosiebestendig en passend voor bestaande aansluitingen.</p>',
  'Peace of mind, baked in.': 'Zekerheid, ingebouwd.',
  '<p>Material and workmanship covered for a full decade. If anything fails, we handle it — no back-and-forth with the manufacturer.</p>':
    '<p>Materiaal en afwerking volledig gedekt voor tien jaar. Mocht er iets defect zijn, dan regelen wij het — geen heen-en-weer met de fabrikant.</p>',
  'Europe-wide shipping': 'EU-brede verzending',
  'Free delivery across the EU.': 'Gratis levering in de hele EU.',
  '<p>Shipping free to Germany, Belgium, Netherlands, Austria, and Spain. 2–4 business days from our Schwelm warehouse. Damage-free guarantee.</p>':
    '<p>Gratis verzending naar Duitsland, België, Nederland, Oostenrijk en Spanje. 2–4 werkdagen vanuit ons magazijn in Schwelm. Garantie op schadevrije levering.</p>',

  // index.json — testimonials + faq + newsletter
  'Customer stories': 'Klantverhalen',
  'What our customers say.': 'Wat onze klanten zeggen.',
  'FAQ': 'FAQ',
  'Questions, answered.': 'Antwoorden op veelgestelde vragen.',
  'Stay warm with G-Berg.': 'Blijf warm met G-Berg.',
  '<p>Seasonal tips, radiator guides, and early access to new products. No spam — promise.</p>':
    '<p>Seizoenstips, radiator-gidsen en vroege toegang tot nieuwe producten. Geen spam — beloofd.</p>',

  // list-collections.json
  'Collections': 'Collecties',

  // password.json
  'Opening soon': 'Binnenkort open',
  '<p>Be the first to know when we launch.</p>': '<p>Wees de eerste die het weet wanneer we live gaan.</p>',

  // product.json — section copy
  'Materials': 'Materiaal',
  'Shipping & Returns': 'Verzending & Retour',
  'Dimensions': 'Afmetingen',
  'Care Instructions': 'Onderhoudsinstructies',
  'Specs & details.': 'Specificaties & details.',
  'Technical datasheet': 'Technisch datablad',
  'Download': 'Downloaden',
  'Save with the set': 'Bespaar met de set',
  'View': 'Bekijken',
  'You may also like': 'Misschien vind je dit ook leuk',

  // footer-group default placeholder
  '<p>Share contact information, store details, and brand content with your customers.</p>':
    '<p>Deel contactgegevens, winkelinformatie en merkcontent met je klanten.</p>',

  // index.json — guided finder / measurement section
  'Browse the range': 'Bekijk het assortiment',
  'How to choose your radiator': 'Zo kies je jouw radiator',
  'Measure your space': 'Meet je ruimte op',
  '<p>Use the room area in m² and the ceiling height to estimate the heat output you need. We list watt requirements per category.</p>':
    '<p>Gebruik de oppervlakte in m² en de plafondhoogte om in te schatten hoeveel warmte je nodig hebt. Per categorie vermelden we het benodigde wattage.</p>',
  'Choose your output': 'Kies het vermogen',
  '<p>Pick the wattage that matches your room. Most living rooms need 80–100 W per m² for radiator-only heating.</p>':
    '<p>Kies het wattage dat bij je ruimte past. De meeste woonkamers vragen 80–100 W per m² als je alleen met radiatoren stookt.</p>',
  'Pick your finish': 'Kies je afwerking',
  '<p>Anthrazit, Schwarz or Weiß — each finish ships with the same EU-warranted core and 10-year corrosion guarantee.</p>':
    '<p>Antraciet, zwart of wit — elke afwerking heeft dezelfde EU-gegarandeerde kern en 10 jaar corrosiegarantie.</p>',

  // Payment method labels are brand names — passthrough by leaving them in the
  // dictionary as-is so the runner does not flag them as "missing".
  'Visa': 'Visa',
  'Mastercard': 'Mastercard',
  'American Express': 'American Express',
  'PayPal': 'PayPal',
  'Klarna': 'Klarna',
  'Apple Pay': 'Apple Pay',
  'Google Pay': 'Google Pay',
};

const FR_TRANSLATIONS = {
  // header-group.json (announcement bar USPs)
  'Expert advice — reply within 2 hours': 'Conseils d’expert — réponse en 2 heures',
  '10-year warranty': 'Garantie 10 ans',
  'Fast EU delivery': 'Livraison rapide en UE',
  'Secure checkout · Klarna · PayPal': 'Paiement sécurisé · Klarna · PayPal',

  // footer-group.json
  'Quick links': 'Liens rapides',
  'Info': 'Info',
  'Legal': 'Mentions légales',
  'Our mission': 'Notre mission',
  'Subscribe to our emails': 'S’abonner à la newsletter',
  'Payment methods': 'Moyens de paiement',

  // article.json
  'Share': 'Partager',

  // cart.json
  'Featured collection': 'Collection en vedette',

  // index.json — hero
  'Warmth that feels like home.': 'Une chaleur qui sent bon la maison.',
  'Radiators, towel warmers, and underfloor heating built to German standards. 10-year warranty on every unit, free EU delivery.':
    'Radiateurs, sèche-serviettes et planchers chauffants conformes aux normes allemandes. Garantie 10 ans sur chaque produit, livraison gratuite en UE.',
  'Shop radiators': 'Voir les radiateurs',
  'Expert advice': 'Conseils d’expert',

  // index.json — category-grid + bestsellers
  'Find your radiator.': 'Trouvez votre radiateur.',
  'Popular radiators': 'Radiateurs populaires',

  // index.json — trust-badges
  'Built for your home': 'Conçu pour votre intérieur',
  'Why choose G-Berg.': 'Pourquoi G-Berg.',

  // index.json — value-props
  'German engineering': 'Ingénierie allemande',
  'Built to German standards, TÜV-tested.': 'Conforme aux normes allemandes, certifié TÜV.',
  '<p>Every G-Berg radiator is manufactured to DIN EN 442 and arrives ready for your plumber. Powder-coated steel, corrosion-resistant, and sized for retrofit into existing connections.</p>':
    '<p>Chaque radiateur G-Berg est fabriqué selon la norme DIN EN 442 et arrive prêt à être installé par votre plombier. Acier thermolaqué, résistant à la corrosion, dimensionné pour les raccordements existants.</p>',
  'Peace of mind, baked in.': 'La tranquillité d’esprit, garantie.',
  '<p>Material and workmanship covered for a full decade. If anything fails, we handle it — no back-and-forth with the manufacturer.</p>':
    '<p>Matériaux et fabrication couverts pendant dix ans. En cas de défaut, nous nous en occupons — sans intermédiaire avec le fabricant.</p>',
  'Europe-wide shipping': 'Livraison dans toute l’UE',
  'Free delivery across the EU.': 'Livraison gratuite dans toute l’UE.',
  '<p>Shipping free to Germany, Belgium, Netherlands, Austria, and Spain. 2–4 business days from our Schwelm warehouse. Damage-free guarantee.</p>':
    '<p>Livraison gratuite vers l’Allemagne, la Belgique, les Pays-Bas, l’Autriche et l’Espagne. 2 à 4 jours ouvrés depuis notre entrepôt de Schwelm. Garantie livraison sans dommage.</p>',

  // index.json — testimonials + faq + newsletter
  'Customer stories': 'Témoignages clients',
  'What our customers say.': 'Ce que disent nos clients.',
  'FAQ': 'FAQ',
  'Questions, answered.': 'Vos questions, nos réponses.',
  'Stay warm with G-Berg.': 'Restez au chaud avec G-Berg.',
  '<p>Seasonal tips, radiator guides, and early access to new products. No spam — promise.</p>':
    '<p>Conseils saisonniers, guides radiateurs et avant-premières produits. Pas de spam — promis.</p>',

  // list-collections.json
  'Collections': 'Collections',

  // password.json
  'Opening soon': 'Ouverture prochaine',
  '<p>Be the first to know when we launch.</p>': '<p>Soyez le premier informé de notre lancement.</p>',

  // product.json — section copy
  'Materials': 'Matériaux',
  'Shipping & Returns': 'Livraison & Retours',
  'Dimensions': 'Dimensions',
  'Care Instructions': 'Conseils d’entretien',
  'Specs & details.': 'Caractéristiques & détails.',
  'Technical datasheet': 'Fiche technique',
  'Download': 'Télécharger',
  'Save with the set': 'Économisez avec l’ensemble',
  'View': 'Voir',
  'You may also like': 'Vous aimerez aussi',

  // footer-group default placeholder
  '<p>Share contact information, store details, and brand content with your customers.</p>':
    '<p>Partagez vos coordonnées, les informations sur la boutique et le contenu de marque avec vos clients.</p>',

  // index.json — guided finder / measurement section
  'Browse the range': 'Voir la gamme',
  'How to choose your radiator': 'Comment choisir votre radiateur',
  'Measure your space': 'Mesurez votre pièce',
  '<p>Use the room area in m² and the ceiling height to estimate the heat output you need. We list watt requirements per category.</p>':
    '<p>Utilisez la surface en m² et la hauteur sous plafond pour estimer la puissance de chauffe nécessaire. Nous indiquons le besoin en watts par catégorie.</p>',
  'Choose your output': 'Choisissez la puissance',
  '<p>Pick the wattage that matches your room. Most living rooms need 80–100 W per m² for radiator-only heating.</p>':
    '<p>Choisissez la puissance adaptée à votre pièce. La plupart des salons demandent 80 à 100 W par m² en chauffage par radiateurs seuls.</p>',
  'Pick your finish': 'Choisissez la finition',
  '<p>Anthrazit, Schwarz or Weiß — each finish ships with the same EU-warranted core and 10-year corrosion guarantee.</p>':
    '<p>Anthracite, noir ou blanc — chaque finition partage le même corps garanti UE et 10 ans de garantie anti-corrosion.</p>',

  // Payment-method labels are brand names — passthrough.
  'Visa': 'Visa',
  'Mastercard': 'Mastercard',
  'American Express': 'American Express',
  'PayPal': 'PayPal',
  'Klarna': 'Klarna',
  'Apple Pay': 'Apple Pay',
  'Google Pay': 'Google Pay',
};

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

  // index.json — guided finder / measurement section
  'Browse the range': 'Sortiment ansehen',
  'How to choose your radiator': 'So wählst du deinen Heizkörper',
  'Measure your space': 'Raum ausmessen',
  '<p>Use the room area in m² and the ceiling height to estimate the heat output you need. We list watt requirements per category.</p>':
    '<p>Mit der Raumfläche in m² und der Deckenhöhe schätzt du die benötigte Heizleistung ab. Den Wattbedarf je Kategorie listen wir auf.</p>',
  'Choose your output': 'Heizleistung wählen',
  '<p>Pick the wattage that matches your room. Most living rooms need 80–100 W per m² for radiator-only heating.</p>':
    '<p>Wähle die Wattleistung passend zu deinem Raum. Die meisten Wohnzimmer benötigen 80–100 W pro m², wenn nur über Heizkörper geheizt wird.</p>',
  'Pick your finish': 'Oberfläche wählen',
  '<p>Anthrazit, Schwarz or Weiß — each finish ships with the same EU-warranted core and 10-year corrosion guarantee.</p>':
    '<p>Anthrazit, Schwarz oder Weiß — jede Variante hat denselben EU-garantierten Kern und 10 Jahre Korrosionsgarantie.</p>',

  // Payment-method labels are brand names — passthrough.
  'Visa': 'Visa',
  'Mastercard': 'Mastercard',
  'American Express': 'American Express',
  'PayPal': 'PayPal',
  'Klarna': 'Klarna',
  'Apple Pay': 'Apple Pay',
  'Google Pay': 'Google Pay',
};

// Liquid template strings we deliberately don't translate (already merchant-aware)
const LIQUID_PASSTHROUGH = /^\s*\{\{[^}]+\}\}\s*$/;

// Locale → dictionary lookup. Adding a new locale means adding a constant
// dictionary above and registering it here.
const DICTIONARIES = {
  nl: NL_TRANSLATIONS,
  de: DE_TRANSLATIONS,
  fr: FR_TRANSLATIONS,
};

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
  const DICT = DICTIONARIES[LOCALE];
  if (!DICT) {
    console.error(`[translate] No dictionary registered for locale "${LOCALE}".`);
    console.error(`            Available: ${Object.keys(DICTIONARIES).join(', ')}`);
    process.exit(1);
  }
  console.log(`[translate] store=${STORE} domain=${storeDomain} locale=${LOCALE} dry=${DRY_RUN} dict_size=${Object.keys(DICT).length}`);
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
      const targetValue = DICT[c.value];
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
  console.log(`  missing(no ${LOCALE.toUpperCase()}) : ${missing.length}`);
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
