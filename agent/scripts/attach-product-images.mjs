#!/usr/bin/env node
/*
 * attach-product-images.mjs
 *
 * DEV PLACEHOLDER IMAGES. Uses product imagery from xxl-heizung.de as
 * visual placeholders on the password-gated dev store. Must be swapped
 * for Havn-owned / licensed imagery before launch. Do NOT run this
 * against the production store.
 *
 * Idempotent: if a product already has any media attached, this skips it.
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

// Image assignment — matched by product category where possible.
const ASSIGNMENTS = [
  {
    handle: 'havn-nord',
    alt: 'Havn Nord — vertikaler Badheizkörper',
    images: [
      'https://xxl-heizung.de/cdn/shop/files/5_Weiss.jpg?v=1776246007&width=1100',
      'https://xxl-heizung.de/cdn/shop/files/7_Weiss_matt_Struckturiert_e8d4f6e0-24ee-4826-bc5a-09d293d47a83.jpg?v=1776246538&width=1100',
    ],
  },
  {
    handle: 'havn-fjord',
    alt: 'Havn Fjord — horizontaler Wohnraumheizkörper',
    images: [
      'https://xxl-heizung.de/cdn/shop/files/2ECDD658-ED0D-416B-A276-B19032D6B205.jpg?v=1775252187&width=1100',
    ],
  },
  {
    handle: 'havn-skagen',
    alt: 'Havn Skagen — Handtuchwärmer',
    images: [
      'https://xxl-heizung.de/cdn/shop/files/2_Anthrazit.jpg?v=1776246138&width=1100',
      'https://xxl-heizung.de/cdn/shop/files/1_Anthrazit_matt_Struckturiert_3b9072ed-f060-4e4b-b017-f2b8c1667882.jpg?v=1776246680&width=1100',
    ],
  },
  {
    handle: 'havn-bris',
    alt: 'Havn Bris — kompakter Wohnraumheizkörper',
    images: [
      'https://xxl-heizung.de/cdn/shop/files/C2D245CC-1ADD-4183-A536-0CB8B36D0409.jpg?v=1775252473&width=1100',
    ],
  },
  {
    handle: 'havn-storm',
    alt: 'Havn Storm — Großflächen-Heizkörper',
    images: [
      'https://xxl-heizung.de/cdn/shop/files/9827651D-A15C-41B7-8424-4B839970EBDB.jpg?v=1775253465&width=1100',
      'https://xxl-heizung.de/cdn/shop/files/3DB41358-0B9A-4E46-9746-B1562FEB0E55.jpg?v=1775254257&width=1100',
    ],
  },
];

const CREATE_MEDIA = `
  mutation($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { ... on MediaImage { id alt status } }
      mediaUserErrors { field message code }
    }
  }
`;

async function run() {
  console.log(`→ Attaching placeholder images on ${STORE} (Admin API ${API_VERSION})`);
  console.log('  ⚠ These are xxl-heizung.de images used as DEV placeholders only.\n');

  let attached = 0;
  let skipped = 0;

  for (const a of ASSIGNMENTS) {
    const found = await gql(
      `query($h: String!) { productByHandle(handle: $h) { id title media(first: 1) { edges { node { id } } } } }`,
      { h: a.handle }
    );
    const p = found.productByHandle;
    if (!p) { console.warn(`  ✗ product:${a.handle} not found`); continue; }
    if (p.media.edges.length > 0) {
      console.log(`  ⏭ ${a.handle} already has media — skip`);
      skipped += 1;
      continue;
    }

    const media = a.images.map((src) => ({
      originalSource: src,
      alt: a.alt,
      mediaContentType: 'IMAGE',
    }));
    const res = await gql(CREATE_MEDIA, { productId: p.id, media });
    const errs = res.productCreateMedia.mediaUserErrors;
    if (errs.length) {
      console.warn(`  ✗ ${a.handle}: ${JSON.stringify(errs)}`);
      continue;
    }
    attached += 1;
    console.log(`  ✓ ${a.handle}: ${media.length} image(s) queued (Shopify fetches & processes async)`);
  }

  console.log(`\nDone. attached: ${attached}, skipped: ${skipped}.`);
  console.log('Note: Shopify processes external images asynchronously — may take 10-30s to appear on the storefront.');
}

run().catch((err) => { console.error(err); process.exit(1); });
