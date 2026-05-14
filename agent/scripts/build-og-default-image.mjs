#!/usr/bin/env node
/**
 * Generate the default Open Graph / Twitter card image for the Hydrogen
 * storefront: apps/store-heating-hydrogen/public/og/default.png (1200×630).
 *
 * This is the fallback unfurl image used on the homepage, pages, and
 * policy pages (PDP/PLP pass their own product image). It's a static
 * brand composition — brand-red field, the G-Berg mark scaled up, the
 * wordmark, and a German one-line descriptor — rasterised from SVG with
 * sharp. Re-run after any brand-mark or colour change.
 *
 *   node agent/scripts/build-og-default-image.mjs
 *
 * Brand red #C8102E, dark red #8A0B1F, near-black #111111 (see
 * packages/theme-tokens/src/heating.css).
 */
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../apps/store-heating-hydrogen/public/og');
const OUT_FILE = resolve(OUT_DIR, 'default.png');

const W = 1200;
const H = 630;

// The G-Berg brand mark (from app/assets/favicon.svg), redrawn at OG scale
// on a white rounded tile so it reads on the red field.
const markSize = 168;
const markX = 110;
const markY = (H - markSize) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C8102E"/>
      <stop offset="1" stop-color="#8A0B1F"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- subtle bottom keyline -->
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="#111111" opacity="0.35"/>

  <!-- brand mark on a white tile -->
  <g transform="translate(${markX}, ${markY})">
    <rect width="${markSize}" height="${markSize}" rx="${markSize * 0.22}" fill="#FFFFFF"/>
    <g transform="translate(${markSize * 0.18}, ${markSize * 0.18}) scale(${(markSize * 0.64) / 32})">
      <path fill="none" stroke="#C8102E" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"
        d="M22.4 11.2 a7.6 7.6 0 1 0 0 9.6 M22.4 16 H16.4"/>
    </g>
  </g>

  <!-- wordmark + descriptor -->
  <text x="${markX + markSize + 64}" y="${H / 2 - 26}" fill="#FFFFFF"
        font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700">G-Berg Heizung</text>
  <text x="${markX + markSize + 66}" y="${H / 2 + 56}" fill="#FFFFFF" opacity="0.92"
        font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="500">Heizkörper, Handtuchwärmer &amp; Heiztechnik</text>
  <text x="${markX + markSize + 66}" y="${H / 2 + 112}" fill="#FFFFFF" opacity="0.72"
        font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="400">Lieferung in DE · BE · NL · LU</text>
</svg>`;

mkdirSync(OUT_DIR, {recursive: true});
await sharp(Buffer.from(svg)).png().toFile(OUT_FILE);
const meta = await sharp(OUT_FILE).metadata();
console.log(`wrote ${OUT_FILE} (${meta.width}×${meta.height}, ${meta.size} bytes)`);
