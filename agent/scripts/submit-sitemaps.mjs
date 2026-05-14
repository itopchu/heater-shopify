#!/usr/bin/env node
/**
 * submit-sitemaps.mjs
 *
 * Pings Google Search Console and Bing Webmaster Tools with the
 * storefront's sitemap so newly-published products get crawled fast.
 *
 * Google Search Console API (Search Console API v1, `sitemaps.submit`)
 * needs a Google service account that has been added as an owner of the
 * GSC property; supply its JSON key path via GSC_SERVICE_ACCOUNT_JSON.
 * Bing Webmaster Tools API needs an API key (Webmaster Tools → Settings →
 * API access) via BING_WEBMASTER_API_KEY.
 *
 * If a credential is missing the script prints the manual-submission URL
 * for that engine and moves on (the old unauthenticated /ping endpoints
 * were retired by both Google and Bing, so there's no auth-free fallback).
 *
 * Env (.env.local at repo root, or shell):
 *   SEO_SITE_URL                 default https://www.gberg-heizung.de
 *   GSC_SERVICE_ACCOUNT_JSON     path to a service-account key file (optional)
 *   BING_WEBMASTER_API_KEY       (optional)
 *
 * Run:
 *   node agent/scripts/submit-sitemaps.mjs
 *   node agent/scripts/submit-sitemaps.mjs --site https://staging.example.com --dry-run
 */
import {readFileSync} from 'node:fs';
import {createSign} from 'node:crypto';
import {loadEnvLocal, parseArgs} from './seo-shopify-lib.mjs';

const args = parseArgs();
const DRY_RUN = args.has('--dry-run');
loadEnvLocal();

const SITE = (args.get('--site', process.env.SEO_SITE_URL) || 'https://www.gberg-heizung.de').replace(/\/$/, '');
const SITEMAP_URL = `${SITE}/sitemap.xml`;

async function getGoogleAccessToken(keyPath) {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({alg: 'RS256', typ: 'JWT'})).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(key.private_key).toString('base64url');
  const assertion = `${header}.${claim}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function submitToGoogle() {
  const keyPath = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!keyPath) {
    console.log(
      '[gsc] GSC_SERVICE_ACCOUNT_JSON not set — submit manually once at\n' +
        `       https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(SITE)}\n` +
        '       (add the sitemap path "sitemap.xml"), or configure a service-account key and re-run.',
    );
    return;
  }
  if (DRY_RUN) return console.log(`[gsc] dry-run: would PUT sitemaps/${SITEMAP_URL} for siteUrl=${SITE}`);
  const token = await getGoogleAccessToken(keyPath);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps/${encodeURIComponent(SITEMAP_URL)}`;
  const res = await fetch(endpoint, {method: 'PUT', headers: {Authorization: `Bearer ${token}`}});
  if (!res.ok) throw new Error(`[gsc] submit failed: ${res.status} ${await res.text()}`);
  console.log('[gsc] sitemap submitted via Search Console API.');
}

async function submitToBing() {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    console.log(
      '[bing] BING_WEBMASTER_API_KEY not set — submit manually once at\n' +
        '       https://www.bing.com/webmasters/sitemaps (select the property, add\n' +
        `       ${SITEMAP_URL}), or configure an API key and re-run.`,
    );
    return;
  }
  if (DRY_RUN) return console.log(`[bing] dry-run: would POST SubmitSitemap siteUrl=${SITE} url=${SITEMAP_URL}`);
  const endpoint = `https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap?apikey=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({siteUrl: SITE, url: SITEMAP_URL}),
  });
  if (!res.ok) throw new Error(`[bing] submit failed: ${res.status} ${await res.text()}`);
  console.log('[bing] sitemap submitted via Webmaster API.');
}

console.log(`[seo] sitemap = ${SITEMAP_URL}${DRY_RUN ? ' (dry-run)' : ''}`);
const results = await Promise.allSettled([submitToGoogle(), submitToBing()]);
let failed = false;
for (const r of results) {
  if (r.status === 'rejected') {
    failed = true;
    console.error(r.reason?.message || r.reason);
  }
}
process.exit(failed ? 1 : 0);
