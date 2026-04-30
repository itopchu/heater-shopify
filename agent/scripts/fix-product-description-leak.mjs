#!/usr/bin/env node
/**
 * fix-product-description-leak.mjs
 *
 * Targeted fix for products whose live store `descriptionHtml` is still
 * German (or some other non-EN language) because an earlier sync run wrote
 * the German source straight through without populating `bodyHtmlEn`.
 *
 * The translate.ts pipeline caches translations on disk keyed by
 * `body:${sha256(bodyHtmlDe)}`. So even if data/catalog/gberg-catalog.json
 * has empty `bodyHtmlEn` fields, the cache files at
 * `.sync-cache/translations/<key>.txt` already hold translated EN copy
 * for every German source we've seen.
 *
 * This script:
 *   1. Loads the local catalog (data/catalog/gberg-catalog.json).
 *   2. For each product, computes the cache key from `body:${bodyHtmlDe}`
 *      and reads the cached EN body HTML.
 *   3. Fetches the live store product by handle.
 *   4. If the live `descriptionHtml` doesn't match the cached EN HTML, runs
 *      `productUpdate(input: { id, descriptionHtml })` to overwrite.
 *   5. Always (re-)registers the original German HTML as a `de` translation
 *      via `translationsRegister`, so /de users keep their German copy.
 *
 * `--rewrite-source` is required to actually mutate. Default is dry run.
 *
 * Usage:
 *   node agent/scripts/fix-product-description-leak.mjs --store dev
 *   node agent/scripts/fix-product-description-leak.mjs --store dev --rewrite-source --no-dry-run
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
dotenv({ path: resolve(REPO_ROOT, '.env.local') });

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const STORE = flag('store', 'dev');
const DRY_RUN = !has('no-dry-run');
const REWRITE_SOURCE = has('rewrite-source');
const LIMIT = Number(flag('limit', '0')) || null;

const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';
const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

const CATALOG_PATH = resolve(REPO_ROOT, 'data', 'catalog', 'gberg-catalog.json');
const TRANSLATION_CACHE_DIR = resolve(REPO_ROOT, '.sync-cache', 'translations');

function bodyCacheKey(bodyHtmlDe) {
  return createHash('sha256').update(`body:${bodyHtmlDe}`).digest('hex').slice(0, 16);
}
function titleCacheKey(titleDe) {
  return createHash('sha256').update(`title:${titleDe}`).digest('hex').slice(0, 16);
}
function readCache(key) {
  const p = resolve(TRANSLATION_CACHE_DIR, `${key}.txt`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

async function gql(query, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function getProductByHandle(handle) {
  const data = await gql(
    `query ($h: String!) {
      productByHandle(handle: $h) {
        id
        handle
        title
        descriptionHtml
      }
    }`,
    { h: handle },
  );
  return data.productByHandle;
}

async function getTranslatableContent(resourceId) {
  const data = await gql(
    `query ($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest type locale }
      }
    }`,
    { id: resourceId },
  );
  return data.translatableResource?.translatableContent ?? [];
}

async function updateProductDescription(id, descriptionHtml, title) {
  if (DRY_RUN) {
    console.log(`    [dry] would productUpdate(${id}) — title="${title.slice(0, 40)}" descLen=${descriptionHtml.length}`);
    return;
  }
  const input = { id, descriptionHtml };
  if (title) input.title = title;
  const data = await gql(
    `mutation ($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }`,
    { input },
  );
  const errs = data.productUpdate.userErrors;
  if (errs.length) console.warn(`    [warn] productUpdate errors:`, JSON.stringify(errs));
}

async function registerDeOriginal(resourceId, bodyHtmlDe, titleDe) {
  const tnt = await getTranslatableContent(resourceId);
  const titleEntry = tnt.find((e) => e.key === 'title');
  const bodyEntry = tnt.find((e) => e.key === 'body_html' || e.key === 'description_html');
  const todo = [];
  if (titleEntry && titleDe) {
    todo.push({
      key: titleEntry.key,
      locale: 'de',
      value: titleDe,
      translatableContentDigest: titleEntry.digest,
    });
  }
  if (bodyEntry && bodyHtmlDe) {
    todo.push({
      key: bodyEntry.key,
      locale: 'de',
      value: bodyHtmlDe,
      translatableContentDigest: bodyEntry.digest,
    });
  }
  if (todo.length === 0) return;
  if (DRY_RUN) {
    console.log(`    [dry] would register ${todo.length} de translation(s) on ${resourceId}`);
    return;
  }
  const data = await gql(
    `mutation ($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        userErrors { field message }
      }
    }`,
    { resourceId, translations: todo },
  );
  const errs = data.translationsRegister.userErrors;
  if (errs.length) console.warn(`    [warn] translationsRegister errors:`, JSON.stringify(errs));
}

async function main() {
  console.log(
    `[fix-desc] store=${STORE} dry=${DRY_RUN} rewriteSource=${REWRITE_SOURCE} limit=${LIMIT ?? '∞'}`,
  );
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  let products = catalog.products;
  if (LIMIT) products = products.slice(0, LIMIT);
  console.log(`[fix-desc] catalog has ${products.length} product(s) in scope`);

  let cacheHits = 0;
  let cacheMisses = 0;
  let liveLeaks = 0;
  let rewritten = 0;
  let dePreserved = 0;
  let live404 = 0;

  for (const p of products) {
    const handle = p.handle;
    const titleDe = (p.titleDe || '').trim();
    const bodyHtmlDe = (p.bodyHtmlDe || '').trim();
    if (!bodyHtmlDe) continue;

    const titleCached = titleDe ? readCache(titleCacheKey(titleDe)) : '';
    const bodyCached = readCache(bodyCacheKey(bodyHtmlDe));

    if (!bodyCached) {
      cacheMisses++;
      console.log(`  [miss] ${handle}: no cached EN body — translate.ts has not run for this product.`);
      continue;
    }
    cacheHits++;

    const live = await getProductByHandle(handle);
    if (!live) {
      live404++;
      console.log(`  [skip] ${handle}: not in live store`);
      continue;
    }

    // Quick "still German on live" detector — if the live descriptionHtml
    // mentions German tokens, mark as a leak.
    const liveBody = live.descriptionHtml || '';
    const looksDe = /\b(Heizk(ö|oe)rper|Wohnraum|Bademantel|Handtuchhaken|Bademantelhalter|Handtuchhalter|sondern|jedoch|außerdem|nämlich|Wärme|Größe)\b/.test(
      liveBody,
    ) || /[äöüÄÖÜß]/.test(liveBody);
    if (looksDe) {
      liveLeaks++;
      console.log(
        `  [leak] ${handle}: live descriptionHtml looks German (${liveBody.length} chars). cache has EN (${bodyCached.length} chars).`,
      );
      if (REWRITE_SOURCE) {
        await updateProductDescription(live.id, bodyCached, titleCached || live.title);
        await registerDeOriginal(live.id, bodyHtmlDe, titleDe);
        rewritten++;
        dePreserved++;
      }
    } else {
      // Even if live looks EN, still ensure DE original is registered as a
      // de translation so /de keeps the German copy after rewrite-source runs.
      if (REWRITE_SOURCE) {
        await registerDeOriginal(live.id, bodyHtmlDe, titleDe);
        dePreserved++;
      }
    }
  }

  console.log(`\n[fix-desc] summary:`);
  console.log(`  cache hits     = ${cacheHits}`);
  console.log(`  cache misses   = ${cacheMisses}`);
  console.log(`  live 404s      = ${live404}`);
  console.log(`  DE-leaking live= ${liveLeaks}`);
  console.log(`  rewritten      = ${rewritten}`);
  console.log(`  DE preserved   = ${dePreserved}`);
  if (DRY_RUN) console.log(`  (dry run — no writes. Pass --rewrite-source --no-dry-run to apply.)`);
}

main().catch((err) => {
  console.error(`[fix-desc] FATAL: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
