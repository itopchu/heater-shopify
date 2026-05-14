#!/usr/bin/env node
/**
 * install-ga4-web-pixel.mjs
 *
 * Registers (or updates) a GA4 web pixel via the Admin GraphQL
 * `webPixelCreate` / `webPixelUpdate` mutations so analytics is wired
 * without touching theme/storefront code. Web pixels run in Shopify's
 * sandboxed worker and honour the Customer Privacy consent state, so this
 * is the consent-safe path.
 *
 * Requires GA4_MEASUREMENT_ID (G-XXXXXXXXXX) in .env.local or the shell env.
 *
 * Flags:
 *   --store dev|prod   Target store. Default: dev.
 *   --dry-run          Print intended mutation, do nothing.
 *
 * NOTE — limitation: `webPixelCreate` registers an *app-owned* pixel; the
 * pixel's JS sandbox code is part of the app's pixel extension. If the
 * Hydrogen app has no pixel extension, this call fails — in that case the
 * fallback is a Shopify "Custom pixel" (Settings → Customer events → Add
 * custom pixel) using the snippet this script prints with --print-snippet.
 *
 *   node agent/scripts/install-ga4-web-pixel.mjs --store dev --dry-run
 *   node agent/scripts/install-ga4-web-pixel.mjs --store prod
 *   node agent/scripts/install-ga4-web-pixel.mjs --print-snippet
 */
import {
  loadEnvLocal,
  parseArgs,
  resolveShopify,
  makeGqlClient,
} from './seo-shopify-lib.mjs';

const args = parseArgs();
const STORE = args.get('--store', 'dev');
const DRY_RUN = args.has('--dry-run');
const PRINT_SNIPPET = args.has('--print-snippet');

loadEnvLocal();
const GA4_ID = process.env.GA4_MEASUREMENT_ID;

function customPixelSnippet(id) {
  // Paste into Shopify Admin → Settings → Customer events → Add custom pixel.
  // Consent: the Customer Privacy API gates this — it only runs once the
  // visitor has granted analytics consent (Shopify enforces it for custom
  // pixels in regions that require consent).
  return `// GA4 custom pixel — measurement id ${id}
const GA4_ID = ${JSON.stringify(id)};
const s = document.createElement('script');
s.async = true;
s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
document.head.appendChild(s);
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', GA4_ID, { send_page_view: false });

analytics.subscribe('page_viewed', (event) => {
  gtag('event', 'page_view', {
    page_location: event.context.document.location.href,
    page_title: event.context.document.title,
  });
});
analytics.subscribe('product_viewed', (event) => {
  const v = event.data?.productVariant;
  gtag('event', 'view_item', {
    currency: v?.price?.currencyCode,
    value: Number(v?.price?.amount) || undefined,
    items: v ? [{ item_id: v.sku || v.id, item_name: v.product?.title, price: Number(v.price?.amount) || undefined }] : [],
  });
});
analytics.subscribe('checkout_completed', (event) => {
  const c = event.data?.checkout;
  gtag('event', 'purchase', {
    transaction_id: c?.order?.id || c?.token,
    currency: c?.totalPrice?.currencyCode,
    value: Number(c?.totalPrice?.amount) || undefined,
  });
});`;
}

if (PRINT_SNIPPET) {
  if (!GA4_ID) {
    console.error('GA4_MEASUREMENT_ID not set — pass it in .env.local first.');
    process.exit(1);
  }
  console.log(customPixelSnippet(GA4_ID));
  process.exit(0);
}

if (!GA4_ID) {
  console.error(
    'FATAL: GA4_MEASUREMENT_ID (G-XXXXXXXXXX) must be set in .env.local or the shell env.\n' +
      'Create a GA4 property at https://analytics.google.com → Admin → Data Streams → Web,\n' +
      'copy the Measurement ID, then re-run. Or run with --print-snippet to get the\n' +
      'custom-pixel code to paste into Admin → Settings → Customer events.',
  );
  process.exit(1);
}

const M_LIST = /* GraphQL */ `
  query { webPixels(first: 10) { edges { node { id settings } } } }
`;
const M_CREATE = /* GraphQL */ `
  mutation ($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel { id settings }
      userErrors { field message }
    }
  }
`;
const M_UPDATE = /* GraphQL */ `
  mutation ($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      webPixel { id settings }
      userErrors { field message }
    }
  }
`;

const settings = JSON.stringify({ga4MeasurementId: GA4_ID});

async function main() {
  const {url, token, shop} = resolveShopify(STORE);
  const gql = makeGqlClient({url, token});
  console.log(`[ga4] store=${shop} measurementId=${GA4_ID}${DRY_RUN ? ' (dry-run)' : ''}`);

  if (DRY_RUN) {
    console.log('[ga4] would call webPixelCreate/webPixelUpdate with settings:', settings);
    console.log('[ga4] custom-pixel fallback snippet:\n' + customPixelSnippet(GA4_ID));
    return;
  }

  let existing;
  try {
    const data = await gql(M_LIST);
    existing = data?.webPixels?.edges?.[0]?.node;
  } catch (err) {
    console.warn('[ga4] webPixels query failed (app may lack a pixel extension):', err.message);
  }

  try {
    if (existing?.id) {
      const data = await gql(M_UPDATE, {id: existing.id, webPixel: {settings}});
      const ue = data?.webPixelUpdate?.userErrors ?? [];
      if (ue.length) throw new Error(JSON.stringify(ue));
      console.log('[ga4] updated web pixel', data?.webPixelUpdate?.webPixel?.id);
    } else {
      const data = await gql(M_CREATE, {webPixel: {settings}});
      const ue = data?.webPixelCreate?.userErrors ?? [];
      if (ue.length) throw new Error(JSON.stringify(ue));
      console.log('[ga4] created web pixel', data?.webPixelCreate?.webPixel?.id);
    }
  } catch (err) {
    console.error('[ga4] webPixelCreate/Update failed:', err.message);
    console.error(
      '[ga4] FALLBACK — the Hydrogen app likely has no pixel extension. Paste this\n' +
        '       into Shopify Admin → Settings → Customer events → Add custom pixel:\n',
    );
    console.error(customPixelSnippet(GA4_ID));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
