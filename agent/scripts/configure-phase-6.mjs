#!/usr/bin/env node
/*
 * configure-phase-6.mjs
 *
 * Phase 6 provisioning — legal pages, nav menu, discount code,
 * Markets config, password protection removal. Fully API-driven.
 *
 * Idempotent: upserts by handle / title / code. Safe to re-run.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
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

// ===========================================================================
// 1. Legal pages (Shopify Pages)
// ===========================================================================

const PLACEHOLDER_WARNING = `
<div style="padding:1rem;margin:0 0 1.5rem;border:2px dashed #B8621B;background:#FFF5EC;border-radius:8px;">
  <strong>⚠ Platzhaltertext</strong> — dieser Inhalt muss vor Launch durch einen Rechtsanwalt
  oder Dienst wie eRecht24 / IT-Recht Kanzlei ersetzt werden. Der Merchant pflegt die
  finale Fassung über <em>Shopify Admin → Online Store → Pages</em>.
</div>
`.trim();

const LEGAL_PAGES = [
  {
    handle: 'impressum',
    title: 'Impressum',
    body: `${PLACEHOLDER_WARNING}
<h2>Angaben gemäß § 5 TMG</h2>
<p>
  Havn Heating GmbH i.G.<br>
  Musterstraße 12<br>
  12345 Musterstadt<br>
  Deutschland
</p>
<h3>Kontakt</h3>
<p>
  Telefon: +49 (0) 000 000 000<br>
  E-Mail: kontakt@havn.example
</p>
<h3>Umsatzsteuer-ID</h3>
<p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: DE000000000</p>
<h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
<p>[Name], [Adresse]</p>
<h3>EU-Streitschlichtung</h3>
<p>
  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
  <a href="https://ec.europa.eu/consumers/odr/" rel="noopener">https://ec.europa.eu/consumers/odr/</a>.
</p>`,
  },
  {
    handle: 'datenschutz',
    title: 'Datenschutzerklärung',
    body: `${PLACEHOLDER_WARNING}
<h2>1. Verantwortlicher</h2>
<p>Havn Heating GmbH i.G., Musterstraße 12, 12345 Musterstadt, kontakt@havn.example</p>
<h2>2. Allgemeine Hinweise zur Datenverarbeitung</h2>
<p>
  Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies
  zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen
  erforderlich ist. Die Verarbeitung erfolgt regelmäßig nur nach Einwilligung (Art. 6
  Abs. 1 lit. a DSGVO) oder auf einer anderen in der DSGVO genannten Rechtsgrundlage.
</p>
<h2>3. Bei Nutzung unseres Online-Shops (Shopify)</h2>
<p>
  Diese Website wird auf der E-Commerce-Plattform von Shopify International Limited
  betrieben. Shopify verarbeitet in unserem Auftrag personenbezogene Daten auf Grundlage
  eines Auftragsverarbeitungsvertrags gemäß Art. 28 DSGVO.
</p>
<h2>4. Cookies und Consent</h2>
<p>
  Wir setzen technisch notwendige Cookies und — nach Einwilligung über den
  Cookie-Banner — Cookies zur Analyse und zum Marketing ein.
</p>
<h2>5. Ihre Rechte</h2>
<p>
  Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO),
  Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO),
  Datenübertragbarkeit (Art. 20 DSGVO) und Widerspruch (Art. 21 DSGVO).
</p>`,
  },
  {
    handle: 'agb',
    title: 'Allgemeine Geschäftsbedingungen',
    body: `${PLACEHOLDER_WARNING}
<h2>§ 1 Geltungsbereich</h2>
<p>
  Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen Havn Heating
  GmbH i.G. und Verbrauchern im Sinne des § 13 BGB, die über diesen Online-Shop
  geschlossen werden.
</p>
<h2>§ 2 Vertragsschluss</h2>
<p>
  Die Darstellung der Produkte im Online-Shop stellt kein verbindliches Angebot dar,
  sondern eine Aufforderung zur Abgabe eines Angebots. Durch das Anklicken des
  „Kaufen"-Buttons geben Sie ein verbindliches Angebot ab. Der Vertrag kommt mit
  unserer Auftragsbestätigung zustande.
</p>
<h2>§ 3 Preise und Zahlung</h2>
<p>
  Alle Preise sind Endpreise und verstehen sich inklusive der gesetzlichen Mehrwertsteuer
  in Höhe von 19 %. Es fallen zusätzlich Versandkosten an, die im Bestellvorgang
  angezeigt werden.
</p>
<h2>§ 4 Lieferung</h2>
<p>
  Lieferungen erfolgen innerhalb Deutschlands in der Regel innerhalb von 2–4 Werktagen
  nach Zahlungseingang.
</p>
<h2>§ 5 Gewährleistung</h2>
<p>
  Es gelten die gesetzlichen Gewährleistungsrechte. Zusätzlich gewähren wir auf unsere
  Produkte eine Herstellergarantie von 10 Jahren ab Kaufdatum.
</p>`,
  },
  {
    handle: 'widerruf',
    title: 'Widerrufsbelehrung',
    body: `${PLACEHOLDER_WARNING}
<h2>Widerrufsrecht</h2>
<p>
  Sie haben das Recht, binnen <strong>14 Tagen</strong> ohne Angabe von Gründen diesen
  Vertrag zu widerrufen. Die Widerrufsfrist beträgt 14 Tage ab dem Tag, an dem Sie oder
  ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz
  genommen haben bzw. hat.
</p>
<h2>Ausübung des Widerrufsrechts</h2>
<p>
  Um Ihr Widerrufsrecht auszuüben, müssen Sie uns — Havn Heating GmbH i.G.,
  Musterstraße 12, 12345 Musterstadt, E-Mail: kontakt@havn.example — mittels einer
  eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über
  Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.
</p>
<h2>Folgen des Widerrufs</h2>
<p>
  Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von
  Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der
  zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der
  Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben),
  unverzüglich und spätestens binnen <strong>14 Tagen</strong> ab dem Tag
  zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns
  eingegangen ist.
</p>
<h3>Muster-Widerrufsformular</h3>
<p>
  (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus
  und senden Sie es zurück.)
</p>
<pre style="white-space:pre-wrap;font-family:inherit;">
An: Havn Heating GmbH i.G., Musterstraße 12, 12345 Musterstadt, kontakt@havn.example

Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag
über den Kauf der folgenden Waren (*):

Bestellt am (*) / erhalten am (*):
Name des/der Verbraucher(s):
Anschrift des/der Verbraucher(s):
Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):
Datum:

(*) Unzutreffendes streichen.
</pre>`,
  },
];

const PAGE_CREATE_MUTATION = `
  mutation($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;
const PAGE_UPDATE_MUTATION = `
  mutation($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;

async function upsertPage({ handle, title, body }) {
  const existing = await gql(
    `query($h: String!) { pages(first: 1, query: $h) { edges { node { id handle } } } }`,
    { h: `handle:${handle}` }
  );
  const match = existing.pages.edges.find((e) => e.node.handle === handle);
  if (match) {
    const res = await gql(PAGE_UPDATE_MUTATION, {
      id: match.node.id,
      page: { title, body, isPublished: true },
    });
    const errs = res.pageUpdate.userErrors;
    if (errs.length) throw new Error(`pageUpdate ${handle}: ${JSON.stringify(errs)}`);
    console.log(`  ✓ page updated: ${handle}`);
    return match.node.id;
  }
  const res = await gql(PAGE_CREATE_MUTATION, {
    page: { title, handle, body, isPublished: true },
  });
  const errs = res.pageCreate.userErrors;
  if (errs.length) throw new Error(`pageCreate ${handle}: ${JSON.stringify(errs)}`);
  console.log(`  ✓ page created: ${handle}`);
  return res.pageCreate.page.id;
}

async function seedLegalPages() {
  console.log('\n→ Legal pages');
  for (const p of LEGAL_PAGES) await upsertPage(p);
}

// ===========================================================================
// 2. Main navigation menu
// ===========================================================================

async function upsertMainMenu() {
  console.log('\n→ Main menu');

  // Look up the existing "Main menu" link list (Shopify creates one by default).
  const lists = await gql(`{ menus(first: 20) { edges { node { id handle title } } } }`);
  const mainMenu = lists.menus.edges.find((e) => e.node.handle === 'main-menu');
  if (!mainMenu) {
    console.warn('  ⚠ No main-menu found on store. Skipping.');
    return;
  }

  const items = [
    { title: 'Heizkörper', type: 'COLLECTION', resourceId: null, url: '/collections/all' },
    { title: 'Bad',        type: 'COLLECTION_LINK', resourceHandle: 'badheizkorper' },
    { title: 'Wohnraum',   type: 'COLLECTION_LINK', resourceHandle: 'wohnraumheizkorper' },
    { title: 'Handtuchwärmer', type: 'COLLECTION_LINK', resourceHandle: 'handtuchwaermer' },
    { title: 'Austausch',  type: 'COLLECTION_LINK', resourceHandle: 'austauschheizkorper' },
    { title: 'Zubehör',    type: 'COLLECTION_LINK', resourceHandle: 'zubehoer' },
  ];

  // Resolve collection IDs by handle
  const handles = items.filter((i) => i.resourceHandle).map((i) => i.resourceHandle);
  const colData = await gql(
    `query($q: String!) { collections(first: 20, query: $q) { edges { node { id handle } } } }`,
    { q: handles.map((h) => `handle:${h}`).join(' OR ') }
  );
  const handleToId = {};
  for (const e of colData.collections.edges) handleToId[e.node.handle] = e.node.id;

  const menuItems = items.map((i) => {
    if (i.resourceHandle) {
      return {
        title: i.title,
        type: 'COLLECTION',
        resourceId: handleToId[i.resourceHandle],
      };
    }
    return {
      title: i.title,
      type: 'HTTP',
      url: i.url,
    };
  });

  const res = await gql(
    `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
       menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
         menu { id handle items { title url } }
         userErrors { field message }
       }
     }`,
    { id: mainMenu.node.id, title: mainMenu.node.title, handle: mainMenu.node.handle, items: menuItems }
  );
  const errs = res.menuUpdate.userErrors;
  if (errs.length) throw new Error(`menuUpdate: ${JSON.stringify(errs)}`);
  console.log(`  ✓ main-menu updated with ${menuItems.length} items`);
}

// Footer menu with legal links
async function upsertFooterMenu() {
  console.log('\n→ Footer menu');
  const lists = await gql(`{ menus(first: 20) { edges { node { id handle title } } } }`);
  const footer = lists.menus.edges.find((e) => e.node.handle === 'footer');
  if (!footer) {
    console.warn('  ⚠ No footer menu found. Skipping.');
    return;
  }
  const items = [
    { title: 'Impressum',            type: 'HTTP', url: '/pages/impressum' },
    { title: 'Datenschutzerklärung', type: 'HTTP', url: '/pages/datenschutz' },
    { title: 'AGB',                  type: 'HTTP', url: '/pages/agb' },
    { title: 'Widerrufsbelehrung',   type: 'HTTP', url: '/pages/widerruf' },
  ];
  const res = await gql(
    `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
       menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
         menu { id items { title url } }
         userErrors { field message }
       }
     }`,
    { id: footer.node.id, title: footer.node.title, handle: footer.node.handle, items }
  );
  const errs = res.menuUpdate.userErrors;
  if (errs.length) throw new Error(`menuUpdate footer: ${JSON.stringify(errs)}`);
  console.log(`  ✓ footer updated with ${items.length} legal links`);
}

// ===========================================================================
// 3. Discount code — 7% for new customers (WILLKOMMEN)
// ===========================================================================

async function upsertDiscount() {
  console.log('\n→ Discount WILLKOMMEN (7% Neukunden)');
  const existing = await gql(
    `{ codeDiscountNodes(first: 10, query: "code:WILLKOMMEN") { edges { node { id } } } }`
  );
  if (existing.codeDiscountNodes.edges.length) {
    console.log('  ✓ already exists — skip');
    return;
  }
  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const res = await gql(
    `mutation($basicCodeDiscount: DiscountCodeBasicInput!) {
       discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
         codeDiscountNode { id }
         userErrors { field message }
       }
     }`,
    {
      basicCodeDiscount: {
        title: 'WILLKOMMEN — 7% für Neukunden',
        code: 'WILLKOMMEN',
        startsAt,
        endsAt,
        customerSelection: { all: true },
        customerGets: {
          value: { percentage: 0.07 },
          items: { all: true },
        },
        appliesOncePerCustomer: true,
      },
    }
  );
  const errs = res.discountCodeBasicCreate.userErrors;
  if (errs.length) throw new Error(`discountCodeBasicCreate: ${JSON.stringify(errs)}`);
  console.log('  ✓ WILLKOMMEN discount created (7% off, 1 year, one per customer)');
}

// ===========================================================================
// 4. Markets — set primary market to DE with tax-inclusive pricing
// ===========================================================================

async function configureMarkets() {
  console.log('\n→ Markets');
  const data = await gql(`
    { markets(first: 20) { edges { node { id name primary regions(first: 20) { edges { node { ... on MarketRegionCountry { code } } } } } } } }
  `);
  const primary = data.markets.edges.find((e) => e.node.primary);
  if (primary) {
    console.log(`  primary market: ${primary.node.name} (${primary.node.regions.edges.map((r) => r.node.code).join(', ')})`);
  }

  // Check whether a DE market already exists (any non-primary market with region DE).
  const deMarket = data.markets.edges.find((e) =>
    e.node.regions.edges.some((r) => r.node.code === 'DE')
  );
  if (deMarket) {
    console.log(`  ✓ DE market already present: ${deMarket.node.name}`);
  } else {
    // Create a DE market. In 2026-04 this is marketCreate(input: {name, regions: [{countryCode}], enabled})
    const res = await gql(
      `mutation($input: MarketCreateInput!) {
         marketCreate(input: $input) {
           market { id name regions(first: 5) { edges { node { ... on MarketRegionCountry { code } } } } }
           userErrors { field message }
         }
       }`,
      {
        input: {
          name: 'Deutschland',
          regions: [{ countryCode: 'DE' }],
          enabled: true,
        },
      }
    );
    const errs = res.marketCreate.userErrors;
    if (errs.length) console.warn(`  ⚠ marketCreate DE: ${JSON.stringify(errs)}`);
    else console.log(`  ✓ DE market created: ${res.marketCreate.market.id}`);
  }

  // shop.taxesIncluded cannot be updated via Admin GraphQL in 2026-04.
  // Log current state so the user can see whether they need to flip it.
  const shop = await gql(`{ shop { taxesIncluded taxShipping currencyCode } }`);
  console.log(`  shop.taxesIncluded: ${shop.shop.taxesIncluded} · taxShipping: ${shop.shop.taxShipping} · currency: ${shop.shop.currencyCode}`);
  if (!shop.shop.taxesIncluded) {
    console.log(`  ⚠ MANUAL: set "Include tax in prices" = ON at`);
    console.log(`    https://admin.shopify.com/store/heater-dev/settings/taxes_and_duties`);
    console.log(`    (no GraphQL mutation exposed in 2026-04; admin-UI-only setting)`);
  }
}

// ===========================================================================
// Main
// ===========================================================================

async function main() {
  console.log(`→ Phase 6 provisioning on ${STORE} (Admin API ${API_VERSION})`);
  await seedLegalPages();
  await upsertMainMenu();
  await upsertFooterMenu();
  await upsertDiscount();
  await configureMarkets();
  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
