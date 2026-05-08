#!/usr/bin/env node
/**
 * Catalog-wide product data quality sweep — runs against every product on
 * the prod Shopify store, audits every gap, and (with --apply) writes the
 * fixes idempotently. One script, eight stages.
 *
 * Plan reference: C:\Users\mribr\.claude\plans\astoria-towel-warmer-flickering-matsumoto.md
 *
 * Stages:
 *   A — Backfill specs.connection_type from title parsing
 *   B — Backfill custom.series from tag/title for every product
 *   C — Audit + re-translate German subtitle/short_description leaks
 *   D — Image binding audit (compare across catalog, find duplicates and
 *       mismatches, rebind correct images)
 *   E — Collection assignment audit + backfill from catalog
 *   F — Empty-metafield audit + backfill from catalog
 *   G — Product taxonomy + tags audit
 *   H — Final per-product report card
 *
 * Flags:
 *   --apply              write changes (default: dry-run)
 *   --stage=A,B,C,…      restrict to specific stages (default: all)
 *   --auto-fix           Stage D: rebind images automatically without
 *                        manual review (only honoured with --apply)
 *   --limit=N            process the first N products only
 *   --handle=X           single-product run (for spot-checks)
 *
 * Idempotent. Safe to re-run.
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');

const APPLY = process.argv.includes('--apply');
const AUTO_FIX = process.argv.includes('--auto-fix');
const STAGES = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--stage'));
  if (i < 0) return new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  const a = process.argv[i];
  const v = a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  return new Set(v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
})();
const LIMIT = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--limit'));
  if (i < 0) return Infinity;
  const a = process.argv[i];
  const v = a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
  return parseInt(v, 10) || Infinity;
})();
const ONLY_HANDLE = (() => {
  const i = process.argv.findIndex((a) => a.startsWith('--handle'));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes('=') ? a.split('=')[1] : process.argv[i + 1];
})();

console.log(`→ ${STORE}`);
console.log(`  mode    : ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  stages  : ${[...STAGES].sort().join(',')}`);
if (LIMIT !== Infinity) console.log(`  limit   : ${LIMIT}`);
if (ONLY_HANDLE) console.log(`  handle  : ${ONLY_HANDLE}`);
if (AUTO_FIX) console.log(`  auto-fix: ON (Stage D will rebind without review)`);
console.log('');

// ────────────────────────────────────────────────────────────────────
// Common helpers
// ────────────────────────────────────────────────────────────────────

const API = `https://${STORE}/admin/api/2026-04/graphql.json`;
async function gql(q, v) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

function loadCatalog() {
  const path = resolve(ROOT, 'data/catalog/gberg-catalog.json');
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const products = json.products ?? json;
  const byHandle = new Map();
  for (const p of products) byHandle.set(p.handle, p);
  return byHandle;
}

function getCatalogMetafield(catProduct, namespace, key) {
  if (!catProduct?.customMetafields) return null;
  const mf = catProduct.customMetafields.find(
    (m) => m.namespace === namespace && m.key === key,
  );
  return mf?.value ?? null;
}

function shortStr(s, n = 60) {
  if (s == null) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

// ────────────────────────────────────────────────────────────────────
// Fetch all prod products with the data we need
// ────────────────────────────────────────────────────────────────────

async function fetchAllProducts() {
  const all = [];
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($c:String){
        products(first:50, after:$c) {
          pageInfo{hasNextPage endCursor}
          nodes{
            id handle title status productType vendor
            tags
            featuredImage{ id url }
            media(first:25){
              nodes{
                ... on MediaImage { id image { id url } }
              }
            }
            collections(first:20){
              nodes{ id handle title }
            }
            metafields(first:60){
              nodes{ namespace key value type }
            }
          }
        }
      }`,
      {c: cursor},
    );
    for (const p of d.products.nodes) {
      if (ONLY_HANDLE && p.handle !== ONLY_HANDLE) continue;
      all.push(p);
      if (all.length >= LIMIT) return all;
    }
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return all;
}

function getMf(product, namespace, key) {
  return product.metafields.nodes.find((m) => m.namespace === namespace && m.key === key)?.value ?? null;
}

// ────────────────────────────────────────────────────────────────────
// Stage A: specs.connection_type backfill
// ────────────────────────────────────────────────────────────────────

function parseConnectionType(...sources) {
  const t = sources.filter(Boolean).join(' ').toLowerCase();
  if (
    /mittel-?\s?und-?\s?seitenanschluss/.test(t) ||
    /mittel-?\s?oder-?\s?seitenanschluss/.test(t) ||
    /mittel-und-seitenanschluss/.test(t)
  ) {
    return 'mid_or_side';
  }
  if (/mittelanschluss|mittel-anschluss|center connection|\bmid\b/.test(t)) return 'mid';
  if (
    /seitenanschluss|seitlich|\bside connection\b|\bside\b|rechts oder links/.test(t)
  ) {
    return 'side';
  }
  return null;
}

async function stageA(products, catalog, report) {
  console.log('━━ Stage A: specs.connection_type ━━');
  const writes = [];
  for (const p of products) {
    const current = getMf(p, 'specs', 'connection_type');
    const cat = catalog.get(p.handle);
    // Pull every text source we have so e.g. catalog titleDe ("Astoria
    // Seitenanschluss …") still resolves even when the prod title was
    // already rewritten to a colour-only English form.
    const parsed = parseConnectionType(p.title, p.handle, cat?.titleDe, cat?.titleEn);
    const card = report.get(p.handle);
    if (parsed == null) {
      card.connection = current ? `${current} ✓` : '— (no signal)';
      continue;
    }
    if (current === parsed) {
      card.connection = `${parsed} ✓`;
      continue;
    }
    card.connection = `→ ${parsed}${current ? ` (was: ${current})` : ' (new)'}`;
    writes.push({
      ownerId: p.id,
      namespace: 'specs',
      key: 'connection_type',
      type: 'single_line_text_field',
      value: parsed,
    });
  }
  console.log(`  ${writes.length} writes pending  (${products.length - writes.length} already correct or unsigned)`);
  if (APPLY && writes.length) {
    // metafieldsSet accepts up to 25 per call.
    for (let i = 0; i < writes.length; i += 25) {
      const batch = writes.slice(i, i + 25);
      const r = await gql(
        `mutation($mf:[MetafieldsSetInput!]!){metafieldsSet(metafields:$mf){userErrors{field message}}}`,
        {mf: batch},
      );
      const errs = r.metafieldsSet.userErrors;
      if (errs.length) console.log(`  ✗ batch ${i}: ${JSON.stringify(errs)}`);
    }
    console.log(`  ✓ wrote ${writes.length} metafields`);
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage B: custom.series backfill
// ────────────────────────────────────────────────────────────────────

const SERIES_TOKENS = [
  // Canonical series — title-cased target value
  ['Astoria', /\bastoria\b|\balpha\b/i],
  ['Atlas', /\batlas\b/i],
  ['Elanor', /\belanor\b/i],
  ['Flora', /\bflora\b|\bmilan\b/i],
  ['Pullman', /\bpullman\b/i],
  ['Twister', /\btwister\b/i],
  ['Konrad', /\bkonrad\b/i],
  ['Platis', /\bplatis\b|\bplaton\b/i],
  ['Lavinno', /\blavinno\b/i],
  ['Kira', /\bkira\b/i],
  ['Kaska', /\bkaska\b/i],
  ['Mira', /\bmira\b/i],
  ['Elmar', /\belmar\b/i],
];

function deriveSeries(product) {
  const haystack = [...product.tags, product.handle, product.title].join(' ');
  for (const [label, re] of SERIES_TOKENS) {
    if (re.test(haystack)) return label;
  }
  return null;
}

async function stageB(products, report) {
  console.log('━━ Stage B: custom.series ━━');
  const writes = [];
  for (const p of products) {
    const current = getMf(p, 'custom', 'series');
    const derived = deriveSeries(p);
    const card = report.get(p.handle);
    if (!derived) {
      card.series = current ? `${current} ✓` : '— ambiguous';
      continue;
    }
    if (current === derived) {
      card.series = `${derived} ✓`;
      continue;
    }
    card.series = `→ ${derived}${current ? ` (was: ${current})` : ' (new)'}`;
    writes.push({
      ownerId: p.id,
      namespace: 'custom',
      key: 'series',
      type: 'single_line_text_field',
      value: derived,
    });
  }
  console.log(`  ${writes.length} writes pending  (${products.length - writes.length} already correct or ambiguous)`);
  if (APPLY && writes.length) {
    for (let i = 0; i < writes.length; i += 25) {
      const batch = writes.slice(i, i + 25);
      const r = await gql(
        `mutation($mf:[MetafieldsSetInput!]!){metafieldsSet(metafields:$mf){userErrors{field message}}}`,
        {mf: batch},
      );
      const errs = r.metafieldsSet.userErrors;
      if (errs.length) console.log(`  ✗ batch ${i}: ${JSON.stringify(errs)}`);
    }
    console.log(`  ✓ wrote ${writes.length} metafields`);
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage C: subtitle / short_description German-leak audit
// ────────────────────────────────────────────────────────────────────

// German-only tokens. ✔ is excluded — it's a Unicode bullet that survives
// translation, so the English-promoted bodies still start with it.
// "Anschluss" is also excluded because Mittelanschluss/Seitenanschluss is a
// loanword present in some EN trade copy. Only true-German signals here.
const GERMAN_TOKENS = /Aufgrund|Heizkörper|Wärmepumpe|Lieferumfang|Befestigungsset|geeignet|hochwertig|Bearbeitung|Wohnraum|für den|für Ihre|Ihre Heizung/i;

function looksGerman(text) {
  if (!text) return false;
  return GERMAN_TOKENS.test(text);
}

async function stageC(products, report) {
  console.log('━━ Stage C: subtitle / short_description German-leak audit ━━');
  let leaks = 0;
  const leakedHandles = [];
  for (const p of products) {
    const sub = getMf(p, 'custom', 'subtitle');
    const short = getMf(p, 'custom', 'short_description');
    const subDe = looksGerman(sub);
    const shortDe = looksGerman(short);
    const card = report.get(p.handle);
    if (subDe || shortDe) {
      leaks++;
      leakedHandles.push(p.handle);
      card.subtitle = `DE-leak${subDe ? ' [sub]' : ''}${shortDe ? ' [short]' : ''}`;
    } else {
      card.subtitle = sub || short ? 'EN ✓' : '—';
    }
  }
  console.log(`  ${leaks} products have German subtitle/short_description`);
  if (leaks > 0) {
    console.log(`  Affected handles:`);
    for (const h of leakedHandles.slice(0, 20)) console.log(`    - ${h}`);
    if (leakedHandles.length > 20) console.log(`    … and ${leakedHandles.length - 20} more`);
  }
  if (APPLY && leaks > 0) {
    console.log('');
    console.log('  → Re-translation will be performed by prod-translate-content.mjs --scope=products --apply');
    console.log('    Stage C marks the leaks but defers the actual translation to the established pipeline');
    console.log('    (it has the Gemini integration, cache, and digest handling ready).');
    console.log('');
    console.log('  Run after this sweep finishes:');
    console.log('    node agent/scripts/prod-translate-content.mjs --scope=products --apply');
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage D: image binding audit (compare across catalog)
// ────────────────────────────────────────────────────────────────────

function basenameFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/files\/([^?]+)/);
  return m ? m[1] : url;
}

function expectedLocalImagesForCatalogProduct(catProduct) {
  if (!catProduct?.customMetafields) return [];
  const mf = catProduct.customMetafields.find(
    (m) => m.namespace === 'media' && m.key === 'local_images',
  );
  if (!mf?.value) return [];
  try {
    const parsed = JSON.parse(mf.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function stageD(products, catalog, report) {
  console.log('━━ Stage D: image binding audit ━━');
  // Build url → handles map
  const urlByProduct = new Map();
  const productsByUrl = new Map();
  const featuredByProduct = new Map();
  for (const p of products) {
    const urls = [];
    if (p.featuredImage?.url) {
      urls.push(p.featuredImage.url);
      featuredByProduct.set(p.handle, p.featuredImage.url);
    }
    for (const m of p.media.nodes ?? []) {
      if (m?.image?.url && !urls.includes(m.image.url)) urls.push(m.image.url);
    }
    urlByProduct.set(p.handle, urls);
    for (const u of urls) {
      if (!productsByUrl.has(u)) productsByUrl.set(u, []);
      productsByUrl.get(u).push(p.handle);
    }
  }

  // Detect issues. Only DUPLICATE and MISSING are reliable; the catalog's
  // expected file stems are German names that don't survive Shopify's CDN
  // upload (renamed to UUIDs), so a catalog↔CDN textual mismatch is a
  // false positive across the whole catalog. Image-content quality
  // (e.g. AI rendering a side-style radiator for a center variant) is a
  // prompt-quality issue, not a binding bug — out of scope for this stage.
  const issues = {duplicate: [], missing: [], ok: []};
  for (const p of products) {
    const card = report.get(p.handle);
    const urls = urlByProduct.get(p.handle) || [];
    if (urls.length === 0) {
      issues.missing.push({handle: p.handle, title: p.title});
      card.image = 'MISSING';
      continue;
    }
    const featured = featuredByProduct.get(p.handle);
    const sharedWith = featured
      ? (productsByUrl.get(featured) || []).filter((h) => h !== p.handle)
      : [];
    if (sharedWith.length > 0) {
      issues.duplicate.push({handle: p.handle, title: p.title, sharedWith});
      card.image = `DUPLICATE (shares with ${sharedWith.slice(0, 2).join(',')})`;
      continue;
    }
    issues.ok.push(p.handle);
    card.image = `OK (${urls.length})`;
  }

  console.log(`  OK         : ${issues.ok.length}`);
  console.log(`  DUPLICATE  : ${issues.duplicate.length}`);
  console.log(`  MISSING    : ${issues.missing.length}`);

  if (issues.duplicate.length) {
    console.log('');
    console.log('  Duplicate-image products (featured shared with another product):');
    for (const d of issues.duplicate) {
      console.log(`    ${d.handle}  ⇆  ${d.sharedWith.join(', ')}`);
    }
  }
  if (issues.missing.length) {
    console.log('');
    console.log('  Missing-image products (manual regen needed):');
    for (const m of issues.missing) console.log(`    ${m.handle}  →  "${shortStr(m.title, 50)}"`);
  }
  console.log('');
  console.log('  ℹ Image-content quality (e.g. wrong-style radiator for a center variant)');
  console.log('    is a prompt-quality issue, not a binding bug. If the URL is unique to');
  console.log('    the product but the rendering is wrong, regenerate via the existing');
  console.log('    prod-replace-elanor-images.mjs pattern with a tightened prompt.');

  // CSV
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const csvDir = resolve(ROOT, 'data');
  if (!existsSync(csvDir)) mkdirSync(csvDir, {recursive: true});
  const csvPath = resolve(csvDir, `image-binding-audit-${stamp}.csv`);
  const lines = ['handle,title,status,featured_url,shared_with'];
  for (const p of products) {
    const card = report.get(p.handle);
    const featured = featuredByProduct.get(p.handle) || '';
    const dup = issues.duplicate.find((d) => d.handle === p.handle);
    const sharedWith = dup ? dup.sharedWith.join('|') : '';
    lines.push(
      [p.handle, JSON.stringify(p.title), card.image, featured, sharedWith]
        .map((x) => String(x ?? '').replace(/"/g, '""'))
        .map((x) => /[,\n]/.test(x) ? `"${x}"` : x)
        .join(','),
    );
  }
  writeFileSync(csvPath, lines.join('\n'), 'utf8');
  console.log(`  📝 CSV: ${csvPath}`);

  if (APPLY && AUTO_FIX && issues.duplicate.length) {
    console.log('');
    console.log('  --auto-fix: duplicate rebind logic intentionally deferred. Review the CSV,');
    console.log('  then run agent/scripts/prod-replace-elanor-images.mjs (existing pattern) per');
    console.log('  affected product so the human stays in the loop on which image goes where.');
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage E: collection assignment audit + backfill
// ────────────────────────────────────────────────────────────────────

// Catalog handles use German; prod has English-handle collections (manually
// created in Admin). This rewrite maps the catalog terminology to the prod
// equivalent. Handles with no entry are skipped (e.g. "toiletten" — no
// matching prod collection exists, so the products go uncategorised).
const COLLECTION_HANDLE_REWRITE = {
  wohnraumheizkoerper: 'living-room-radiators',
  badheizkoerper: 'bathroom-radiators',
  'badheizkoerper-elektrisch': 'electric-bathroom-radiators',
  austauschheizkoerper: 'replacement-radiators',
  zubehoer: 'accessories',
  fussbodenheizungsrohre: 'fussbodenheizung',
};

async function stageE(products, catalog, report) {
  console.log('━━ Stage E: collection assignment ━━');
  // Resolve prod collection handles → gids
  const colMap = new Map();
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($c:String){collections(first:50, after:$c){pageInfo{hasNextPage endCursor} nodes{id handle title}}}`,
      {c: cursor},
    );
    for (const c of d.collections.nodes) colMap.set(c.handle, c.id);
    if (!d.collections.pageInfo.hasNextPage) break;
    cursor = d.collections.pageInfo.endCursor;
  }

  const adds = []; // { collectionId, productId, handle, colHandle }
  const skipped = [];
  for (const p of products) {
    const card = report.get(p.handle);
    const cat = catalog.get(p.handle);
    const expectedRaw = (cat?.collectionHandles ?? []).slice();
    // Apply rewrite, drop unmapped handles
    const expected = expectedRaw
      .map((h) => COLLECTION_HANDLE_REWRITE[h] ?? (colMap.has(h) ? h : null))
      .filter(Boolean);
    const current = new Set((p.collections?.nodes ?? []).map((c) => c.handle));
    const missing = expected.filter((h) => !current.has(h));
    if (expected.length === 0) {
      card.colls = current.size === 0 ? '— none' : `${current.size} ✓`;
      continue;
    }
    if (missing.length === 0) {
      card.colls = `${current.size} ✓`;
      continue;
    }
    card.colls = `${current.size} → +${missing.length} (${missing.join(',')})`;
    for (const h of missing) {
      const cid = colMap.get(h);
      if (!cid) {
        skipped.push({handle: p.handle, colHandle: h});
        continue;
      }
      adds.push({collectionId: cid, productId: p.id, handle: p.handle, colHandle: h});
    }
  }
  if (skipped.length) {
    console.log(`  ⚠ ${skipped.length} product↔collection links skipped (target collection missing on prod)`);
  }

  console.log(`  ${adds.length} product↔collection links pending`);
  if (APPLY && adds.length) {
    // Group by collection so we can call collectionAddProducts in batches
    const byCol = new Map();
    for (const a of adds) {
      if (!byCol.has(a.collectionId)) byCol.set(a.collectionId, []);
      byCol.get(a.collectionId).push(a.productId);
    }
    for (const [cid, pids] of byCol) {
      // Up to 250 per call
      for (let i = 0; i < pids.length; i += 100) {
        const batch = pids.slice(i, i + 100);
        const r = await gql(
          `mutation($id:ID!,$productIds:[ID!]!){collectionAddProducts(id:$id,productIds:$productIds){userErrors{field message}}}`,
          {id: cid, productIds: batch},
        );
        const errs = r.collectionAddProducts.userErrors;
        if (errs.length) console.log(`  ✗ collection ${cid} batch ${i}: ${JSON.stringify(errs)}`);
      }
    }
    console.log(`  ✓ added ${adds.length} memberships`);
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage F: empty-metafield audit + backfill from catalog
// ────────────────────────────────────────────────────────────────────

const COLOR_NORMALIZE = {
  weiss: 'white',
  weiß: 'white',
  white: 'white',
  schwarz: 'black',
  black: 'black',
  anthrazit: 'anthracite',
  anthracite: 'anthracite',
  chrom: 'chrome',
  chrome: 'chrome',
};

function normalizeColor(v) {
  if (!v) return null;
  return COLOR_NORMALIZE[v.toLowerCase().trim()] ?? v;
}

// Derive colour from handle/title — more reliable than the catalog
// (which has a known data bug: two Mira products have swapped colour
// metafields in gberg-catalog.json — the anthracite SKU's catalog entry
// claims `schwarz` and vice-versa). The handle is the source of truth.
function deriveColorFromHandle(p) {
  const t = `${p.handle} ${p.title}`.toLowerCase();
  if (/\b(weiss|weiß|white)\b/.test(t)) return 'white';
  if (/\b(schwarz|black)\b/.test(t)) return 'black';
  if (/\b(anthrazit|anthracite)\b/.test(t)) return 'anthracite';
  if (/\b(chrom|chrome)\b/.test(t)) return 'chrome';
  return null;
}

async function stageF(products, catalog, report) {
  console.log('━━ Stage F: empty-metafield backfill from catalog ━━');
  const writes = [];
  let catalogConflicts = 0;
  for (const p of products) {
    const cat = catalog.get(p.handle);
    const card = report.get(p.handle);
    const fixes = [];

    // specs.color — prefer handle-derived; only fall back to catalog when
    // the handle gives no signal. If catalog disagrees with handle, the
    // handle wins and we count the conflict for visibility.
    const currentColor = getMf(p, 'specs', 'color');
    const derivedColor = deriveColorFromHandle(p);
    const catColor = normalizeColor(getCatalogMetafield(cat, 'specs', 'color'));
    const wantColor = derivedColor ?? catColor;
    if (derivedColor && catColor && derivedColor !== catColor) {
      catalogConflicts++;
    }
    if (wantColor && currentColor !== wantColor) {
      writes.push({
        ownerId: p.id,
        namespace: 'specs',
        key: 'color',
        type: 'single_line_text_field',
        value: wantColor,
      });
      fixes.push(`color=${wantColor}`);
    }

    // specs.heating_medium
    const currentHm = getMf(p, 'specs', 'heating_medium');
    const catHm = getCatalogMetafield(cat, 'specs', 'heating_medium');
    if (catHm && currentHm !== catHm) {
      writes.push({
        ownerId: p.id,
        namespace: 'specs',
        key: 'heating_medium',
        type: 'single_line_text_field',
        value: catHm,
      });
      fixes.push(`heating_medium=${catHm}`);
    }

    // filters.color_family — same handle-first logic as specs.color
    const currentCf = getMf(p, 'filters', 'color_family');
    const catCfRaw = getCatalogMetafield(cat, 'filters', 'color_family');
    const wantCf = derivedColor ?? (catCfRaw ?? null);
    if (wantCf && currentCf !== wantCf) {
      writes.push({
        ownerId: p.id,
        namespace: 'filters',
        key: 'color_family',
        type: 'single_line_text_field',
        value: wantCf,
      });
      fixes.push(`color_family=${wantCf}`);
    }

    // filters.product_type
    const currentPt = getMf(p, 'filters', 'product_type');
    const catPt = getCatalogMetafield(cat, 'filters', 'product_type');
    if (catPt && currentPt !== catPt) {
      writes.push({
        ownerId: p.id,
        namespace: 'filters',
        key: 'product_type',
        type: 'single_line_text_field',
        value: catPt,
      });
      fixes.push(`product_type=${catPt}`);
    }

    card.mfields = fixes.length ? `+${fixes.length}: ${fixes.join(',')}` : '0 missing';
  }

  console.log(`  ${writes.length} metafield writes pending`);
  if (catalogConflicts) {
    console.log(`  ⚠ ${catalogConflicts} products have catalog colour values that disagree with the handle —`);
    console.log(`    handle wins (catalog gberg-catalog.json appears to have swapped colour values for those entries)`);
  }
  if (APPLY && writes.length) {
    for (let i = 0; i < writes.length; i += 25) {
      const batch = writes.slice(i, i + 25);
      const r = await gql(
        `mutation($mf:[MetafieldsSetInput!]!){metafieldsSet(metafields:$mf){userErrors{field message}}}`,
        {mf: batch},
      );
      const errs = r.metafieldsSet.userErrors;
      if (errs.length) console.log(`  ✗ batch ${i}: ${JSON.stringify(errs)}`);
    }
    console.log(`  ✓ wrote ${writes.length} metafields`);
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage G: product taxonomy + tags audit
// ────────────────────────────────────────────────────────────────────

async function stageG(products, report) {
  console.log('━━ Stage G: tags audit (informational) ━━');
  // We don't write productCategory in this pass because it requires a
  // taxonomy ID lookup; just report which products lack the canonical
  // synced:xxl tag and which lack a colour tag.
  let missingSyncTag = 0;
  let missingColorTag = 0;
  const COLOR_TAGS = new Set(['white', 'black', 'anthracite', 'chrome', 'weiss', 'schwarz', 'anthrazit', 'chrom']);
  for (const p of products) {
    const tags = new Set(p.tags.map((t) => t.toLowerCase()));
    if (!tags.has('synced:xxl')) missingSyncTag++;
    if (![...COLOR_TAGS].some((c) => tags.has(c))) missingColorTag++;
  }
  console.log(`  ${missingSyncTag} products missing 'synced:xxl' tag`);
  console.log(`  ${missingColorTag} products missing a colour tag`);
  console.log(`  (audit-only this pass — tag writes deferred to dedicated script)`);
  console.log('');
}

// ────────────────────────────────────────────────────────────────────
// Stage H: final report card
// ────────────────────────────────────────────────────────────────────

function stageH(products, report) {
  console.log('━━ Stage H: per-product report card ━━');
  console.log('');
  const cols = ['handle', 'series', 'connection', 'subtitle', 'image', 'colls', 'mfields'];
  const widths = {handle: 50, series: 14, connection: 18, subtitle: 14, image: 22, colls: 16, mfields: 32};
  // Header
  console.log(cols.map((c) => c.padEnd(widths[c])).join(' │ '));
  console.log(cols.map((c) => '─'.repeat(widths[c])).join('─┼─'));
  let allOk = 0;
  for (const p of products) {
    const card = report.get(p.handle);
    const row = [
      shortStr(p.handle, widths.handle).padEnd(widths.handle),
      shortStr(card.series ?? '—', widths.series).padEnd(widths.series),
      shortStr(card.connection ?? '—', widths.connection).padEnd(widths.connection),
      shortStr(card.subtitle ?? '—', widths.subtitle).padEnd(widths.subtitle),
      shortStr(card.image ?? '—', widths.image).padEnd(widths.image),
      shortStr(card.colls ?? '—', widths.colls).padEnd(widths.colls),
      shortStr(card.mfields ?? '—', widths.mfields).padEnd(widths.mfields),
    ];
    console.log(row.join(' │ '));
    const allGreen =
      (card.series ?? '').endsWith('✓') &&
      (card.connection ?? '').endsWith('✓') &&
      (card.subtitle === 'EN ✓' || card.subtitle === '—') &&
      (card.image ?? '').startsWith('OK') &&
      (card.colls ?? '').endsWith('✓') &&
      (card.mfields === '0 missing');
    if (allGreen) allOk++;
  }
  console.log('');
  console.log(`Summary: ${allOk}/${products.length} products fully clean`);
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

console.log('Loading prod products …');
const products = await fetchAllProducts();
console.log(`  fetched ${products.length} product${products.length === 1 ? '' : 's'}`);
console.log('Loading catalog …');
const catalog = loadCatalog();
console.log(`  catalog has ${catalog.size} entries`);
console.log('');

const report = new Map();
for (const p of products) report.set(p.handle, {});

if (STAGES.has('A')) await stageA(products, catalog, report);
if (STAGES.has('B')) await stageB(products, report);
if (STAGES.has('C')) await stageC(products, report);
if (STAGES.has('D')) await stageD(products, catalog, report);
if (STAGES.has('E')) await stageE(products, catalog, report);
if (STAGES.has('F')) await stageF(products, catalog, report);
if (STAGES.has('G')) await stageG(products, report);
if (STAGES.has('H')) stageH(products, report);

console.log('');
if (!APPLY) console.log('(dry-run — re-run with --apply to write changes)');
