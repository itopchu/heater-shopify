#!/usr/bin/env node
// One-shot OAuth installer for the gberg-agent custom app.
//
// Spins up an HTTP server on localhost:3456, prints an install URL,
// captures the OAuth callback, exchanges the temporary code for an
// offline Admin API access token, and writes:
//   SHOPIFY_PROD_STORE
//   SHOPIFY_PROD_ADMIN_TOKEN
// into .env.local. Used once per store.

import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const envPath = resolve(repoRoot, '.env.local');
const tomlPath = resolve(repoRoot, 'shopify.app.toml');

const SHOP = process.argv[2] || 'g-berg-gmbh.myshopify.com';
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

// Read client_id + scopes from shopify.app.toml; secret from `shopify app env show` output.
const toml = await readFile(tomlPath, 'utf8');
const CLIENT_ID = toml.match(/client_id\s*=\s*"([^"]+)"/)?.[1];
const SCOPES = toml.match(/scopes\s*=\s*"([^"]+)"/)?.[1];

if (!CLIENT_ID || !SCOPES) {
  console.error('Could not parse client_id or scopes from shopify.app.toml');
  process.exit(1);
}

const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
if (!CLIENT_SECRET) {
  console.error('Set SHOPIFY_CLIENT_SECRET env var (the shpss_... value).');
  console.error('Get it from: shopify app env show');
  process.exit(1);
}

const nonce = crypto.randomBytes(16).toString('hex');
const installUrl =
  `https://${SHOP}/admin/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${nonce}`;

console.log('\n=== Shopify App Install ===');
console.log(`Shop: ${SHOP}`);
console.log(`Open this URL in your browser to install gberg-agent:\n`);
console.log(installUrl);
console.log(`\nWaiting for callback on ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/auth/callback') {
    res.writeHead(404).end('not found');
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const shop = url.searchParams.get('shop');

  if (state !== nonce) {
    res.writeHead(400).end('state mismatch');
    console.error('FAIL: state mismatch');
    process.exit(1);
  }
  if (!code || !shop) {
    res.writeHead(400).end('missing code/shop');
    console.error('FAIL: missing code or shop in callback');
    process.exit(1);
  }

  try {
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });
    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      throw new Error(`token exchange ${tokenResp.status}: ${txt}`);
    }
    const { access_token, scope } = await tokenResp.json();

    const masked = access_token.slice(0, 10) + '…' + access_token.slice(-4);
    console.log(`Access token received: ${masked}`);
    console.log(`Granted scopes: ${scope}\n`);

    let envBody = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
    const upsert = (key, val) => {
      const re = new RegExp(`^${key}=.*$`, 'm');
      if (re.test(envBody)) envBody = envBody.replace(re, `${key}=${val}`);
      else envBody += (envBody.endsWith('\n') ? '' : '\n') + `${key}=${val}\n`;
    };
    upsert('SHOPIFY_PROD_STORE', shop);
    upsert('SHOPIFY_PROD_ADMIN_TOKEN', access_token);
    await writeFile(envPath, envBody);
    console.log(`Wrote SHOPIFY_PROD_STORE + SHOPIFY_PROD_ADMIN_TOKEN to .env.local`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Installed</title>` +
        `<body style="font:14px system-ui;padding:2rem"><h1>✅ gberg-agent installed</h1>` +
        `<p>Token captured and written to .env.local. You can close this tab.</p></body>`
    );
    server.close();
    setTimeout(() => process.exit(0), 100);
  } catch (err) {
    console.error('FAIL:', err.message);
    res.writeHead(500).end('error: ' + err.message);
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1');
