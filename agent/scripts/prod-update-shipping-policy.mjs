#!/usr/bin/env node
/**
 * Update the prod store's SHIPPING_POLICY (Settings → Policies → Shipping).
 *
 * This is the body Shopify embeds into the checkout footer / "Shipping
 * policy" link on the payment-method step. The current text still
 * advertises the old €20/item · ES/DE/NL policy that was rolled back.
 * Rewrite to match the canonical state: free delivery (included in
 * product price), DE/BE/NL/LU only, VAT rates per country.
 *
 * Run: node agent/scripts/prod-update-shipping-policy.mjs           (dry-run)
 *      node agent/scripts/prod-update-shipping-policy.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

const NEW_BODY = `<h2>Where we ship</h2>
<p>We deliver only to <strong>Germany, Belgium, the Netherlands and Luxembourg</strong>. Addresses in other countries cannot be checked out — we will expand the list as we open additional warehouses.</p>

<h2>Delivery times</h2>
<ul>
  <li><strong>Towel rails &amp; standard panel radiators:</strong> 3 – 7 business days</li>
  <li><strong>Larger / made-to-order configurations:</strong> 10 – 14 business days</li>
  <li><strong>Accessories &amp; small parts:</strong> 2 – 5 business days</li>
</ul>
<p>You'll get a tracking link by email the moment your order leaves our warehouse.</p>

<h2>Delivery cost</h2>
<ul>
  <li><strong>Free for almost the entire catalog</strong> — the delivery cost is already included in the listed price, with no surcharge at checkout and no minimum to clear.</li>
  <li><strong>Aachen Typ 22 and Typ 33 valve radiators</strong> — the only exception. They ship via our specialist heavy carrier at <strong>€100 per order of up to 8 units</strong>, then €200 for 9–16 units, €300 for 17–24, and so on. The exact delivery fee is shown in the cart and at checkout.</li>
  <li>VAT is included in the prices shown — DE 19%, BE 21%, NL 21%, LU 17%.</li>
</ul>

<h2>Receiving your delivery</h2>
<p>Standard parcels are delivered by DPD, GLS or DHL. Larger radiators ship by pallet courier — the carrier will call you to arrange a delivery slot. Please check the box for visible damage before signing for it; if anything looks wrong, refuse the delivery and contact us within 24 hours.</p>

<h2>If something goes wrong</h2>
<p>Anything missing, damaged or delayed? Email <a href="mailto:info@g-berg-gmbh.de">info@g-berg-gmbh.de</a> with your order number and we'll get it sorted.</p>`;

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const policies = (await gql(`{shop{shopPolicies{id type title body}}}`)).shop.shopPolicies;
const sp = policies.find(p => p.type === 'SHIPPING_POLICY');
if (!sp) { console.error('SHIPPING_POLICY not found'); process.exit(1); }

console.log(`Target policy: ${sp.id} (${sp.title})`);
console.log(`Current body length: ${sp.body.length}; new body length: ${NEW_BODY.length}\n`);

// Show a unified diff of the key changed sections
const findFlag = (txt) => /Spain|€20 per item|ES 21%|free-shipping threshold/i.test(txt);
console.log(`Stale phrases in current body: ${findFlag(sp.body) ? 'YES' : 'no'}`);
console.log(`Stale phrases in new body:     ${findFlag(NEW_BODY) ? 'YES (BUG!)' : 'no'}\n`);

if (!APPLY) {
  console.log('--- NEW BODY ---\n');
  console.log(NEW_BODY);
  console.log('\n— DRY RUN. Re-run with --apply to push to Shopify.');
  process.exit(0);
}

const upd = await gql(
  `mutation($p:ShopPolicyInput!){shopPolicyUpdate(shopPolicy:$p){shopPolicy{id type body} userErrors{field message}}}`,
  {p: {type: 'SHIPPING_POLICY', body: NEW_BODY}},
);
if (upd.shopPolicyUpdate.userErrors.length) {
  console.error('userErrors:', JSON.stringify(upd.shopPolicyUpdate.userErrors));
  process.exit(1);
}
console.log(`✓ updated SHIPPING_POLICY (now ${upd.shopPolicyUpdate.shopPolicy.body.length} chars)`);
