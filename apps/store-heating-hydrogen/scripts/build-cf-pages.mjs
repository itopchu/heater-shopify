#!/usr/bin/env node
// Post-build adapter for Cloudflare Pages.
//
// `shopify hydrogen build` produces:
//   dist/client/   - static assets (the CF Pages "build output directory")
//   dist/server/index.js - the SSR worker bundle
//
// Cloudflare Pages picks up `_worker.js` at the root of the output directory
// as the SSR worker, and `_routes.json` to decide which paths the worker
// handles vs which paths CF serves directly as static. This script copies
// the server bundle into client/ and ensures _routes.json is present.
//
// Run via `pnpm build:cf` — wired into package.json after the regular build.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const serverBundle = resolve(root, 'dist/server/index.js');
const clientDir = resolve(root, 'dist/client');
const workerOut = resolve(clientDir, '_worker.js');
const routesOut = resolve(clientDir, '_routes.json');
const routesSrc = resolve(root, 'public/_routes.json');

if (!existsSync(serverBundle)) {
  console.error(`✗ Missing ${serverBundle}. Run \`pnpm build\` first.`);
  process.exit(1);
}
if (!existsSync(clientDir)) {
  console.error(`✗ Missing ${clientDir}. Run \`pnpm build\` first.`);
  process.exit(1);
}

// 1. Copy the SSR worker bundle into client/_worker.js
copyFileSync(serverBundle, workerOut);
console.log(`✓ Wrote ${workerOut}`);

// 2. Make sure _routes.json is in client/. Vite may already copy it from
// public/, but if not, write it explicitly.
if (!existsSync(routesOut)) {
  if (existsSync(routesSrc)) {
    copyFileSync(routesSrc, routesOut);
  } else {
    writeFileSync(
      routesOut,
      JSON.stringify(
        {
          version: 1,
          include: ['/*'],
          exclude: ['/assets/*', '/build/*', '/favicon.svg', '/favicon.ico', '/robots.txt', '/_routes.json'],
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(`✓ Wrote ${routesOut}`);
} else {
  console.log(`✓ ${routesOut} already present (vite copied it from public/)`);
}

// 3. Sanity check: warn if the bundle is suspiciously small.
const stat = readFileSync(workerOut, 'utf8');
if (stat.length < 50_000) {
  console.warn(`⚠ _worker.js is only ${stat.length} bytes — build may be incomplete`);
}

console.log('\nReady to deploy to Cloudflare Pages.');
console.log('  Build output: dist/client/');
console.log('  CF Pages picks up _worker.js + _routes.json automatically.');
