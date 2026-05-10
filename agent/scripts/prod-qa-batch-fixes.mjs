#!/usr/bin/env node
/**
 * Batch of QA-driven Shopify catalog corrections (May 2026).
 *
 * Title additions (3 products):
 *   - Multiblock Thermostatic Head Controller     +M30×1.5
 *   - Wall-Hung Bidet, Concealed Valve, Chrome    +Creavit AC 70S
 *   - Underfloor Heating Pipe (PE-RT 5-Layer)     +16×2 mm, 240 m
 *
 * Connection-type corrections (5 products):
 *   - Astoria Black: handle says mittelanschluss but is actually side connection
 *   - Pullman Black/White: tagged mid_or_side, actually center-only
 *   - Elanor hydronic Anthracite/White: side connection, but specifically
 *     left-only — title clarified
 *
 * Electric → plug_in (every product on the store with heating_medium=electric
 * or "electric" tag):
 *   - specs.connection_type = "plug_in" on all
 *   - any "Center Connection" / "Side Connection" phrase stripped from title
 *
 * Collection membership:
 *   - Lavinno toilet → add to bathroom-radiators
 *   - Underfloor Heating Pipe → add to accessories
 *
 * Run: node agent/scripts/prod-qa-batch-fixes.mjs            (dry-run)
 *      node agent/scripts/prod-qa-batch-fixes.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// ────────────────────────────────────────────────────────────────────────
// 1. Title additions
// ────────────────────────────────────────────────────────────────────────
const TITLE_UPDATES = [
  {
    handle: 'multiblock-thermostatkopf-regler-fur-heizkorper-m30x1-5',
    newTitle: 'Multiblock Thermostatic Head Controller, M30×1.5',
  },
  {
    handle: 'creavit-ac-70s-bidet-chrom-kreuz-unterputzventil',
    newTitle: 'Creavit AC 70S — Wall-Hung Bidet, Concealed Valve, Chrome',
  },
  {
    handle: 'fussbodenheizungsrohr-16x2-mm-pe-rt-5-schicht-rohr-240-m',
    newTitle: 'Underfloor Heating Pipe (PE-RT 5-Layer), 16×2 mm, 240 m',
  },
];

// ────────────────────────────────────────────────────────────────────────
// 2. Connection-type corrections (title + specs.connection_type)
// ────────────────────────────────────────────────────────────────────────
const CONNECTION_FIXES = [
  // Astoria Black: was mid → actually side
  {
    handle: 'badheizkorper-mittelanschluss-alpha-schwarz-handtuchwarmer',
    newTitle: 'Astoria — Towel Warmer, Side Connection, Black',
    connectionType: 'side',
  },
  // Pullman Black/White: were mid_or_side → center only
  {
    handle: 'badheizkorper-platon-schwarz-mittel-und-seitenanschluss',
    newTitle: 'Pullman — Towel Warmer, Center Connection, Black',
    connectionType: 'mid',
  },
  {
    handle: 'badheizkorper-platon-weiss-mittel-und-seitenanschluss-1',
    newTitle: 'Pullman — Towel Warmer, Center Connection, White',
    connectionType: 'mid',
  },
  // Elanor hydronic Anthracite/White: side, specifically left-only
  {
    handle: 'badheizkorper-elmar-anthrazit-seitlich-offen-rechts-oder-links',
    newTitle: 'Elanor — Towel Warmer, Left Side Connection, Anthracite',
    connectionType: 'side',
  },
  {
    handle: 'badheizkorper-elmar-weiss-seitlich-offen-rechts-oder-links',
    newTitle: 'Elanor — Towel Warmer, Left Side Connection, White',
    connectionType: 'side',
  },
];

// ────────────────────────────────────────────────────────────────────────
// 3. Electric heaters → plug_in (titles cleaned of connection phrases)
// ────────────────────────────────────────────────────────────────────────
const ELECTRIC_TITLE_CLEAN = [
  // Twister Electric (had "Center Connection" in title)
  {handle: 'elektrische-badheizkorper-mittelanschluss-anthrazit-mira',
    newTitle: 'Twister — Electric Towel Warmer, Anthracite'},
  {handle: 'elektrische-badheizkorper-mittelanschluss-schwarz-mira',
    newTitle: 'Twister — Electric Towel Warmer, Black'},
  {handle: 'elektrische-badheizkorper-mittelanschluss-weiss-mira',
    newTitle: 'Twister — Electric Towel Warmer, White'},
  // Elanor Electric (had "Side Connection" in title)
  {handle: 'badheizkorper-elektrisch-elmar-schwarz-handtuchheizkorper-handtuchwarmer',
    newTitle: 'Elanor — Electric Towel Warmer, Black'},
  {handle: 'badheizkorper-elektrisch-elmar-schwarz-handtuchheizkorper-handtuchwarmer-1',
    newTitle: 'Elanor — Electric Towel Warmer, Black'},
  {handle: 'badheizkorper-elektrisch-elmar-weiss-handtuchheizkorper-handtuchwarmer',
    newTitle: 'Elanor — Electric Towel Warmer, White'},
];

// ────────────────────────────────────────────────────────────────────────
// 4. Collection memberships
// ────────────────────────────────────────────────────────────────────────
const COLLECTION_ADDS = [
  {productHandle: 'lavinno-hange-wc-tornado-rimless-weiss-glanzend',
    collectionHandle: 'bathroom-radiators'},
  {productHandle: 'fussbodenheizungsrohr-16x2-mm-pe-rt-5-schicht-rohr-240-m',
    collectionHandle: 'accessories'},
];

// ────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────
async function getProductId(handle) {
  const d = await gql(`query($h:String!){productByHandle(handle:$h){id title}}`, {h: handle});
  if (!d.productByHandle) throw new Error(`product not found: ${handle}`);
  return {id: d.productByHandle.id, title: d.productByHandle.title};
}

async function getCollectionId(handle) {
  const d = await gql(`query($h:String!){collectionByHandle(handle:$h){id}}`, {h: handle});
  if (!d.collectionByHandle) throw new Error(`collection not found: ${handle}`);
  return d.collectionByHandle.id;
}

async function setProductTitle(id, newTitle) {
  const d = await gql(
    `mutation($p:ProductUpdateInput!){productUpdate(product:$p){product{id title} userErrors{field message}}}`,
    {p: {id, title: newTitle}},
  );
  if (d.productUpdate.userErrors.length) throw new Error(JSON.stringify(d.productUpdate.userErrors));
}

async function setConnectionMetafield(productId, value) {
  const d = await gql(
    `mutation($mf:[MetafieldsSetInput!]!){metafieldsSet(metafields:$mf){metafields{id key value} userErrors{field message}}}`,
    {mf: [{ownerId: productId, namespace: 'specs', key: 'connection_type',
      type: 'single_line_text_field', value}]},
  );
  if (d.metafieldsSet.userErrors.length) throw new Error(JSON.stringify(d.metafieldsSet.userErrors));
}

async function addProductToCollection(productId, collectionId) {
  const d = await gql(
    `mutation($id:ID!,$pids:[ID!]!){collectionAddProductsV2(id:$id, productIds:$pids){job{id done} userErrors{field message}}}`,
    {id: collectionId, pids: [productId]},
  );
  if (d.collectionAddProductsV2.userErrors.length) throw new Error(JSON.stringify(d.collectionAddProductsV2.userErrors));
}

async function listElectric() {
  const all = []; let cursor = null;
  while (true) {
    const d = await gql(
      `query($a:String){products(first:100,after:$a){edges{cursor node{id handle title tags metafields(first:30){nodes{namespace key value}}}}pageInfo{hasNextPage}}}`,
      {a: cursor},
    );
    for (const e of d.products.edges) {
      const mf = Object.fromEntries(e.node.metafields.nodes.map(m=>[`${m.namespace}.${m.key}`,m.value]));
      const isElec = mf['specs.heating_medium'] === 'electric' || e.node.tags.includes('electric');
      if (!isElec) continue;
      // Skip non-heating accessories that happen to be tagged "electric"
      // (e.g. thermal fluid bottles for electric radiators) — connection
      // type doesn't apply to them.
      const isFluidLike = /thermofluss|fluid|liquid|thermal\s+fluid/i.test(e.node.title);
      if (isFluidLike) continue;
      all.push({id: e.node.id, handle: e.node.handle, title: e.node.title,
        currentConn: mf['specs.connection_type']});
    }
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.edges.at(-1).cursor;
  }
  return all;
}

// ────────────────────────────────────────────────────────────────────────
// execute
// ────────────────────────────────────────────────────────────────────────

console.log('=== TITLE additions ===');
for (const t of TITLE_UPDATES) {
  const p = await getProductId(t.handle);
  console.log(`  "${p.title}" → "${t.newTitle}"`);
  if (APPLY) await setProductTitle(p.id, t.newTitle);
}

console.log('\n=== CONNECTION corrections ===');
for (const c of CONNECTION_FIXES) {
  const p = await getProductId(c.handle);
  console.log(`  ${c.handle}`);
  console.log(`    title: "${p.title}" → "${c.newTitle}"`);
  console.log(`    connection_type → ${c.connectionType}`);
  if (APPLY) {
    await setProductTitle(p.id, c.newTitle);
    await setConnectionMetafield(p.id, c.connectionType);
  }
}

console.log('\n=== ELECTRIC title cleanups ===');
for (const t of ELECTRIC_TITLE_CLEAN) {
  const p = await getProductId(t.handle);
  console.log(`  "${p.title}" → "${t.newTitle}"`);
  if (APPLY) await setProductTitle(p.id, t.newTitle);
}

console.log('\n=== ELECTRIC → plug_in (every electric product) ===');
const electric = await listElectric();
console.log(`Found ${electric.length} electric products`);
for (const e of electric) {
  if (e.currentConn === 'plug_in' || e.currentConn === 'plug-in') {
    console.log(`  skip (already plug_in): ${e.handle}`);
    continue;
  }
  console.log(`  ${e.handle}  ${e.currentConn ?? '-'} → plug_in`);
  if (APPLY) await setConnectionMetafield(e.id, 'plug_in');
}

console.log('\n=== COLLECTION memberships ===');
for (const c of COLLECTION_ADDS) {
  const p = await getProductId(c.productHandle);
  const cid = await getCollectionId(c.collectionHandle);
  console.log(`  ${c.productHandle} + ${c.collectionHandle}`);
  if (APPLY) await addProductToCollection(p.id, cid);
}

console.log(`\n${APPLY ? '✓ APPLIED' : '— DRY RUN. Re-run with --apply.'}`);
