#!/usr/bin/env node
/**
 * translate-menu-and-collections.mjs
 *
 * Audit + (optionally) translate three resource families that the live
 * Shopify theme + Next.js storefront read directly:
 *
 *   1. Collection titles (and descriptions, where present).
 *   2. Online-store menu items (`main-menu`, `footer`).
 *   3. Product `custom.subtitle` + `custom.short_description` metafields —
 *      these were carried over verbatim from the German source during the
 *      catalog-sync derivation pass and are the dominant DE-leak vector
 *      on /nl/products/*.
 *
 * For each resource, the script:
 *   a. Looks up the source value (the EN primary on this store, or the
 *      raw German text in the case of the metafields where derivation
 *      wasn't translated).
 *   b. If `--rewrite-source` is set AND the detected source language is
 *      not EN, asks Claude to translate to EN and writes the EN value
 *      back via Admin GraphQL (collectionUpdate / metafieldsSet).
 *   c. Registers the original DE value as a DE translation (so /de
 *      users keep seeing the German wording where it's the better fit).
 *   d. Optionally registers an NL translation if `--with-nl` is set
 *      (Phase 2 only; off by default per spec).
 *
 * This script is intentionally cautious — no `--no-dry-run` means dry run.
 *
 * Usage:
 *   node agent/scripts/translate-menu-and-collections.mjs --store dev --dry-run
 *   node agent/scripts/translate-menu-and-collections.mjs --store dev --rewrite-source
 *   node agent/scripts/translate-menu-and-collections.mjs --store dev --rewrite-source --with-nl
 */

import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '..', '..', '.env.local') });

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const STORE = flag('store', 'dev');
const DRY_RUN = !has('no-dry-run');
const REWRITE_SOURCE = has('rewrite-source');
const WITH_NL = has('with-nl');
const ONLY = flag('only', 'all'); // 'collections' | 'menus' | 'metafields' | 'all'

const storeKey = STORE === 'prod' ? 'PROD' : 'DEV';
const adminToken = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
const storeDomain = process.env[`SHOPIFY_${storeKey}_STORE`];
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

if (!adminToken || !storeDomain) {
  console.error(`Missing SHOPIFY_${storeKey}_ADMIN_TOKEN or SHOPIFY_${storeKey}_STORE in env.`);
  process.exit(1);
}

console.log(
  `[i18n-fix] store=${STORE} domain=${storeDomain} dry=${DRY_RUN} rewrite=${REWRITE_SOURCE} withNl=${WITH_NL} scope=${ONLY}`,
);

// ---------------------------------------------------------------------------
// GraphQL helper
// ---------------------------------------------------------------------------

async function gql(q, variables = {}) {
  const res = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
    body: JSON.stringify({ query: q, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// Heuristic language detection — same patterns as the audit script.
// ---------------------------------------------------------------------------

const DE_TOKENS = /\b(Heizk(ö|oe)rper|Wohnraum|Bad|Anschluss|Wattleistung|F(ü|ue)r|der|die|das|und|oder|mit|ohne|zur|Maße|Gr(ö|oe)(ß|ss)e|Anschl(ü|ue)sse|Lieferumfang|Hinweise|Eigenschaften|Heizung|Geh(ä|ae)use|weiß|Weiß|tropffrei|Bademantelhalter|Handtuchhalter|Handtuchhaken|Handtuch|elektrisch|Hänge|Wand|sondern|jedoch|außerdem|nämlich)\b/;
const HAS_DE_DIACRITIC = /[äöüÄÖÜß]/;

function looksLikeGerman(text) {
  if (!text) return false;
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  return DE_TOKENS.test(stripped) || HAS_DE_DIACRITIC.test(stripped);
}

// ---------------------------------------------------------------------------
// Translation cache (keyed by sha256(target_lang + source))
// ---------------------------------------------------------------------------

const CACHE_DIR = resolve(process.cwd(), '.sync-cache', 'i18n-fix');
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}
function cacheKey(target, source) {
  return createHash('sha256').update(`${target}::${source}`).digest('hex').slice(0, 20);
}
function readCache(key) {
  ensureCacheDir();
  const p = resolve(CACHE_DIR, `${key}.txt`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}
function writeCache(key, value) {
  ensureCacheDir();
  writeFileSync(resolve(CACHE_DIR, `${key}.txt`), value);
}

async function translateClaude(source, targetLang, contextLabel) {
  const key = cacheKey(targetLang, source);
  const cached = readCache(key);
  if (cached !== null) return { value: cached, cacheHit: true };

  const langLabel = { en: 'British English', nl: 'Dutch (Nederlands)', de: 'German (Deutsch)' }[targetLang];
  const sysPrompt = `You translate short e-commerce strings (collection titles, menu items, product subtitles) for a heater/radiator retailer.
Translate to idiomatic, concise, customer-facing ${langLabel}. Preserve any HTML tags, units (mm, cm, W, °C), and brand names exactly. Return only the translation, no quotes, no commentary.`;
  const userPrompt = `Context: ${contextLabel}\n\n--- source ---\n${source}`;

  let out = '';
  const stream = query({
    prompt: userPrompt,
    options: {
      systemPrompt: sysPrompt,
      maxTurns: 1,
      permissionMode: 'default',
      allowedTools: [],
    },
  });
  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') out += block.text;
      }
    }
  }
  const value = out.trim();
  writeCache(key, value);
  return { value, cacheHit: false };
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

async function listCollections() {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      `query ($cursor: String) {
        collections(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            handle
            title
            descriptionHtml
            translations(locale: "nl") { key value outdated }
            translatableContent: translations(locale: "de") { key value outdated }
          }
        }
      }`,
      { cursor },
    );
    out.push(...data.collections.nodes);
    cursor = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (cursor);
  return out;
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

async function getTranslations(resourceId, locale) {
  const data = await gql(
    `query ($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $locale) { key value outdated }
      }
    }`,
    { id: resourceId, locale },
  );
  const map = {};
  for (const t of data.translatableResource?.translations ?? []) map[t.key] = t.value;
  return map;
}

async function registerTranslations(resourceId, translations) {
  if (translations.length === 0) return;
  if (DRY_RUN) {
    console.log(`    [dry] would register ${translations.length} translation(s) on ${resourceId}`);
    return;
  }
  const data = await gql(
    `mutation ($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        userErrors { field message }
      }
    }`,
    { resourceId, translations },
  );
  const errs = data.translationsRegister.userErrors;
  if (errs.length) console.warn(`    [warn] register errors:`, JSON.stringify(errs));
}

async function rewriteCollectionTitle(id, newTitle) {
  if (DRY_RUN) {
    console.log(`    [dry] would collectionUpdate(${id}, title="${newTitle}")`);
    return;
  }
  const data = await gql(
    `mutation ($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id title }
        userErrors { field message }
      }
    }`,
    { input: { id, title: newTitle } },
  );
  const errs = data.collectionUpdate.userErrors;
  if (errs.length) console.warn(`    [warn] collectionUpdate errors:`, JSON.stringify(errs));
}

async function processCollections() {
  const cols = await listCollections();
  console.log(`\n=== COLLECTIONS (${cols.length}) ===`);

  let rewrites = 0;
  let dePreserved = 0;
  let nlAdded = 0;

  for (const c of cols) {
    const isDe = looksLikeGerman(c.title);
    const tnt = await getTranslatableContent(c.id);
    const titleEntry = tnt.find((e) => e.key === 'title');
    if (!titleEntry) continue;

    if (isDe && REWRITE_SOURCE) {
      const { value: enTitle } = await translateClaude(c.title, 'en', `Collection title (handle: ${c.handle})`);
      console.log(`  [rewrite] ${c.handle}: "${c.title}" → "${enTitle}"`);
      await rewriteCollectionTitle(c.id, enTitle);
      // Preserve original DE title as a DE translation.
      await registerTranslations(c.id, [
        {
          key: 'title',
          locale: 'de',
          value: c.title,
          translatableContentDigest: titleEntry.digest,
        },
      ]);
      rewrites++;
      dePreserved++;
    } else if (isDe) {
      console.log(`  [keep-de] ${c.handle}: source still DE — pass --rewrite-source to flip`);
    }

    if (WITH_NL) {
      const sourceTitle = isDe ? '(rewritten above)' : c.title;
      const baseForNl = isDe ? null : c.title;
      if (baseForNl) {
        const { value: nlTitle } = await translateClaude(baseForNl, 'nl', `Collection title (handle: ${c.handle})`);
        // Re-fetch latest digest after potential rewrite.
        const fresh = await getTranslatableContent(c.id);
        const fTitle = fresh.find((e) => e.key === 'title');
        if (fTitle) {
          await registerTranslations(c.id, [
            {
              key: 'title',
              locale: 'nl',
              value: nlTitle,
              translatableContentDigest: fTitle.digest,
            },
          ]);
          nlAdded++;
          console.log(`  [+nl] ${c.handle}: "${nlTitle}"`);
        }
      }
    }
  }

  console.log(`[collections] rewritten=${rewrites} dePreserved=${dePreserved} nlAdded=${nlAdded}`);
}

// ---------------------------------------------------------------------------
// Menu items (online-store menus). Items are stored as a translatable
// resource of type ONLINE_STORE_MENU; titles can be registered per locale.
// ---------------------------------------------------------------------------

async function processMenus() {
  const data = await gql(
    `query {
      menus(first: 10) {
        nodes { id handle title items { id title type url resourceId } }
      }
    }`,
  ).catch((err) => {
    console.warn(`  [warn] menus query failed: ${err.message}`);
    return null;
  });
  if (!data) return;
  const menus = data.menus.nodes;
  console.log(`\n=== MENUS (${menus.length}) ===`);

  for (const m of menus) {
    console.log(`\n[${m.handle}] ${m.title}`);
    const tnt = await getTranslatableContent(m.id).catch(() => []);
    if (tnt.length === 0) {
      console.log(`  (no translatable content exposed for this menu — skip)`);
      continue;
    }
    // Register a NL translation for each text item that has an EN-looking source
    // and no NL translation yet.
    if (!WITH_NL) {
      console.log(`  (skip — pass --with-nl to register NL menu translations)`);
      continue;
    }
    const existingNl = await getTranslations(m.id, 'nl');
    const todo = [];
    for (const c of tnt) {
      if (c.type === 'URL') continue;
      if (looksLikeGerman(c.value)) continue; // skip — those need rewrite-source first
      if (existingNl[c.key] && !existingNl[c.key].outdated) continue;
      const { value: nlVal } = await translateClaude(
        c.value,
        'nl',
        `Menu item (${m.handle}): ${c.key}`,
      );
      todo.push({ key: c.key, locale: 'nl', value: nlVal, translatableContentDigest: c.digest });
      console.log(`  [+nl] ${c.key}: "${c.value}" → "${nlVal}"`);
    }
    await registerTranslations(m.id, todo);
  }
}

// ---------------------------------------------------------------------------
// Product metafields (custom.subtitle, custom.short_description).
//
// These are the dominant DE-leak surface on /nl/products/*. They are
// derived strings, not free-form, so we rewrite the source to EN and
// register the original DE as a DE translation.
// ---------------------------------------------------------------------------

async function listProducts() {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      `query ($cursor: String) {
        products(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            handle
            subtitle: metafield(namespace: "custom", key: "subtitle") { id value type }
            shortDescription: metafield(namespace: "custom", key: "short_description") { id value type }
          }
        }
      }`,
      { cursor },
    );
    out.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

async function setProductMetafield(productGid, key, value, type) {
  if (DRY_RUN) {
    console.log(`    [dry] would set custom.${key} on ${productGid}: ${value.slice(0, 60)}…`);
    return;
  }
  const data = await gql(
    `mutation ($input: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $input) {
        userErrors { field message }
      }
    }`,
    {
      input: [{ ownerId: productGid, namespace: 'custom', key, type, value }],
    },
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) console.warn(`    [warn] metafieldsSet errors:`, JSON.stringify(errs));
}

async function processProductMetafields() {
  const products = await listProducts();
  console.log(`\n=== PRODUCT METAFIELDS (${products.length} products) ===`);

  let touched = 0;
  let dePreserved = 0;

  for (const p of products) {
    for (const key of ['subtitle', 'shortDescription']) {
      const mfKey = key === 'shortDescription' ? 'short_description' : 'subtitle';
      const mf = p[key];
      if (!mf || !mf.value || !mf.value.trim()) continue;
      if (!looksLikeGerman(mf.value)) continue;
      if (!REWRITE_SOURCE) {
        if (touched < 5) {
          console.log(
            `  [keep-de] ${p.handle} custom.${mfKey}: source still DE (sample: "${mf.value.slice(0, 60)}…")`,
          );
        }
        touched++;
        continue;
      }
      const { value: enVal } = await translateClaude(
        mf.value,
        'en',
        `Product custom.${mfKey} (handle: ${p.handle})`,
      );
      // Persist DE original as a DE translation BEFORE we overwrite the source.
      const tnt = await getTranslatableContent(p.id).catch(() => []);
      const targetEntry = tnt.find(
        (e) => e.key && e.key.toLowerCase().includes(mfKey),
      );
      if (targetEntry) {
        await registerTranslations(p.id, [
          {
            key: targetEntry.key,
            locale: 'de',
            value: mf.value,
            translatableContentDigest: targetEntry.digest,
          },
        ]);
        dePreserved++;
      }
      // Now rewrite the source.
      await setProductMetafield(p.id, mfKey, enVal, mf.type);
      console.log(`  [rewrite] ${p.handle} custom.${mfKey}: "${mf.value.slice(0, 50)}…" → "${enVal.slice(0, 50)}…"`);
      touched++;
    }
  }
  console.log(`[metafields] DE-leaking touched=${touched} dePreserved=${dePreserved}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (ONLY === 'all' || ONLY === 'collections') await processCollections();
  if (ONLY === 'all' || ONLY === 'menus') await processMenus();
  if (ONLY === 'all' || ONLY === 'metafields') await processProductMetafields();
  console.log(`\n[i18n-fix] done. dry=${DRY_RUN} — pass --no-dry-run to apply.`);
}

main().catch((err) => {
  console.error(`[i18n-fix] FATAL: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
