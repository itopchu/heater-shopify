#!/usr/bin/env node
/**
 * Runs Lighthouse against a password-gated Shopify dev storefront.
 *
 * Flow:
 *   1. chrome-launcher spawns a headless Chrome with a debugging port.
 *   2. puppeteer-core connects, fills the storefront password form, waits for redirect.
 *   3. Lighthouse programmatic API runs on the target URL using the same Chrome port.
 *
 * Usage:
 *   node agent/scripts/run-lighthouse.mjs <storefront-url>
 *
 * Env:
 *   SHOPIFY_DEV_STORE              (e.g. heater-dev.myshopify.com)
 *   SHOPIFY_DEV_STORE_PASSWORD     (the storefront password)
 *
 * Output: JSON + HTML reports under ./lighthouse-reports/YYYY-MM-DD-HH-MM-<slug>.{json,html}
 */

import { config as dotenvConfig } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch as launchChrome } from 'chrome-launcher';
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
dotenvConfig({ path: resolve(REPO_ROOT, '.env.local') });

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error('Usage: node agent/scripts/run-lighthouse.mjs <url>');
  process.exit(1);
}
const storeDomain = process.env.SHOPIFY_DEV_STORE;
const storePassword = process.env.SHOPIFY_DEV_STORE_PASSWORD;
if (!storeDomain || !storePassword) {
  console.error('Missing SHOPIFY_DEV_STORE or SHOPIFY_DEV_STORE_PASSWORD in .env.local');
  process.exit(1);
}

function slug(u) {
  return new URL(u).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
}

const reportsDir = resolve(REPO_ROOT, 'lighthouse-reports');
mkdirSync(reportsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const base = resolve(reportsDir, `${stamp}-${slug(targetUrl)}`);

console.log(`[lh] launching headless Chrome`);
const chrome = await launchChrome({
  chromeFlags: ['--headless=new', '--disable-gpu', '--no-sandbox'],
});

try {
  console.log(`[lh] connecting puppeteer on port ${chrome.port}`);
  const browserURL = `http://127.0.0.1:${chrome.port}`;
  const res = await fetch(`${browserURL}/json/version`);
  const wsEndpoint = (await res.json()).webSocketDebuggerUrl;
  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
  const page = (await browser.pages())[0] || (await browser.newPage());

  console.log(`[lh] authenticating against ${storeDomain}`);
  await page.goto(`https://${storeDomain}/password`, { waitUntil: 'networkidle2' });
  await page.type('input[name="password"]', storePassword);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
  console.log(`[lh] post-auth url: ${page.url()}`);
  if (page.url().includes('/password')) {
    throw new Error('Password authentication failed — still on /password after submit.');
  }
  await browser.disconnect();

  console.log(`[lh] running lighthouse on ${targetUrl}`);
  const result = await lighthouse(
    targetUrl,
    {
      port: chrome.port,
      output: ['json', 'html'],
      logLevel: 'info',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625, disabled: false },
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: 4,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
      },
    },
  );

  writeFileSync(`${base}.json`, result.report[0]);
  writeFileSync(`${base}.html`, result.report[1]);
  const cats = result.lhr.categories;
  console.log('\n[lh] results:');
  for (const k of ['performance', 'accessibility', 'best-practices', 'seo']) {
    const score = Math.round((cats[k]?.score ?? 0) * 100);
    console.log(`  ${k.padEnd(15)} ${score}`);
  }
  console.log(`\n[lh] reports: ${base}.{json,html}`);
} finally {
  try {
    await chrome.kill();
  } catch (err) {
    // Windows sometimes holds on to the temp dir for a moment after Chrome exits.
    // The report is already written; this cleanup error is cosmetic.
    if (process.env.DEBUG) console.warn(`[lh] chrome kill warning: ${err && err.message || err}`);
  }
}
