#!/usr/bin/env node
/**
 * Rename the 9 named product series to German cities.
 *
 *   Twister  → Berlin     Pullman  → Dresden   Elanor → Hamburg
 *   Astoria  → Potsdam    Kira     → Mainz     Flora  → Köln
 *   Atlas    → Essen      Konrad   → Aachen    Lavinno → Baden
 *
 * Per product, in this order:
 *   1. Pin the xxl source handle on `sync.xxl_source_handle` to the CURRENT
 *      handle, so price-sync can keep mapping to xxl-heizung.de after the
 *      handle changes.
 *   2. Rewrite the title (replace the leading "Old " word with "New ").
 *   3. Rewrite the handle by swapping the xxl series-code substring(s) — the
 *      rest of the German handle (badheizkorper-…, vertikal-paneelheizkorper-…)
 *      is preserved.
 *   4. Update the `custom.series` metafield to the new name.
 *   5. Swap the lowercased series tag (twister → berlin).
 *   6. Create a 301 redirect from /products/<old> → /products/<new>.
 *   7. Re-register de/nl/fr title translations with the new name (replace
 *      the leading old-series word in each translated title).
 *
 * Idempotent: a product whose `custom.series` already equals the new name is
 * skipped entirely. The redirect step is also idempotent — duplicates throw a
 * userError that we tolerate.
 *
 *   node agent/scripts/prod-rename-series-to-german-cities.mjs            # dry-run
 *   node agent/scripts/prod-rename-series-to-german-cities.mjs --apply
 *   node agent/scripts/prod-rename-series-to-german-cities.mjs --only=Twister,Konrad
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API = '2026-04';

// Display-name mapping. Slug = ASCII-folded lowercase used in handles + tags.
const RENAMES = {
  Twister: {to: 'Berlin',  slug: 'berlin',  xxlCodes: ['mira']},
  Pullman: {to: 'Dresden', slug: 'dresden', xxlCodes: ['platon']},
  Elanor:  {to: 'Hamburg', slug: 'hamburg', xxlCodes: ['elmar', 'elanor']},
  Astoria: {to: 'Potsdam', slug: 'potsdam', xxlCodes: ['alpha']},
  Kira:    {to: 'Mainz',   slug: 'mainz',   xxlCodes: ['kira']},
  Flora:   {to: 'Köln',    slug: 'koeln',   xxlCodes: ['milan', 'kaska', 'flora']},
  Atlas:   {to: 'Essen',   slug: 'essen',   xxlCodes: ['atlas']},
  Konrad:  {to: 'Aachen',  slug: 'aachen',  xxlCodes: ['konrad']},
  Lavinno: {to: 'Baden',   slug: 'baden',   xxlCodes: ['lavinno']},
};

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes('--apply');
const ONLY = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--only'));
  if (i < 0) return null;
  const a = process.argv[i];
  const v = a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
})();
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const EP = `https://${STORE}/admin/api/${API}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(EP, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}${ONLY ? `  only=[${[...ONLY].join(',')}]` : ''}\n`);

// 1. Fetch every product (with everything we need)
const products = [];
{
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($c:String){
        products(first:100,after:$c){
          pageInfo{hasNextPage endCursor}
          nodes{
            id handle title tags
            metafields(first:30){nodes{namespace key value type}}
          }
        }
      }`, {c: cursor});
    products.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
}
console.log(`fetched ${products.length} products\n`);

// Reverse mapping (new display name → original old name) so a re-run can find
// products that were already partially renamed in a prior run and finish their
// translation step.
const REVERSE_BY_NEW = Object.fromEntries(Object.entries(RENAMES).map(([old, cfg]) => [cfg.to, old]));

// 2. Match each product to its old series
function matchOldSeries(p) {
  const seriesMf = p.metafields.nodes.find((m) => m.namespace === 'custom' && m.key === 'series');
  if (seriesMf && RENAMES[seriesMf.value]) return seriesMf.value;
  if (seriesMf && REVERSE_BY_NEW[seriesMf.value]) return REVERSE_BY_NEW[seriesMf.value];
  // Fallback: leading word of the title
  const lead = (p.title || '').split(/\s|—|-/)[0];
  if (lead && RENAMES[lead]) return lead;
  if (lead && REVERSE_BY_NEW[lead]) return REVERSE_BY_NEW[lead];
  return null;
}

// 3. Helpers for handle/tag rewriting
function rewriteHandle(handle, xxlCodes, newSlug) {
  let out = handle;
  for (const code of xxlCodes) {
    // Match `code` as a hyphen-bounded segment: (^|-)code(-|$). Repeat globally.
    const re = new RegExp(`(^|-)${code}(-|$)`, 'g');
    out = out.replace(re, (_, a, b) => `${a}${newSlug}${b}`);
  }
  return out;
}
function rewriteTags(tags, oldSeries, newSlug) {
  const oldLow = oldSeries.toLowerCase();
  const set = new Set(tags.map((t) => (t === oldLow ? newSlug : t)));
  return [...set];
}
function rewriteTitle(title, oldSeries, newDisplay) {
  // Replace ONLY the leading occurrence of the old series word.
  const re = new RegExp(`^${oldSeries}\\b`);
  return title.replace(re, newDisplay);
}
function rewriteTranslatedTitle(value, oldSeries, newDisplay) {
  // Translated titles also lead with the (latin) series word — same regex.
  if (typeof value !== 'string') return value;
  const re = new RegExp(`^${oldSeries}\\b`);
  return value.replace(re, newDisplay);
}

// 4. Plan + apply
let planned = 0, applied = 0, skipped = 0;
const seenNewHandles = new Set();
for (const p of products) {
  const old = matchOldSeries(p);
  if (!old) continue;
  if (ONLY && !ONLY.has(old)) continue;
  const cfg = RENAMES[old];
  const seriesMf = p.metafields.nodes.find((m) => m.namespace === 'custom' && m.key === 'series');
  // alreadyRenamed = the core fields are done from a prior run. We still fall
  // through to the translations step so a re-run can finish a half-done product.
  const alreadyRenamed = seriesMf && seriesMf.value === cfg.to;

  const newTitle = rewriteTitle(p.title, old, cfg.to);
  let newHandle = p.handle;
  let newTags = p.tags;
  const oldHandle = p.handle;
  const xxlSrcMf = p.metafields.nodes.find((m) => m.namespace === 'sync' && m.key === 'xxl_source_handle');
  let needPinXxl = false;

  if (!alreadyRenamed) {
    newHandle = rewriteHandle(p.handle, cfg.xxlCodes, cfg.slug);
    if (newHandle === p.handle) {
      // No xxl-code substring matched. Force the new slug as a prefix.
      newHandle = `${cfg.slug}-${p.handle}`;
    }
    // Defend against same-product collisions (e.g. two Twisters that would both
    // collapse to the same handle once -mira- → -berlin-). Append -2, -3, … only
    // if needed.
    let dedupe = newHandle;
    let i = 2;
    while (seenNewHandles.has(dedupe)) {
      dedupe = `${newHandle}-${i++}`;
    }
    newHandle = dedupe;
    seenNewHandles.add(newHandle);

    newTags = rewriteTags(p.tags, old, cfg.slug);
    needPinXxl = !xxlSrcMf || xxlSrcMf.value !== oldHandle;
  }

  console.log(`~ ${old} → ${cfg.to}${alreadyRenamed ? '  (core already done — translations only)' : ''}`);
  if (!alreadyRenamed) {
    console.log(`    title  : ${p.title}`);
    console.log(`           → ${newTitle}`);
    console.log(`    handle : ${oldHandle}`);
    console.log(`           → ${newHandle}`);
    console.log(`    tags   : ${p.tags.filter((t) => t === old.toLowerCase()).join(',') || '(no series tag)'}  →  +${cfg.slug}`);
    console.log(`    series : ${seriesMf?.value ?? '(unset)'} → ${cfg.to}`);
    if (needPinXxl) console.log(`    pin sync.xxl_source_handle = ${oldHandle}`);
    console.log(`    redirect: /products/${oldHandle}  →  /products/${newHandle}`);
  }
  planned++;

  if (!APPLY) continue;

  if (alreadyRenamed) {
    // Skip core (already done). Fall through to translations step below.
  } else {

  // STEP 1: pin xxl source handle so price-sync survives the rename.
  if (needPinXxl) {
    const r = await gql(
      `mutation($mfs:[MetafieldsSetInput!]!){
        metafieldsSet(metafields:$mfs){
          metafields{ id }
          userErrors{ field message }
        }
      }`,
      {mfs: [{ownerId: p.id, namespace: 'sync', key: 'xxl_source_handle', type: 'single_line_text_field', value: oldHandle}]});
    if (r.metafieldsSet.userErrors.length) throw new Error(`pin xxl_src: ${JSON.stringify(r.metafieldsSet.userErrors)}`);
  }

  // STEP 2: productUpdate — title, handle, tags, custom.series.
  const r2 = await gql(
    `mutation($p:ProductUpdateInput!){
      productUpdate(product:$p){
        product{ id handle title }
        userErrors{ field message }
      }
    }`,
    {
      p: {
        id: p.id,
        title: newTitle,
        handle: newHandle,
        tags: newTags,
        metafields: [{namespace: 'custom', key: 'series', type: 'single_line_text_field', value: cfg.to}],
      },
    },
  );
  if (r2.productUpdate.userErrors.length) throw new Error(`productUpdate ${oldHandle}: ${JSON.stringify(r2.productUpdate.userErrors)}`);
  console.log(`    ✓ product updated`);

  // STEP 3: 301 redirect old → new (idempotent — tolerate duplicate).
  try {
    const rr = await gql(
      `mutation($input:UrlRedirectInput!){
        urlRedirectCreate(urlRedirect:$input){
          urlRedirect{ id }
          userErrors{ field message }
        }
      }`,
      {input: {path: `/products/${oldHandle}`, target: `/products/${newHandle}`}});
    const errs = rr.urlRedirectCreate.userErrors;
    if (errs.length) {
      const dup = errs.some((e) => /taken|already|exist/i.test(e.message));
      if (!dup) console.log(`    ⚠ redirect: ${JSON.stringify(errs)}`);
      else console.log(`    = redirect already exists`);
    } else {
      console.log(`    ✓ redirect created`);
    }
  } catch (e) {
    console.log(`    ⚠ redirect threw: ${e.message}`);
  }

  } // end !alreadyRenamed core block

  // STEP 4: re-register de/nl/fr title translations with new digest.
  const tr = await gql(
    `query($id:ID!){
      translatableResource(resourceId:$id){
        translatableContent{ key value digest locale }
        de:translations(locale:"de"){ key value }
        nl:translations(locale:"nl"){ key value }
        fr:translations(locale:"fr"){ key value }
      }
    }`, {id: p.id});
  const titleContent = tr.translatableResource.translatableContent.find((c) => c.key === 'title');
  if (!titleContent) {
    console.log(`    ⚠ no translatable title content (?) — skipping translations`);
  } else {
    const digest = titleContent.digest;
    const updates = [];
    for (const loc of ['de', 'nl', 'fr']) {
      const existing = tr.translatableResource[loc].find((t) => t.key === 'title');
      if (!existing) continue;
      const newVal = rewriteTranslatedTitle(existing.value, old, cfg.to);
      if (newVal === existing.value) continue;
      updates.push({locale: loc, key: 'title', value: newVal, translatableContentDigest: digest});
    }
    if (updates.length) {
      const tr2 = await gql(
        `mutation($id:ID!, $translations:[TranslationInput!]!){
          translationsRegister(resourceId:$id, translations:$translations){
            userErrors{ field message }
          }
        }`,
        {id: p.id, translations: updates});
      if (tr2.translationsRegister.userErrors.length) throw new Error(`translations: ${JSON.stringify(tr2.translationsRegister.userErrors)}`);
      console.log(`    ✓ translations updated (${updates.map((u) => u.locale).join(',')})`);
    } else {
      console.log(`    = translations unchanged (no de/nl/fr title found, or already starts with new name)`);
    }
  }

  applied++;
}

console.log(`\n${APPLY ? 'Applied' : 'Planned'}: ${applied || planned}  ·  Skipped (already renamed): ${skipped}`);
if (!APPLY) console.log('Re-run with --apply to write.');
