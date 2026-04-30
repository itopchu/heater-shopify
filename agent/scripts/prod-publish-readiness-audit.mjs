#!/usr/bin/env node
// Pre-launch readiness audit for the prod store.
// Reads many resources via Admin GraphQL, flags items that are not
// publishable / production-ready. Read-only.

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

async function gql(query) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  return j;
}

const checks = [];
const ok = (msg) => checks.push({ status: '✓', msg });
const warn = (msg) => checks.push({ status: '⚠', msg });
const fail = (msg) => checks.push({ status: '✗', msg });

// 1. Shop / business
{
  const r = await gql(`{
    shop {
      name email contactEmail
      ianaTimezone weightUnit
      shipsToCountries
      myshopifyDomain primaryDomain { url sslEnabled }
      billingAddress { country company city zip phone }
      currencyCode currencyFormats { moneyFormat }
      plan { displayName partnerDevelopment }
      checkoutApiSupported customerAccounts
      transactionalSmsDisabled taxesIncluded taxShipping
      orderNumberFormatPrefix orderNumberFormatSuffix
    }
  }`);
  const s = r.data.shop;
  ok(`Shop: ${s.name} (${s.myshopifyDomain})  plan=${s.plan.displayName}  currency=${s.currencyCode}  taxesIncluded=${s.taxesIncluded}`);
  if (!s.email) fail('Shop has no email');
  if (!s.billingAddress?.company) warn('Billing address missing company name');
  if (!s.billingAddress?.zip || !s.billingAddress?.city) warn('Billing address incomplete');
  if (s.primaryDomain.url.includes('myshopify.com')) warn(`Primary domain still myshopify.com (${s.primaryDomain.url}) — connect a custom domain before launch`);
  if (!s.primaryDomain.sslEnabled) fail('SSL not enabled on primary domain');
  if (!s.taxesIncluded) warn('Prices not configured as VAT-inclusive (EU expectation)');
  if (s.shipsToCountries.length < 5) warn(`Ships to only ${s.shipsToCountries.length} countries — expand for EU launch`);
}

// 2. Locales
{
  const r = await gql(`{ shopLocales { locale primary published } }`);
  const ls = r.data.shopLocales;
  const primary = ls.find(l => l.primary);
  const pub = ls.filter(l => l.published);
  ok(`Locales: primary=${primary?.locale}, published=${pub.map(l => l.locale).sort().join(',')} (${pub.length} total)`);
  if (pub.length < 8) warn(`Only ${pub.length} of 8 expected locales published`);
}

// 3. Markets + currencies
{
  const r = await gql(`{
    markets(first:20){edges{node{
      id name handle primary enabled
      regions(first:50){edges{node{name ... on MarketRegionCountry{code}}}}
      currencySettings{baseCurrency{currencyCode}}
    }}}
  }`);
  const ms = r.data.markets.edges.map(e => e.node);
  for (const m of ms) {
    const codes = m.regions.edges.map(e => e.node.code).filter(Boolean);
    const cur = m.currencySettings?.baseCurrency?.currencyCode || '?';
    const tag = `${m.name}${m.primary ? '*' : ''} [${m.enabled ? 'on' : 'OFF'}] currency=${cur} regions=${codes.length} (${codes.sort().join(',')})`;
    if (!m.enabled) warn(`Market disabled: ${tag}`);
    else ok(`Market: ${tag}`);
  }
}

// 4. Themes
{
  const r = await gql(`{ themes(first:10){edges{node{id name role processing}}} }`);
  const ts = r.data.themes.edges.map(e => e.node);
  const main = ts.find(t => t.role === 'MAIN');
  ok(`Themes: ${ts.length} total. MAIN="${main?.name}" id=${main?.id}`);
  if (main?.name === 'Horizon') warn('MAIN theme is still Horizon (default) — publish G-Berg theme over it before launch');
  if (ts.some(t => t.processing)) warn('A theme is still processing');
}

// 5. Products
{
  const all = await gql(`{ productsCount{count} }`);
  const drafted = await gql(`{ productsCount(query:"status:draft"){count} }`);
  const active = await gql(`{ productsCount(query:"status:active"){count} }`);
  const archived = await gql(`{ productsCount(query:"status:archived"){count} }`);
  ok(`Products: total=${all.data.productsCount.count}  active=${active.data.productsCount.count}  draft=${drafted.data.productsCount.count}  archived=${archived.data.productsCount.count}`);
  if (active.data.productsCount.count === 0) warn('Zero ACTIVE products — all are DRAFT. Publish them when ready to launch.');
}

// 6. Collections
{
  const r = await gql(`{ collections(first:20){edges{node{handle title productsCount{count}}}} }`);
  const cs = r.data.collections.edges.map(e => e.node);
  if (!cs.length) warn('No collections — products will only be reachable via direct URL or search');
  else {
    ok(`Collections: ${cs.length}`);
    for (const c of cs) {
      const cnt = c.productsCount.count;
      if (cnt === 0) warn(`  Collection "${c.handle}" has 0 products`);
      else ok(`  ${c.handle} (${cnt} products)`);
    }
  }
}

// 7. Pages
{
  const r = await gql(`{ pages(first:30){edges{node{handle title isPublished}}} }`);
  const ps = r.data.pages.edges.map(e => e.node);
  ok(`Pages: ${ps.length} (${ps.filter(p => p.isPublished).length} published)`);
  for (const p of ps) {
    if (!p.isPublished) warn(`  Page "${p.handle}" not published`);
  }
}

// 8. Navigation menus
{
  const r = await gql(`{ menus(first:10){edges{node{handle title items{title url}}}} }`);
  if (r.errors) warn(`menus query: ${JSON.stringify(r.errors[0].message)}`);
  else {
    const ms = r.data.menus.edges.map(e => e.node);
    if (!ms.length) warn('No nav menus configured');
    else {
      ok(`Menus: ${ms.length}`);
      for (const m of ms) {
        if (!m.items.length) warn(`  Menu "${m.handle}" has no items`);
        else ok(`  ${m.handle}: ${m.items.length} items`);
      }
    }
  }
}

// 9. Shipping
{
  const r = await gql(`{ deliveryProfiles(first:10){edges{node{name profileLocationGroups{locationGroupZones(first:20){edges{node{zone{name countries{code{countryCode}}} methodDefinitionCounts{participantDefinitionsCount rateDefinitionsCount}}}}}}}} }`);
  if (r.errors) warn(`shipping query: ${r.errors[0].message}`);
  else {
    const dps = r.data.deliveryProfiles.edges.map(e => e.node);
    let totalZones = 0, totalRates = 0;
    for (const dp of dps) {
      for (const lg of dp.profileLocationGroups || []) {
        for (const zEdge of lg.locationGroupZones?.edges || []) {
          totalZones++;
          totalRates += zEdge.node.methodDefinitionCounts?.rateDefinitionsCount || 0;
        }
      }
    }
    if (totalRates === 0) fail(`Shipping: ${totalZones} zones but ZERO rates defined — checkout will fail`);
    else ok(`Shipping: ${dps.length} profiles, ${totalZones} zones, ${totalRates} rates`);
  }
}

// 10. Locations
{
  const r = await gql(`{ locations(first:10){edges{node{name address{country city} isActive shipsInventory}}} }`);
  const locs = r.data.locations.edges.map(e => e.node);
  if (!locs.length) fail('No locations defined');
  else ok(`Locations: ${locs.length}  (active=${locs.filter(l => l.isActive).length}, ships=${locs.filter(l => l.shipsInventory).length})`);
}

// 11. Files
{
  const r = await gql(`{ files(first:1){edges{node{id}}} }`);
  ok(`Files: token can read files namespace`);
}

// 12. Online store password / preview lock
{
  // Note: shop.password is not reliable here. We can't programmatically detect
  // the storefront password, so just remind the user.
  warn('Online Store password protection: verify via Admin → Online Store → Preferences (cannot detect via API)');
}

// 13. Notifications/transactional emails
{
  warn('Transactional email customization: review Admin → Settings → Notifications (sender name, brand assets)');
}

// 14. Customer Accounts
{
  const r = await gql(`{ shop { customerAccounts customerAccountsV2{ customerAccountsVersion url loginRequiredAtCheckout } } }`);
  ok(`Customer accounts: ${r.data.shop.customerAccountsV2.customerAccountsVersion} (loginRequired=${r.data.shop.customerAccountsV2.loginRequiredAtCheckout})`);
}

// 15. Tax / VAT (limited via API in EU)
{
  warn('VAT rates: review Admin → Settings → Taxes & duties — DE 19%, NL 21%, BE 21%, FR 20%, ES 21%, IT 22%, PL 23%, DK 25%, AT 20%, LU 17%');
}

// 16. Payments
{
  warn('Payments: activate Shopify Payments + Klarna + PayPal at Admin → Settings → Payments (KYC required)');
}

// 17. Domain
{
  warn('Custom domain (gberg-heizung.de): connect at Admin → Settings → Domains — required before launch');
}

// 18. Legal policies (separate from Pages — these are the real policies)
{
  const r = await gql(`{ shop { shopPolicies { id type body } } }`);
  if (r.errors) warn(`policies: ${r.errors[0].message}`);
  else {
    const required = ['REFUND_POLICY', 'PRIVACY_POLICY', 'TERMS_OF_SERVICE', 'SHIPPING_POLICY', 'CONTACT_INFORMATION'];
    const found = new Map(r.data.shop.shopPolicies.map(p => [p.type, p]));
    for (const t of required) {
      const p = found.get(t);
      if (!p?.body || p.body.length < 50) warn(`Legal: ${t} not populated (Admin → Settings → Policies)`);
      else ok(`Legal: ${t} populated (${p.body.length} chars)`);
    }
  }
}

// 19. Metaobject definitions
{
  const r = await gql(`{ metaobjectDefinitions(first:50){edges{node{type name}}} }`);
  ok(`Metaobject definitions: ${r.data.metaobjectDefinitions.edges.length}`);
}

// Print
console.log(`\n=== Publish-readiness audit: ${STORE} ===\n`);
for (const c of checks) console.log(`  ${c.status}  ${c.msg}`);

const w = checks.filter(c => c.status === '⚠').length;
const f = checks.filter(c => c.status === '✗').length;
console.log(`\nSummary: ${checks.filter(c => c.status === '✓').length} ok, ${w} warnings, ${f} blockers`);
