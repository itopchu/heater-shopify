#!/usr/bin/env node
/**
 * Seeds the two legal pages that configure-phase-6.mjs missed:
 *   - /pages/shipping-delivery  (Versand & Lieferung)
 *   - /pages/payment-methods    (Zahlungsarten)
 *
 * Both pages are required by docs/legal-checklist.md and by German distance-
 * selling rules when the shop targets DE consumers. Text is English-primary
 * (matches our EN-default charter); Translate & Adapt owns DE overrides.
 *
 * Each page ships with a placeholder-warning banner so the merchant cannot
 * accidentally launch with auto-generated legal text.
 *
 * Idempotent: upserts by handle.
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

const PLACEHOLDER_WARNING = `
<div style="padding:1rem;margin:0 0 1.5rem;border:2px dashed #B8621B;background:#FFF5EC;border-radius:8px;">
  <strong>⚠ Placeholder text</strong> — replace via eRecht24 / IT-Recht Kanzlei (DE) and a lawyer-approved
  English version before launch. Merchant edits the final copy at
  <em>Shopify Admin → Online Store → Pages</em>.
</div>
`.trim();

const PAGES = [
  {
    handle: 'shipping-delivery',
    title: 'Shipping & Delivery',
    body: `
${PLACEHOLDER_WARNING}

<h2>Where we deliver</h2>
<p>We ship to Germany, Belgium, Spain, Austria, and the Netherlands. Delivery to other EU countries can be arranged on request — contact us via WhatsApp or email.</p>

<h2>Delivery time</h2>
<ul>
  <li><strong>Germany:</strong> 2–4 working days via DHL.</li>
  <li><strong>Belgium / Netherlands:</strong> 3–5 working days.</li>
  <li><strong>Spain / Austria:</strong> 4–7 working days.</li>
</ul>
<p>Large-format radiators may ship on a freight pallet and add 1–2 days.</p>

<h2>Shipping costs</h2>
<p>Free standard delivery to all destinations for orders above €300. Below that, shipping is calculated at checkout based on weight and destination.</p>

<h2>Tracking</h2>
<p>You'll receive a tracking link by email as soon as the carrier scans your parcel.</p>

<h2>Damaged on arrival</h2>
<p>If your radiator arrives damaged, refuse the delivery or photograph the damage within 24 hours and reply to your order confirmation email. We replace or refund — no argument, no freight cost to you.</p>
`.trim(),
  },
  {
    handle: 'payment-methods',
    title: 'Payment Methods',
    body: `
${PLACEHOLDER_WARNING}

<h2>Accepted payment methods</h2>
<p>Checkout is handled by Shopify Payments. Available methods vary by country and are shown at checkout based on your shipping address.</p>

<ul>
  <li><strong>Klarna</strong> — "Pay later" (invoice) and "Pay in instalments" in DE, AT, NL, BE. Availability in ES is limited; Klarna shows the options that apply at checkout.</li>
  <li><strong>PayPal</strong> — Buyer protection, works for all countries we ship to.</li>
  <li><strong>Credit / Debit card</strong> — Visa, Mastercard, Amex.</li>
  <li><strong>Apple Pay / Google Pay</strong> — 1-click checkout on supported devices.</li>
  <li><strong>SEPA bank transfer</strong> — available in DE, AT, NL, BE, ES via Shopify Payments.</li>
</ul>

<h2>Tax</h2>
<p>All prices include local VAT: 19 % in Germany, 21 % in Belgium and the Netherlands and Spain, 20 % in Austria. Your applicable VAT is shown on the order confirmation and invoice.</p>

<h2>Security</h2>
<p>Shopify Payments is PCI-DSS Level 1 compliant. We never see or store your card details.</p>

<h2>Questions</h2>
<p>If a payment option you expected is not showing at checkout, reply here or ping us on WhatsApp — we'll sort it.</p>
`.trim(),
  },
];

const PAGE_CREATE = `
  mutation($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;
const PAGE_UPDATE = `
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
    { h: `handle:${handle}` },
  );
  const match = existing.pages.edges.find((e) => e.node.handle === handle);
  if (match) {
    const res = await gql(PAGE_UPDATE, {
      id: match.node.id,
      page: { title, body, isPublished: true },
    });
    const errs = res.pageUpdate.userErrors;
    if (errs.length) throw new Error(`pageUpdate ${handle}: ${JSON.stringify(errs)}`);
    console.log(`  ✓ page updated: ${handle}`);
    return match.node.id;
  }
  const res = await gql(PAGE_CREATE, {
    page: { title, handle, body, isPublished: true },
  });
  const errs = res.pageCreate.userErrors;
  if (errs.length) throw new Error(`pageCreate ${handle}: ${JSON.stringify(errs)}`);
  console.log(`  ✓ page created: ${handle}`);
  return res.pageCreate.page.id;
}

async function main() {
  console.log(`→ Seeding additional legal pages on ${STORE}`);
  for (const p of PAGES) await upsertPage(p);
  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
