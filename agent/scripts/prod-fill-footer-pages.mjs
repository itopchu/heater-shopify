/**
 * Replace the EN source body of all 9 footer pages on the prod store
 * with content that reflects the current 2026-05 policies:
 *
 *   - Delivery to Germany, the Netherlands, Belgium and Luxembourg only.
 *   - Shipping is free — included in the listed price for every product.
 *     (Valve radiators carry a flat €20/unit surcharge baked into the
 *     price; the customer never sees a separate shipping line.)
 *   - Storefront supports four languages: English, Deutsch, Nederlands,
 *     Français. Older Spanish / Italian / Polish / Danish / Turkish /
 *     Hungarian copy is removed wherever it leaked into page bodies.
 *   - Single phone number, single email, single WhatsApp.
 *
 * Pages covered (alphabetical):
 *   about, contact, faq, imprint, privacy, returns, shipping, terms, warranty
 *
 * Imprint / Privacy / Terms keep their § 5 TMG / GDPR / AGB structure
 * from `prod-fill-legal-pages.mjs`; this script supersedes that one for
 * all three legal pages plus the six other footer pages.
 *
 * EN-only. After running this, re-register de/nl/fr translations via
 * `prod-translate-content.mjs --scope=pages --apply` (translatable
 * digests are bumped automatically by pageUpdate).
 *
 * Idempotent. --apply writes; default is dry-run.
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

// ---- Single source of truth for company + contact data ----
const C = {
  name: 'G-Berg GmbH',
  street: 'Hagenerstrasse 33',
  city: '58642 Iserlohn / Letmathe',
  countryEN: 'Germany',
  director: 'Gökberk Köylü',
  phone: '+49 172 608 88 48',
  phoneTel: '+491726088848',
  email: 'info@g-berg-gmbh.de',
  vat: 'DE450348934',
  warehouse: 'Seestrasse 2A, 58089 Hagen, Germany',
  whatsapp: 'https://wa.me/49172608848',
};

// ---- Page bodies ----

const ABOUT = `
<h2>About G-Berg</h2>
<p>G-Berg curates a tight selection of European radiators and heating components for homes in Germany, the Netherlands, Belgium and Luxembourg. Every product is CE-certified and ships with installer-grade documentation.</p>

<h3>What we sell</h3>
<p>Hydronic and electric radiators across eight design series, towel warmers for bathrooms, replacement panels sized to standard pipe centres, plus the matched accessories — mounting kits, valves, thermostat heads, heating elements.</p>

<h3>How we work</h3>
<p>Our catalogue is sourced from the German industry reference and translated into our four storefront languages — English, Deutsch, Nederlands, Français — before it reaches your screen. Pricing is in EUR and inclusive of local VAT.</p>

<h3>Talk to us</h3>
<p>Email <a href="mailto:${C.email}">${C.email}</a> or message us on <a href="${C.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>. A heating engineer answers, not a chatbot.</p>
`.trim();

const CONTACT = `
<h2>Contact</h2>
<p>Talk to a heating engineer, not a chatbot. Replies within two business hours during business hours.</p>

<h3>Channels</h3>
<ul>
  <li>Email: <a href="mailto:${C.email}">${C.email}</a></li>
  <li>Phone: <a href="tel:${C.phoneTel}">${C.phone}</a></li>
  <li>WhatsApp: <a href="${C.whatsapp}" target="_blank" rel="noopener">message us</a> (German)</li>
</ul>

<h3>Free dimensioning support</h3>
<p>Send your room measurements, photos of the existing radiators and (if known) heat-loss figures — we'll recommend the right model.</p>

<h3>Languages</h3>
<p>The storefront and our team operate in English, Deutsch, Nederlands and Français.</p>
`.trim();

const FAQ = `
<h2>Frequently asked questions</h2>

<h3>Where do you ship?</h3>
<p>Germany, the Netherlands, Belgium and Luxembourg. Addresses outside these four countries cannot check out at the moment.</p>

<h3>How much does shipping cost?</h3>
<p>Free for almost the entire catalog — the delivery cost is already included in the listed price, with no separate shipping charge at checkout. The two Aachen valve radiators (Typ 22 and Typ 33) are the only exception: they ship via our heavy carrier at €100 per order of up to 8 units, then €200 for 9–16 units, €300 for 17–24, and so on.</p>

<h3>Are your radiators heat-pump compatible?</h3>
<p>Many are. Look for the “Heat-pump ready” badge on the product card and in the spec sheet. The Aachen Typ 22 and Typ 33 models are designed for low-temperature heat-pump operation.</p>

<h3>Can I install a radiator myself?</h3>
<p>Hydronic radiators must be commissioned by a certified heating engineer to keep the warranty. Electric radiators can be installed by a qualified electrician. Plug-in heating elements ship with installer-grade instructions.</p>

<h3>What if the model I want is out of stock?</h3>
<p>Email <a href="mailto:${C.email}">${C.email}</a> — most items return to stock within 4–6 weeks and we hold orders without payment until you confirm.</p>

<h3>What languages does the storefront support?</h3>
<p>English, Deutsch, Nederlands and Français. Switch via the language toggle in the top-right corner of any page; your choice persists across navigation.</p>

<h3>What's the warranty?</h3>
<p>Ten years on the radiator body and two years on electronic components, per manufacturer terms.</p>
`.trim();

const SHIPPING = `
<h2>Shipping &amp; Delivery</h2>
<p>We deliver to Germany, the Netherlands, Belgium and Luxembourg only. Shipping is free for almost the entire catalog — only the two Aachen valve radiators (Typ 22 and Typ 33) carry a separate delivery fee, calculated at checkout.</p>

<h3>Free shipping — included in the price</h3>
<p>For every product except the two Aachen valve radiators, there is no separate shipping charge at checkout. The price on the product page is the price you pay (plus local VAT, also already included).</p>

<h3>Aachen valve radiators — heavy carrier delivery</h3>
<p>The Aachen Typ 22 and Typ 33 valve radiators ship via our specialist carrier and are billed at €100 per order of up to 8 units, scaling in 8-unit blocks (9–16 units = €200, 17–24 = €300, and so on). The exact delivery fee is shown in the cart and at checkout.</p>

<h3>Delivery countries</h3>
<p>Germany, Netherlands, Belgium, Luxembourg. Other addresses cannot be checked out.</p>

<h3>Delivery time</h3>
<p>Standard delivery: 3–7 business days after dispatch confirmation. You receive a tracking link by email when the carrier collects.</p>

<h3>Curbside delivery</h3>
<p>Items above 30 kg or 1.5 m require two-person handling on-site (ask your installer). Couriers do not carry up stairs.</p>
`.trim();

const RETURNS = `
<h2>Returns</h2>
<p>30-day returns on unused, unopened items in original packaging.</p>

<h3>How to start a return</h3>
<p>Email <a href="mailto:${C.email}">${C.email}</a> with your order number. We provide a return label and instructions within one business day.</p>

<h3>Refunds</h3>
<p>Refunds are issued to the original payment method within 14 days of receiving the returned item in re-saleable condition.</p>

<h3>Non-returnable items</h3>
<p>Bespoke and cut-to-length items are non-refundable. We flag this clearly on the product page and at checkout.</p>
`.trim();

const WARRANTY = `
<h2>Warranty</h2>
<p>Ten years on the radiator body. Two years on electronic components.</p>

<h3>What's covered</h3>
<p>All G-Berg radiators are CE-certified and tested against EN 442 output ratings. The body warranty covers manufacturing defects and corrosion of the heat-emitting structure under normal use.</p>

<h3>Conditions</h3>
<p>Warranty applies when the unit is installed by a certified heating engineer (or a qualified electrician for electric models) per the manufacturer's instructions, on water that meets standard quality requirements (VDI 2035 or local equivalent).</p>

<h3>Filing a claim</h3>
<p>Email <a href="mailto:${C.email}">${C.email}</a> with your order number, photos of the issue and the installation report. We respond within two business days.</p>
`.trim();

const IMPRINT = `
<h2>Information per § 5 TMG</h2>
<p>
  <strong>${C.name}</strong><br>
  ${C.street}<br>
  ${C.city}<br>
  ${C.countryEN}
</p>

<h3>Managing director</h3>
<p>${C.director}</p>

<h3>Contact</h3>
<p>
  Phone: <a href="tel:${C.phoneTel}">${C.phone}</a><br>
  Email: <a href="mailto:${C.email}">${C.email}</a>
</p>

<h3>VAT identification per § 27a UStG</h3>
<p>${C.vat}</p>

<h3>Warehouse</h3>
<p>${C.warehouse}</p>

<h3>Liability for content</h3>
<p>As a service provider we are responsible for our own content on these pages in accordance with § 7 (1) TMG. External links are checked at the time of placement; we have no continuing influence over their later content.</p>
`.trim();

const PRIVACY = `
<h2>Privacy</h2>
<p>How we handle personal data, in line with the GDPR.</p>

<h3>Controller</h3>
<p>${C.name}, ${C.street}, ${C.city}, ${C.countryEN}. Email: <a href="mailto:${C.email}">${C.email}</a>.</p>

<h3>Purposes and minimisation</h3>
<p>We process the minimum data needed to fulfil orders: contact details, delivery address, payment confirmations and anonymous analytics. We never sell customer data.</p>

<h3>Recipients</h3>
<p>Payment providers (Shopify Payments, Klarna, PayPal), shipping carriers (DHL and partners) and tax authorities — only what each needs to deliver your order.</p>

<h3>Markets</h3>
<p>We process orders for delivery to Germany, the Netherlands, Belgium and Luxembourg.</p>

<h3>Your rights</h3>
<p>Access, rectification, deletion, portability, withdrawal of consent. Email <a href="mailto:${C.email}">${C.email}</a>; we respond within one calendar month.</p>
`.trim();

const TERMS = `
<h2>Terms &amp; Conditions</h2>
<p>The terms governing orders placed on this storefront.</p>

<h3>Prices and currency</h3>
<p>Prices in EUR, inclusive of local VAT. Delivery to Germany, the Netherlands, Belgium and Luxembourg is free for almost the entire catalog; only the Aachen Typ 22 and Typ 33 valve radiators carry a separate carrier fee, calculated at checkout.</p>

<h3>Right of withdrawal</h3>
<p>30 days from delivery for unused, unopened items in original packaging. Bespoke and cut-to-length items are excluded.</p>

<h3>Warranty</h3>
<p>10 years on the radiator body, 2 years on electronic components, per manufacturer terms.</p>

<h3>Delivery scope</h3>
<p>We deliver to Germany, the Netherlands, Belgium and Luxembourg only. Orders to other addresses cannot be processed.</p>

<h3>Payment methods</h3>
<p>Klarna (availability varies per country), PayPal, Card, Apple Pay, Google Pay — handled by Shopify Payments. SEPA Direct Debit is not offered.</p>

<h3>Seller</h3>
<p>${C.name}, ${C.street}, ${C.city}, ${C.countryEN}. <a href="mailto:${C.email}">${C.email}</a>.</p>
`.trim();

const PAGES = [
  {handle: 'about',     title: 'About',                       body: ABOUT},
  {handle: 'contact',   title: 'Contact',                     body: CONTACT},
  {handle: 'faq',       title: 'Frequently Asked Questions',  body: FAQ},
  {handle: 'shipping',  title: 'Shipping & Delivery',         body: SHIPPING},
  {handle: 'returns',   title: 'Returns',                     body: RETURNS},
  {handle: 'warranty',  title: 'Warranty',                    body: WARRANTY},
  {handle: 'imprint',   title: 'Imprint',                     body: IMPRINT},
  {handle: 'privacy',   title: 'Privacy Policy',              body: PRIVACY},
  {handle: 'terms',     title: 'Terms of Service',            body: TERMS},
];

// ---- Shopify GraphQL ----
async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

async function findOrCreatePage(handle, title, body) {
  const found = (
    await gql(`query($q:String!){pages(first:1,query:$q){nodes{id handle title body}}}`, {
      q: `handle:${handle}`,
    })
  ).pages.nodes[0];
  if (found) return {existing: true, page: found};
  if (!APPLY) return {existing: false, page: null};
  const r = await gql(
    `mutation($page:PageCreateInput!){pageCreate(page:$page){page{id handle title} userErrors{field message}}}`,
    {page: {handle, title, body}},
  );
  if (r.pageCreate.userErrors.length) throw new Error(JSON.stringify(r.pageCreate.userErrors));
  return {existing: false, page: r.pageCreate.page};
}

async function updatePage(id, body, title) {
  const r = await gql(
    `mutation($id:ID!,$page:PageUpdateInput!){pageUpdate(id:$id,page:$page){page{id} userErrors{field message}}}`,
    {id, page: {body, title}},
  );
  if (r.pageUpdate.userErrors.length) throw new Error(JSON.stringify(r.pageUpdate.userErrors));
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
let updated = 0,
  created = 0,
  unchanged = 0;
for (const p of PAGES) {
  const {existing, page} = await findOrCreatePage(p.handle, p.title, p.body);
  if (!existing) {
    if (APPLY) {
      console.log(`  + ${p.handle}  created  (${p.body.length} chars)`);
      created++;
    } else {
      console.log(`  + ${p.handle}  would create  (${p.body.length} chars)`);
    }
    continue;
  }
  if (page.body === p.body && page.title === p.title) {
    console.log(`  = ${p.handle}  unchanged`);
    unchanged++;
    continue;
  }
  console.log(`  ~ ${p.handle}  ${APPLY ? 'updating' : 'would update'}  (${p.body.length} chars)`);
  if (APPLY) {
    await updatePage(page.id, p.body, p.title);
    updated++;
  }
}
console.log(`\nSummary: ${updated} updated · ${created} created · ${unchanged} unchanged`);
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
