#!/usr/bin/env node
/**
 * Populate the 8 footer pages on the dev store with usable English content
 * via the pageUpdate mutation. Operational pages (contact/faq/shipping/
 * returns/warranty) get production-ready copy. Legal pages (imprint/privacy/
 * terms) get structurally-correct templates with prominent
 * "REQUIRES LEGAL COUNSEL REVIEW" notes since the DE entity registration
 * is still pending.
 *
 * Usage:
 *   node agent/scripts/fill-footer-pages.mjs            # dry-run
 *   node agent/scripts/fill-footer-pages.mjs --apply
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function loadEnvLocal(p) {
  const raw = readFileSync(p, 'utf8');
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
loadEnvLocal(resolve(REPO_ROOT, '.env.local'));

const APPLY = process.argv.includes('--apply');
const STORE_FLAG = process.argv.includes('--store') ? process.argv[process.argv.indexOf('--store') + 1] : 'dev';
const SUFFIX = STORE_FLAG === 'prod' ? 'PROD' : 'DEV';
const STORE = process.env[`SHOPIFY_${SUFFIX}_STORE`];
const TOKEN = process.env[`SHOPIFY_${SUFFIX}_ADMIN_TOKEN`];
if (!STORE || !TOKEN) { console.error(`Missing SHOPIFY_${SUFFIX}_* env vars`); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (j.errors) throw new Error(`GraphQL: ${JSON.stringify(j.errors)}`);
  return j.data;
}

// ---------------------------------------------------------------------------
// Page content. Each entry: handle → { title, body }.
// HTML uses only h2/h3/p/ul/li/strong/em/a — no inline style/class so it
// inherits the storefront's prose styling.
// ---------------------------------------------------------------------------
const LEGAL_REVIEW_NOTE = `<p><strong>NOTE FOR INTERNAL REVIEW:</strong> This is a structurally-correct template that <em>must be reviewed with legal counsel</em> and updated with the registered company entity, registration numbers, and tax identifiers before the store goes live. The placeholders below in <strong>[brackets]</strong> need to be filled in.</p>`;

const PAGES = {
  contact: {
    title: 'Contact',
    body: `
<h2>Talk to us</h2>
<p>Have a question about a radiator, an installation, or your order? Our team answers most messages within one business day.</p>

<h3>Customer support</h3>
<p>
  Email: <a href="mailto:hello@gberg-heizung.de">hello@gberg-heizung.de</a><br>
  Phone: +49 (0)30 12345678<br>
  Hours: Monday – Friday, 09:00 – 17:00 CET
</p>

<h3>Engineering &amp; sizing help</h3>
<p>If you're choosing between models, comparing connection types, or sizing a radiator to a room, our heating engineers are happy to help. Send a quick message with your room dimensions, current setup (central heating / electric / both), and any photos — we'll come back with a recommendation.</p>

<h3>Press, partnerships and B2B</h3>
<p>For trade pricing, project quotes (10+ units) or partnership inquiries, please email <a href="mailto:partners@gberg-heizung.de">partners@gberg-heizung.de</a>.</p>
`.trim(),
  },

  faq: {
    title: 'Frequently Asked Questions',
    body: `
<h2>Ordering &amp; delivery</h2>

<h3>Where do you ship?</h3>
<p>We ship across the European Union, including Germany, Belgium, the Netherlands, Spain, Austria, France, Italy, Luxembourg, Poland and Denmark. If your country isn't listed at checkout, contact us — we may still be able to arrange delivery.</p>

<h3>How long does delivery take?</h3>
<p>Most orders arrive within <strong>3 – 7 business days</strong>. Larger panel radiators and made-to-order configurations may take 10 – 14 days. You'll receive a tracking link as soon as your order ships.</p>

<h3>Is delivery really free?</h3>
<p>Yes — <strong>free EU delivery on orders over €500</strong>. Below that threshold a flat fee applies, calculated at checkout based on the destination country.</p>

<h2>Payment</h2>

<h3>Which payment methods do you accept?</h3>
<p>Card (Visa / Mastercard / Amex), PayPal, Apple Pay, Google Pay, and Klarna where available. All payments are processed securely by Shopify Payments.</p>

<h3>Is my payment information safe?</h3>
<p>Yes. We never see or store your card details — they go directly to our payment processor over an encrypted connection. The little padlock in your address bar confirms that.</p>

<h2>Products</h2>

<h3>Are the radiators CE-certified?</h3>
<p>Every radiator we sell carries the CE mark and meets EU directives for electrical safety, pressure equipment (where applicable), and energy labelling. Test certificates are available on request.</p>

<h3>Will it fit my existing pipework?</h3>
<p>Most of our towel rails and panel radiators come with standard 1/2" BSP connections, the European norm. The "Replacement" collection groups radiators sized to fit the connection centres of common older units. If you're not sure, send us your current pipe centres and we'll match a model.</p>

<h3>Can I install it myself?</h3>
<p>Electric models can usually be wall-mounted by a competent DIYer, but the final electrical connection must be made by a qualified electrician. Hydronic (water-fed) radiators should always be installed by a heating professional to keep your warranty valid.</p>

<h2>After your order</h2>

<h3>How do I return something?</h3>
<p>You have <strong>30 days</strong> from delivery to return any unopened product for a full refund. See our <a href="/pages/returns">Returns</a> page for the process.</p>

<h3>What does the warranty cover?</h3>
<p>All our radiators carry a <strong>10-year manufacturer warranty</strong> against material and manufacturing defects under normal use. See <a href="/pages/warranty">Warranty</a> for the details.</p>
`.trim(),
  },

  shipping: {
    title: 'Shipping &amp; Delivery',
    body: `
<h2>Where we ship</h2>
<p>We deliver across the European Union from our European fulfilment centre. Coverage today: Germany, Belgium, the Netherlands, Spain, Austria, France, Italy, Luxembourg, Poland and Denmark. We add countries as our market presence grows — if you don't see yours at checkout, get in touch.</p>

<h2>Delivery times</h2>
<ul>
  <li><strong>Towel rails &amp; standard panel radiators:</strong> 3 – 7 business days</li>
  <li><strong>Larger / made-to-order configurations:</strong> 10 – 14 business days</li>
  <li><strong>Accessories &amp; small parts:</strong> 2 – 5 business days</li>
</ul>
<p>You'll get a tracking link by email the moment your order leaves our warehouse.</p>

<h2>Delivery cost</h2>
<ul>
  <li><strong>Free</strong> on orders over <strong>€500</strong> within the EU</li>
  <li>Below €500, a flat shipping fee is calculated at checkout based on the destination country and the size of the parcel</li>
  <li>VAT is included in the prices shown — exact rate depends on the delivery country (e.g. DE 19%, BE 21%, ES 21%)</li>
</ul>

<h2>Receiving your delivery</h2>
<p>Standard parcels are delivered by DPD, GLS or DHL. Larger radiators ship by pallet courier — the carrier will call you to arrange a delivery slot. Please check the box for visible damage before signing for it; if anything looks wrong, refuse the delivery and contact us within 24 hours.</p>

<h2>If something goes wrong</h2>
<p>Anything missing, damaged or delayed? Email <a href="mailto:hello@gberg-heizung.de">hello@gberg-heizung.de</a> with your order number and we'll get it sorted.</p>
`.trim(),
  },

  returns: {
    title: 'Returns',
    body: `
<h2>30-day, no-questions-asked returns</h2>
<p>If a radiator isn't right — wrong size, wrong colour, just changed your mind — you can return it within <strong>30 days of delivery</strong> for a full refund of the product price.</p>

<h2>Conditions</h2>
<ul>
  <li>Item must be unused and in its original packaging</li>
  <li>All accessories, fixings and documentation included with the product</li>
  <li>No installation marks, paint scuffs, or evidence of mounting</li>
  <li>Custom-made or built-to-order configurations are non-returnable (these are clearly flagged on the product page)</li>
</ul>

<h2>How to return</h2>
<ol>
  <li>Email <a href="mailto:returns@gberg-heizung.de">returns@gberg-heizung.de</a> with your order number and the reason for the return.</li>
  <li>We'll send a return label and instructions within one business day.</li>
  <li>Drop the parcel off at your local courier point or arrange a pickup with the carrier.</li>
  <li>Once we receive and inspect the item, we'll refund the original payment method within 5 – 10 business days.</li>
</ol>

<h2>Faulty or damaged items</h2>
<p>If your radiator arrives damaged or develops a fault within the warranty period, please <em>don't</em> use the standard returns flow — head to <a href="/pages/warranty">Warranty</a> instead. We'll arrange a replacement or repair faster that way.</p>

<h2>Return shipping cost</h2>
<p>For change-of-mind returns, the buyer covers the return shipping. For damaged or faulty items, return shipping is on us.</p>
`.trim(),
  },

  warranty: {
    title: 'Warranty',
    body: `
<h2>10-year manufacturer warranty</h2>
<p>Every radiator we sell is covered by a <strong>10-year warranty</strong> against material and manufacturing defects under normal residential use. Accessories and consumables (valves, lockshields, mounting kits, thermal fluid) are covered for <strong>2 years</strong>.</p>

<h2>What's covered</h2>
<ul>
  <li>Manufacturing defects — leaks at welded joints, paint defects, corrosion under normal use</li>
  <li>Functional failure of integrated heating elements (electric models)</li>
  <li>Failure of mounting hardware supplied with the product</li>
</ul>

<h2>What's not covered</h2>
<ul>
  <li>Damage caused by improper installation, freezing, water with high mineral or chloride content, or use outside the documented operating range</li>
  <li>Cosmetic wear and tear from normal use</li>
  <li>Damage from third-party valves, fluids or system additives</li>
  <li>Hydronic (water-fed) radiators installed by anyone other than a qualified heating professional</li>
</ul>

<h2>How to make a claim</h2>
<ol>
  <li>Email <a href="mailto:warranty@gberg-heizung.de">warranty@gberg-heizung.de</a> with your order number, photos of the issue, and a brief description.</li>
  <li>For installed radiators, please include a photo of the installation showing the connections and mounting.</li>
  <li>We'll respond within 2 business days with next steps — typically a replacement, repair, or refund depending on the issue.</li>
</ol>

<h2>Proof of purchase</h2>
<p>Your order confirmation email is your proof of purchase. We keep a record on our side too, so if you've lost it, we can usually look it up by name and email.</p>
`.trim(),
  },

  imprint: {
    title: 'Imprint',
    body: `
${LEGAL_REVIEW_NOTE}

<h2>Information pursuant to § 5 TMG</h2>

<p>
  <strong>[Company legal name — e.g. G-Berg GmbH]</strong><br>
  [Street address]<br>
  [Postal code, City]<br>
  [Country]
</p>

<h3>Represented by</h3>
<p>[Name(s) of managing director(s)]</p>

<h3>Contact</h3>
<p>
  Phone: +49 (0)30 12345678<br>
  Email: <a href="mailto:hello@gberg-heizung.de">hello@gberg-heizung.de</a>
</p>

<h3>Register entry</h3>
<p>
  Entry in the commercial register.<br>
  Registering court: [e.g. Amtsgericht Berlin-Charlottenburg]<br>
  Registration number: [HRB ...]
</p>

<h3>VAT identification</h3>
<p>
  VAT ID according to § 27 a UStG: <strong>[DE...]</strong>
</p>

<h3>Responsible for content according to § 55 (2) RStV</h3>
<p>
  [Name]<br>
  [Address]
</p>

<h3>EU dispute resolution</h3>
<p>The European Commission provides a platform for online dispute resolution: <a href="https://ec.europa.eu/consumers/odr" rel="noopener" target="_blank">https://ec.europa.eu/consumers/odr</a>. We are not obliged or willing to participate in dispute resolution proceedings before a consumer arbitration board.</p>

<h3>Liability for content</h3>
<p>As a service provider, we are responsible for our own content on these pages in accordance with general laws under § 7 (1) TMG. We are not, however, obligated under §§ 8 to 10 TMG to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.</p>
`.trim(),
  },

  privacy: {
    title: 'Privacy Policy',
    body: `
${LEGAL_REVIEW_NOTE}

<h2>1. Who we are</h2>
<p>This privacy policy explains how <strong>[Company legal name]</strong> ("we", "us", "our") collects, uses and protects personal data when you visit gberg-heizung.de or place an order with us. It is written to comply with the EU General Data Protection Regulation (GDPR) and applicable national law.</p>

<h2>2. What data we collect</h2>
<ul>
  <li><strong>Account &amp; order data:</strong> name, email, billing/shipping address, phone number, order history</li>
  <li><strong>Payment data:</strong> processed entirely by our payment provider (Shopify Payments / Klarna / PayPal). We never see or store your card details.</li>
  <li><strong>Technical data:</strong> IP address, browser type, device type, pages viewed, referring page (collected via cookies and server logs)</li>
  <li><strong>Communications:</strong> any message you send us via email, contact form, or chat</li>
</ul>

<h2>3. Why we collect it (legal basis)</h2>
<ul>
  <li>To fulfil your order — Art. 6(1)(b) GDPR (contract)</li>
  <li>To meet legal obligations (tax, accounting, consumer rights) — Art. 6(1)(c) GDPR</li>
  <li>To run and improve the site — Art. 6(1)(f) GDPR (legitimate interest)</li>
  <li>For marketing only with your explicit consent — Art. 6(1)(a) GDPR</li>
</ul>

<h2>4. Cookies</h2>
<p>We use cookies for essential site functionality (cart, login, language preference) and, with your consent, for analytics and marketing. You can manage your cookie preferences at any time via the cookie banner or your browser settings.</p>

<h2>5. Who we share data with</h2>
<p>We share personal data only with carefully selected service providers who help us run the store:</p>
<ul>
  <li>Shopify Inc. (e-commerce platform &amp; payments)</li>
  <li>Carriers (DPD, GLS, DHL) for delivery</li>
  <li>Email service provider for order confirmations</li>
  <li>Tax authorities and other public bodies where legally required</li>
</ul>

<h2>6. Where data is stored</h2>
<p>Personal data is processed within the European Economic Area where possible. Where transfers outside the EEA are necessary (e.g. to Shopify in Canada / the United States), we rely on the European Commission's adequacy decisions or Standard Contractual Clauses.</p>

<h2>7. How long we keep data</h2>
<p>We keep order data for as long as required by tax and commercial law (typically 10 years). Account data is kept until you delete your account. Marketing consents are kept until you withdraw them.</p>

<h2>8. Your rights</h2>
<p>Under GDPR you have the right to:</p>
<ul>
  <li>Access the data we hold on you (Art. 15)</li>
  <li>Correct inaccurate data (Art. 16)</li>
  <li>Have your data deleted (Art. 17)</li>
  <li>Restrict or object to processing (Art. 18, 21)</li>
  <li>Receive your data in a portable format (Art. 20)</li>
  <li>Lodge a complaint with a supervisory authority</li>
</ul>
<p>To exercise any of these, email <a href="mailto:privacy@gberg-heizung.de">privacy@gberg-heizung.de</a>.</p>

<h2>9. Contact for data protection</h2>
<p>
  [Name of Data Protection Officer or responsible person]<br>
  Email: <a href="mailto:privacy@gberg-heizung.de">privacy@gberg-heizung.de</a><br>
  [Address]
</p>
`.trim(),
  },

  terms: {
    title: 'Terms of Service',
    body: `
${LEGAL_REVIEW_NOTE}

<h2>1. Scope</h2>
<p>These Terms of Service ("Terms") govern all sales between <strong>[Company legal name]</strong> ("we", "us") and the customer ("you") via gberg-heizung.de. By placing an order you accept these Terms.</p>

<h2>2. Contract formation</h2>
<p>The product listings on the site are an invitation to make an offer. Your order is the offer; the contract is formed when we send the order confirmation email. We reserve the right to refuse an order without giving a reason.</p>

<h2>3. Prices</h2>
<p>All prices are in euros (EUR) and include applicable VAT for the delivery country. Delivery costs are shown separately at checkout.</p>

<h2>4. Payment</h2>
<p>We accept the payment methods displayed at checkout. Payment is processed by our payment service provider; we do not see or store your card details.</p>

<h2>5. Delivery</h2>
<p>Delivery times are estimates and not binding unless explicitly agreed in writing. Risk of loss passes to you on handover by the carrier (or to you, if you collect in person). See our <a href="/pages/shipping">Shipping &amp; Delivery</a> page for details.</p>

<h2>6. Right of withdrawal (consumer customers)</h2>
<p>If you are a consumer in the EU, you have the right to withdraw from this contract within 14 days without giving any reason — and we voluntarily extend that period to <strong>30 days</strong>. The withdrawal period begins on the day you (or a third party other than the carrier) take physical possession of the goods. To exercise the right, send us a clear statement of withdrawal by email or post. See our <a href="/pages/returns">Returns</a> page for the process.</p>
<p>Excluded from the right of withdrawal: goods made to your specifications or clearly personalised; goods that are not suitable for return for reasons of health protection or hygiene if unsealed after delivery.</p>

<h2>7. Warranty</h2>
<p>The statutory warranty rights apply. In addition we grant a 10-year manufacturer warranty on radiators (2 years on accessories and consumables) under the conditions set out on our <a href="/pages/warranty">Warranty</a> page.</p>

<h2>8. Liability</h2>
<p>We are liable without limitation for damage caused intentionally or by gross negligence, for damage to life, body or health, and within the scope of any guarantee given. Our liability for damage caused by simple negligence is limited to the foreseeable damage typical of the contract. Any further liability is excluded.</p>

<h2>9. Data protection</h2>
<p>Your personal data is processed in line with our <a href="/pages/privacy">Privacy Policy</a>.</p>

<h2>10. Applicable law &amp; jurisdiction</h2>
<p>These Terms are governed by the law of the Federal Republic of Germany, excluding the UN Convention on Contracts for the International Sale of Goods. The mandatory consumer protection provisions of the country in which you have your habitual residence remain unaffected. The exclusive place of jurisdiction for all disputes with merchants is <strong>[city of registered office]</strong>.</p>

<h2>11. Severability</h2>
<p>If any provision of these Terms is or becomes invalid, the remaining provisions remain in force.</p>
`.trim(),
  },
};

async function main() {
  console.log(`-> Filling 8 footer pages on ${STORE}${APPLY ? '' : ' [DRY RUN]'}`);

  const data = await gql('{pages(first:50){edges{node{id handle title}}}}');
  const byHandle = new Map(data.pages.edges.map((e) => [e.node.handle, e.node]));

  let updated = 0, created = 0;
  for (const [handle, content] of Object.entries(PAGES)) {
    const page = byHandle.get(handle);
    const wordCount = content.body.split(/\s+/).length;
    const verb = page ? 'update' : 'create';
    console.log(`   - ${handle}  →  "${content.title}"  (${wordCount} words, ${verb})`);

    if (!APPLY) { (page ? updated++ : created++); continue; }

    if (page) {
      const r = await gql(
        `mutation($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id handle title }
            userErrors { field message }
          }
        }`,
        { id: page.id, page: { title: content.title, body: content.body, isPublished: true } },
      );
      const errs = r.pageUpdate.userErrors;
      if (errs.length) console.warn(`     ! ${JSON.stringify(errs)}`);
      else { console.log(`     ✓ updated`); updated++; }
    } else {
      const r = await gql(
        `mutation($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page { id handle title }
            userErrors { field message }
          }
        }`,
        { page: { handle, title: content.title, body: content.body, isPublished: true } },
      );
      const errs = r.pageCreate.userErrors;
      if (errs.length) console.warn(`     ! ${JSON.stringify(errs)}`);
      else { console.log(`     ✓ created`); created++; }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Mode:      ${APPLY ? 'LIVE' : 'DRY RUN'}`);
  console.log(`Updated:   ${updated}`);
  console.log(`Created:   ${created}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
