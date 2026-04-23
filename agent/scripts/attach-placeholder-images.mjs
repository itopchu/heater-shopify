#!/usr/bin/env node
/**
 * Attach branded placeholder images to every seeded Havn product.
 *
 * Uses placehold.co (free, no-auth) with the Havn palette so the storefront
 * has visually distinct cards instead of the default Shopify grey icon.
 *
 * Replace with real photography by dropping files into
 * data/images/<handle>/ and running attach-product-images-local.mjs.
 *
 * Idempotent: per product, skips if any media with alt starting with
 * "placeholder:" already exists.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '..', '.env.local');

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

// Brand palette (hex without leading #, placehold.co format)
const PALETTE = {
  cream: 'FAF7F2',
  ink: '14110E',
  orange: 'D94A1F',
  pine: '2D4A3E',
  gold: 'E8A33D',
};

function placeholderUrl({ bg, fg, text }) {
  const enc = encodeURIComponent(text);
  return `https://placehold.co/1200x1200/${bg}/${fg}/jpeg?text=${enc}&font=source-sans-pro`;
}

function shortTitle(fullTitle) {
  // "Havn Fjord — Horizontaler Wohnraumheizkörper" → "Havn Fjord"
  const dash = fullTitle.indexOf('—');
  if (dash !== -1) return fullTitle.slice(0, dash).trim();
  return fullTitle;
}

function longTitleFragment(fullTitle) {
  const dash = fullTitle.indexOf('—');
  if (dash !== -1) return fullTitle.slice(dash + 1).trim();
  return '';
}

function imageSet(handle, title) {
  const short = shortTitle(title);
  const sub = longTitleFragment(title) || 'Design Heater';
  return [
    {
      alt: `placeholder:${handle}:hero`,
      url: placeholderUrl({ bg: PALETTE.cream, fg: PALETTE.ink, text: short }),
    },
    {
      alt: `placeholder:${handle}:detail`,
      url: placeholderUrl({ bg: PALETTE.ink, fg: PALETTE.gold, text: sub }),
    },
    {
      alt: `placeholder:${handle}:lifestyle`,
      url: placeholderUrl({ bg: PALETTE.orange, fg: PALETTE.cream, text: short + ' · Havn' }),
    },
  ];
}

async function fetchProducts() {
  const data = await gql(`{
    products(first: 50) {
      nodes {
        id
        handle
        title
        media(first: 20) {
          edges {
            node {
              ... on MediaImage { id image { altText } }
            }
          }
        }
      }
    }
  }`);
  return data.products.nodes;
}

async function attachMedia(productId, images) {
  const data = await gql(
    `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id image { altText url } } }
        userErrors { field message }
      }
    }`,
    {
      productId,
      media: images.map((img) => ({
        alt: img.alt,
        mediaContentType: 'IMAGE',
        originalSource: img.url,
      })),
    },
  );
  const errs = data.productCreateMedia.userErrors;
  if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
  return data.productCreateMedia.media;
}

async function main() {
  console.log(`→ Attaching placeholder images on ${STORE}\n`);
  const products = await fetchProducts();
  if (products.length === 0) {
    console.warn('No products found. Run seed-products.mjs first.');
    return;
  }

  let added = 0;
  let skipped = 0;
  for (const p of products) {
    const alts = new Set(
      p.media.edges.map((e) => e.node?.image?.altText).filter(Boolean),
    );
    const already = Array.from(alts).some((a) => a.startsWith('placeholder:'));
    if (already) {
      console.log(`  skip  ${p.handle} (has placeholder media)`);
      skipped++;
      continue;
    }
    const set = imageSet(p.handle, p.title);
    await attachMedia(p.id, set);
    console.log(`  ok    ${p.handle} → ${set.length} image(s)`);
    added += set.length;
  }

  console.log(`\nAttached ${added} image(s) across ${products.length - skipped} product(s). Skipped ${skipped}.`);
  console.log('Shopify fetches the placeholder URLs asynchronously; processing can take 30–60s before images render in Admin.');
}

main().catch((err) => { console.error(err); process.exit(1); });
