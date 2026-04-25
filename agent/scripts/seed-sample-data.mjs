#!/usr/bin/env node
/*
 * seed-sample-data.mjs
 *
 * Date:    2026-04-23
 * Purpose: Seed sample metaobject entries (trust_badge, testimonial,
 *          usp_item, faq_item, spec_section) on the dev store so theme
 *          sections render something visible during development.
 *
 * IDEMPOTENT: uses metaobjectUpsert with stable handles. Re-runs are safe
 * and will NOT create duplicates. Merchant edits to an existing handle
 * are preserved — this script only upserts fields we explicitly list.
 *
 * Env (loaded from .env.local at repo root):
 *   SHOPIFY_DEV_STORE
 *   SHOPIFY_DEV_ADMIN_TOKEN
 *
 * Run:
 *   node agent/scripts/seed-sample-data.mjs
 *
 * Docs:
 *   https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/metaobjectUpsert
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
if (!STORE || !TOKEN) {
  console.error('Missing SHOPIFY_DEV_STORE or SHOPIFY_DEV_ADMIN_TOKEN');
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL error ${res.status}: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

const UPSERT = `
  mutation upsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle type }
      userErrors { field message code }
    }
  }
`;

async function upsertEntry(type, handle, fields) {
  const vars = {
    handle: { type, handle },
    metaobject: {
      fields: Object.entries(fields).map(([key, value]) => ({ key, value: String(value) })),
    },
  };
  const data = await gql(UPSERT, vars);
  const { metaobject, userErrors } = data.metaobjectUpsert;
  if (userErrors.length) {
    throw new Error(`${type}/${handle}: ${JSON.stringify(userErrors)}`);
  }
  console.log(`[upsert] ${type}:${handle} → ${metaobject.id}`);
  return metaobject.id;
}

/**
 * Register DE translations against a metaobject's translatable fields.
 * Looks up current source digests so Shopify accepts the registration.
 * Silently skips fields not present in the translatable content list.
 */
async function registerGermanFields(gid, deFields) {
  const entries = Object.entries(deFields || {}).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return;
  const { translatableResource } = await gql(
    `query ($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest }
      }
    }`,
    { id: gid },
  );
  const digestFor = Object.fromEntries(
    (translatableResource?.translatableContent ?? []).map((c) => [c.key, c.digest]),
  );
  const translations = entries
    .filter(([key]) => digestFor[key])
    .map(([key, value]) => ({
      key,
      locale: 'de',
      value: String(value),
      translatableContentDigest: digestFor[key],
    }));
  if (translations.length === 0) return;
  await gql(
    `mutation ($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        userErrors { field message }
      }
    }`,
    { id: gid, t: translations },
  );
}

// ---------------------------------------------------------------------------
// Seed payloads — content in German, the primary market language.
// ---------------------------------------------------------------------------

// EN primary (store default locale) + DE translation registered via
// translationsRegister after upsert. Per CLAUDE.md: English is the source of truth.
const TRUST_BADGES = [
  { handle: 'tb-garantie',
    en: { label: '10-year warranty', body: 'On every product' },
    de: { label: '10 Jahre Garantie', body: 'Auf jedes Produkt' } },
  { handle: 'tb-versand',
    en: { label: 'Free shipping', body: 'Free delivery across the EU' },
    de: { label: 'Kostenloser Versand', body: 'Versand in der gesamten EU' } },
  { handle: 'tb-tuev',
    en: { label: 'TÜV certified', body: 'Built to DIN EN 442' },
    de: { label: 'TÜV geprüft', body: 'Nach DIN EN 442' } },
  { handle: 'tb-service',
    en: { label: 'German service', body: 'Mon–Fri customer care' },
    de: { label: 'Deutscher Service', body: 'Mo–Fr erreichbar' } },
];

const USP_ITEMS = [
  { handle: 'usp-beratung',
    en: { label: 'Expert advice', body: 'Heating specialists by phone and email' },
    de: { label: 'Expertenberatung', body: 'Kompetente Fachberatung per Telefon & E-Mail' } },
  { handle: 'usp-zahlung',
    en: { label: 'Secure payment', body: 'Klarna, PayPal, card' },
    de: { label: 'Sichere Zahlung', body: 'Klarna, PayPal, Kreditkarte' } },
  { handle: 'usp-lieferung',
    en: { label: 'Fast delivery', body: 'At your door in 2–4 business days' },
    de: { label: 'Schnelle Lieferung', body: 'In 2–4 Werktagen bei dir' } },
  { handle: 'usp-qualitaet',
    en: { label: 'German quality', body: 'Tested and certified' },
    de: { label: 'Deutsche Qualität', body: 'Geprüft & zertifiziert' } },
];

const TESTIMONIALS = [
  { handle: 't-martina', name: 'Martina K.', rating: 5, source: 'Google',
    en: { role: 'Customer for 2 years',
          quote: 'Top quality and performance. The radiator looks exactly like the photos and heats beautifully.' },
    de: { role: 'Kundin seit 2 Jahren',
          quote: 'Top Qualität und Leistung. Der Heizkörper sieht genauso aus wie auf den Fotos und heizt hervorragend.' } },
  { handle: 't-thomas', name: 'Thomas B.', rating: 5, source: 'Judge.me',
    en: { role: 'Hamburg',
          quote: 'Fast delivery and flawless packaging. Installation was no problem with the instructions.' },
    de: { role: 'Hamburg',
          quote: 'Schnelle Lieferung und tadellose Verpackung. Die Montage war mit der Anleitung kein Problem.' } },
  { handle: 't-claudia', name: 'Claudia S.', rating: 5, source: 'Trusted Shops',
    en: { role: 'Bathroom renovation',
          quote: 'Excellent advice beforehand — all my questions were answered patiently. Highly recommended.' },
    de: { role: 'Bad-Renovierung',
          quote: 'Perfekte Beratung im Vorfeld, alle meine Fragen wurden geduldig beantwortet. Sehr empfehlenswert.' } },
  { handle: 't-jan', name: 'Jan H.', rating: 4, source: 'Google',
    en: { role: 'Single-family home',
          quote: 'Exactly as described. The quality really is impressive for the price.' },
    de: { role: 'Einfamilienhaus',
          quote: 'Genau wie beschrieben. Die Qualität ist für den Preis wirklich überzeugend.' } },
];

// Shopify rich_text JSON helper: one paragraph from plain text.
function rtParagraph(text) {
  return JSON.stringify({
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: text }] },
    ],
  });
}

const FAQ_ITEMS = [
  { handle: 'faq-lieferung',
    en: { category: 'general', question: 'How long does delivery take?',
          answer: rtParagraph('We deliver across the EU in 2–4 business days. Once payment is confirmed you receive a shipping confirmation with a tracking link.') },
    de: { category: 'allgemein', question: 'Wie lange dauert die Lieferung?',
          answer: rtParagraph('Innerhalb der EU liefern wir in 2–4 Werktagen. Nach Zahlungseingang erhalten Sie eine Versandbestätigung mit Tracking-Link.') } },
  { handle: 'faq-garantie',
    en: { category: 'warranty', question: 'Do the radiators come with a warranty?',
          answer: rtParagraph('Yes — every product carries a 10-year warranty on material and workmanship. Full terms are in our Terms of Service.') },
    de: { category: 'garantie', question: 'Gibt es eine Garantie auf die Heizkörper?',
          answer: rtParagraph('Ja, wir gewähren auf jedes Produkt 10 Jahre Garantie auf Material und Verarbeitung. Details finden Sie in unseren AGB.') } },
  { handle: 'faq-zahlung',
    en: { category: 'payment', question: 'Which payment methods do you accept?',
          answer: rtParagraph('Klarna (invoice / instalments), PayPal, credit card (Visa, Mastercard, Amex), Apple Pay, and Google Pay.') },
    de: { category: 'zahlung', question: 'Welche Zahlungsarten bieten Sie an?',
          answer: rtParagraph('Klarna (Rechnung / Ratenkauf), PayPal, Kreditkarte (Visa, Mastercard, Amex), Apple Pay und Google Pay.') } },
  { handle: 'faq-montage',
    en: { category: 'installation', question: 'Is installation difficult?',
          answer: rtParagraph('Most radiators install in 30–60 minutes. An illustrated guide ships with every product.') },
    de: { category: 'montage', question: 'Ist die Montage schwierig?',
          answer: rtParagraph('Die meisten Heizkörper lassen sich in 30–60 Minuten montieren. Eine bebilderte Anleitung liegt jedem Produkt bei.') } },
  { handle: 'faq-ruecksendung',
    en: { category: 'general', question: 'Can I return a product?',
          answer: rtParagraph('Yes — you have a 14-day statutory right of withdrawal from the day you receive the goods. Returns are free for you.') },
    de: { category: 'allgemein', question: 'Kann ich die Ware zurückgeben?',
          answer: rtParagraph('Ja, Sie haben ein gesetzliches Widerrufsrecht von 14 Tagen ab Erhalt der Ware. Die Rücksendung ist für Sie kostenfrei.') } },
];

const SPEC_SECTIONS = [
  { handle: 'spec-warum', title: 'Warum G-Berg wählen?',
    bullets: JSON.stringify(['Modernes Design', 'Einfache Installation', 'Hohe Heizleistung', '10 Jahre Garantie']),
    body: JSON.stringify({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Heizkörper, die Design und Funktion vereinen — für jedes Zuhause.' }] }] }) },
  { handle: 'spec-lieferumfang', title: 'Lieferumfang',
    bullets: JSON.stringify(['Heizkörper', 'Befestigungsmaterial', 'Wand-/Deckenhalter', 'Montageanleitung']) },
  { handle: 'spec-technik', title: 'Technische Daten',
    bullets: JSON.stringify(['Material: SPCC Stahl', 'Oberfläche: Pulverbeschichtet', 'Anschluss: G 1/2"', 'Konform: DIN EN 442, TÜV geprüft']) },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`→ Seeding sample data on ${STORE} (Admin API ${API_VERSION})`);

  // trust_badge.icon and usp_item.icon are both optional (schema relaxed via
  // metaobjectDefinitionUpdate). Seeded without icons; merchant can add
  // SVG/PNG icons per entry via Admin → Content → Metaobjects later.
  for (const e of TRUST_BADGES) {
    const gid = await upsertEntry('trust_badge', e.handle, e.en);
    await registerGermanFields(gid, e.de);
  }
  for (const e of USP_ITEMS) {
    const gid = await upsertEntry('usp_item', e.handle, e.en);
    await registerGermanFields(gid, e.de);
  }

  for (const e of TESTIMONIALS) {
    const gid = await upsertEntry('testimonial', e.handle, {
      name: e.name,
      role: e.en.role,
      quote: e.en.quote,
      rating: String(e.rating),
      source: e.source,
    });
    await registerGermanFields(gid, { role: e.de.role, quote: e.de.quote });
  }
  for (const e of FAQ_ITEMS) {
    const gid = await upsertEntry('faq_item', e.handle, {
      question: e.en.question,
      answer: e.en.answer,
      category: e.en.category,
    });
    await registerGermanFields(gid, { question: e.de.question, answer: e.de.answer, category: e.de.category });
  }
  for (const e of SPEC_SECTIONS) {
    const fields = { title: e.title };
    if (e.bullets) fields.bullets = e.bullets;
    if (e.body) fields.body = e.body;
    await upsertEntry('spec_section', e.handle, fields);
  }

  const total = TESTIMONIALS.length + FAQ_ITEMS.length + SPEC_SECTIONS.length;
  console.log(`\nDone. Upserted ${total} metaobject entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
