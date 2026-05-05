#!/usr/bin/env node
/**
 * Replace the placeholder bodies of /pages/imprint, /pages/privacy and
 * /pages/terms on the prod Shopify store with proper, real-data content.
 *
 * Imprint  — § 5 TMG, with G-Berg GmbH legal data.
 * Privacy  — GDPR Art. 13 minimum (controller, purposes, recipients, rights).
 * Terms    — German AGB-style minimum (seller, withdrawal, warranty, payment).
 *
 * Translations to NL/DE/FR/ES/IT/PL/DA can be registered afterwards via
 * `prod-translate-content.mjs --scope=pages --apply`. This script only
 * updates the EN source body.
 *
 * Usage:
 *   node agent/scripts/prod-fill-legal-pages.mjs            # dry-run
 *   node agent/scripts/prod-fill-legal-pages.mjs --apply
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const APPLY = process.argv.includes('--apply');

const COMPANY = {
  name: 'G-Berg GmbH',
  street: 'Hagenerstrasse 33',
  city: '58642 Iserlohn / Letmathe',
  country: 'Germany',
  managingDirector: 'Gökberk Köylü',
  phone: '+49 172 608 88 48',
  phoneTel: '+491726088848',
  email: 'info@g-berg-gmbh.de',
  vat: 'DE450348934',
  warehouse: 'Seestrasse 2A, 58089 Hagen, Germany',
};

const IMPRINT_HTML = `
<h2>Information per § 5 TMG</h2>
<p>
  <strong>${COMPANY.name}</strong><br>
  ${COMPANY.street}<br>
  ${COMPANY.city}<br>
  ${COMPANY.country}
</p>
<h3>Represented by</h3>
<p>Managing Director: ${COMPANY.managingDirector}</p>
<h3>Contact</h3>
<p>
  Phone: <a href="tel:${COMPANY.phoneTel}">${COMPANY.phone}</a><br>
  Email: <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>
</p>
<h3>VAT Identification Number</h3>
<p>VAT ID per § 27a UStG: <strong>${COMPANY.vat}</strong></p>
<h3>Warehouse / Fulfilment</h3>
<p>${COMPANY.warehouse}</p>
<h3>Online Dispute Resolution</h3>
<p>
  The European Commission provides a platform for online dispute resolution (ODR), available at
  <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener">https://ec.europa.eu/consumers/odr</a>.
  We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration body.
</p>
<h3>Liability for Content</h3>
<p>
  As a service provider we are responsible for our own content on these pages in accordance with § 7 (1) TMG.
  Per §§ 8 to 10 TMG we are not obliged to monitor transmitted or stored third-party information or to investigate
  circumstances pointing to illegal activity. External links were checked at the time of placement; we have no
  influence on the content of linked external sites.
</p>
`.trim();

const PRIVACY_HTML = `
<h2>Privacy Notice</h2>
<p>This notice describes how ${COMPANY.name} processes your personal data, in accordance with the GDPR.</p>
<h3>Controller</h3>
<p>
  ${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}.<br>
  Contact: <a href="mailto:${COMPANY.email}">${COMPANY.email}</a> · <a href="tel:${COMPANY.phoneTel}">${COMPANY.phone}</a>
</p>
<h3>What we process and why</h3>
<ul>
  <li><strong>Order fulfilment</strong> — name, delivery and billing address, email, phone, payment confirmation. Legal basis: Art. 6 (1) (b) GDPR (contract).</li>
  <li><strong>Account &amp; communication</strong> — email and order history when you create an account or write to support. Legal basis: Art. 6 (1) (b) and (f) GDPR.</li>
  <li><strong>Marketing emails</strong> — only with your explicit opt-in. You can withdraw consent at any time. Legal basis: Art. 6 (1) (a) GDPR.</li>
  <li><strong>Anonymous analytics</strong> — page views and aggregate device IDs to keep the storefront fast. Legal basis: Art. 6 (1) (f) GDPR (legitimate interest).</li>
</ul>
<h3>Recipients</h3>
<p>
  We share data only with parties that need it to deliver your order: payment providers (Shopify Payments, Klarna, PayPal),
  shipping carriers, and the German tax authorities. We never sell customer data.
</p>
<h3>Retention</h3>
<p>
  Order data is retained for 10 years per German commercial and tax law (§ 257 HGB, § 147 AO). Marketing-list entries are
  deleted on opt-out. Anonymous analytics events are deleted after 14 months.
</p>
<h3>Your rights</h3>
<p>
  You have the right to access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data
  portability (Art. 20), and to object (Art. 21). To exercise any of these rights, email
  <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>. You also have the right to lodge a complaint with a
  supervisory authority — the competent authority for us is the Landesbeauftragte für Datenschutz NRW.
</p>
<h3>Cookies</h3>
<p>
  We use only the cookies strictly necessary to operate the storefront and the cart. No advertising or tracking cookies
  are set without your explicit consent.
</p>
`.trim();

const TERMS_HTML = `
<h2>Terms &amp; Conditions</h2>
<p>These terms govern orders placed on this storefront.</p>
<h3>Seller</h3>
<p>
  ${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}.<br>
  Email: <a href="mailto:${COMPANY.email}">${COMPANY.email}</a> · Phone: <a href="tel:${COMPANY.phoneTel}">${COMPANY.phone}</a><br>
  Managing Director: ${COMPANY.managingDirector} · VAT ID: ${COMPANY.vat}
</p>
<h3>Prices and currency</h3>
<p>
  All prices are in EUR and include the applicable local VAT, unless stated otherwise. Shipping costs are shown at
  checkout before you confirm the order.
</p>
<h3>Conclusion of contract</h3>
<p>
  Placing an order constitutes a binding offer to purchase. The contract is concluded when we send the order
  confirmation email. We reserve the right to refuse orders for which payment cannot be processed.
</p>
<h3>Payment</h3>
<p>
  We accept Visa, Mastercard, American Express, PayPal, Klarna, Apple Pay, Google Pay, Shop Pay, iDEAL and Wero.
  Payment is processed securely by our payment partners.
</p>
<h3>Right of withdrawal</h3>
<p>
  You have the right to withdraw from this contract within 30 days without giving any reason, starting from the day on
  which you (or a third party other than the carrier indicated by you) take physical possession of the goods. To
  exercise the right, send an unambiguous statement (e.g. an email to <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>)
  before the period expires.
</p>
<p>
  Excluded from withdrawal: bespoke or cut-to-length items, hygiene goods (toilets) once unsealed, and goods that have
  been installed.
</p>
<h3>Warranty</h3>
<p>
  10 years on the radiator body, 2 years on electronic components, per the manufacturer's terms. Statutory consumer
  warranty rights remain unaffected.
</p>
<h3>Liability</h3>
<p>
  We are liable without limitation for damages caused intentionally or by gross negligence, for personal injury, and
  under the German Product Liability Act. For ordinary negligence we are liable only for breach of essential
  contractual duties and only up to the foreseeable, contract-typical damage.
</p>
<h3>Applicable law</h3>
<p>
  These terms are governed by the laws of the Federal Republic of Germany, excluding the UN Convention on Contracts
  for the International Sale of Goods. Mandatory consumer-protection provisions of the country in which you reside
  remain unaffected.
</p>
`.trim();

async function gql(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function findPageByHandle(handle) {
  const d = await gql(`query($q:String!){
    pages(first:1, query:$q){ nodes{ id handle title } }
  }`, { q: `handle:${handle}` });
  return d.pages.nodes[0] ?? null;
}

async function updatePage(id, body, title) {
  const d = await gql(`mutation($id:ID!, $page:PageUpdateInput!){
    pageUpdate(id:$id, page:$page){
      page{ id handle title }
      userErrors{ field message }
    }
  }`, { id, page: { body, title } });
  const errs = d.pageUpdate.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
  return d.pageUpdate.page;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

const updates = [
  { handle: 'imprint', title: 'Imprint', body: IMPRINT_HTML },
  { handle: 'privacy', title: 'Privacy Policy', body: PRIVACY_HTML },
  { handle: 'terms',   title: 'Terms of Service', body: TERMS_HTML },
];

for (const u of updates) {
  const p = await findPageByHandle(u.handle);
  if (!p) {
    console.log(`  [skip ] ${u.handle} (no page record found)`);
    continue;
  }
  console.log(`  [write] ${u.handle} (id=${p.id.split('/').pop()}) — ${u.body.length} chars`);
  if (APPLY) await updatePage(p.id, u.body, u.title);
}

console.log(APPLY ? '\nDone.' : '\nDry-run only — re-run with --apply.');
