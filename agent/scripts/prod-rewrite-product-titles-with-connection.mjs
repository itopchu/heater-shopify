/**
 * Inject the "Center / Side / Center & Side Connection" phrase into
 * product TITLES on prod (EN source + de/nl/fr translations) for any
 * product whose specs.connection_type is set but whose current title
 * does not already disclose the connection.
 *
 * Why: the user's PLP screenshot showed several Astoria cards reading
 * "Astoria — Towel Warmer, White" / "Astoria — Replacement Towel
 * Warmer, Anthracite" — visually inconsistent with sibling cards like
 * "Astoria — Towel Warmer, Center Connection, Black". The connection
 * info IS on the product (specs.connection_type is set), it just
 * never made it into the title rendered above the price.
 *
 * Title patterns recognised:
 *   "X — Y, [Color]"          → "X — Y, [Connection], [Color]"
 *   "X — Y, Z, [Color]"       → "X — Y, Z, [Connection], [Color]"  (only when Z isn't already a connection word)
 *   "X — Y, [Connection], …"  → no-op
 *
 * Locale-aware insertion: when EN gets "Center Connection", DE gets
 * "Mittelanschluss", NL "Middenaansluiting", FR "Raccordement central".
 * Colour token in the existing translation is detected via the same
 * de/nl/fr colour vocabulary the rest of the catalog uses.
 *
 * Idempotent. --apply writes; default is dry-run.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_*');
const APPLY = process.argv.includes('--apply');

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

// ---- locale phrase tables ----

const CONNECTION_PHRASE = {
  mid:         {en: 'Center Connection', de: 'Mittelanschluss', nl: 'Middenaansluiting', fr: 'Raccordement central'},
  side:        {en: 'Side Connection',   de: 'Seitenanschluss', nl: 'Zijaansluiting',    fr: 'Raccordement latéral'},
  mid_or_side: {en: 'Center & Side Connection', de: 'Mittel- & Seitenanschluss', nl: 'Midden- & Zijaansluiting', fr: 'Raccordement central & latéral'},
  // Standalone electric models with no pipe connection — "Plug-In" is the
  // industry loanword used identically in all four target locales.
  plug_in:     {en: 'Plug-In', de: 'Plug-In', nl: 'Plug-In', fr: 'Plug-In'},
};

// Colour tokens used to find the comma-position where the connection
// phrase should be inserted (it always goes JUST BEFORE the colour).
const COLOUR_RE = {
  en: /(?:^|, )(white|black|anthracite|chrome)$/i,
  de: /(?:^|, )(weiß|weiss|schwarz|anthrazit|chrom)$/i,
  nl: /(?:^|, )(wit|zwart|antraciet|chroom)$/i,
  fr: /(?:^|, )(blanc|noir|anthracite|chrome)$/i,
};

// Detect whether a title already contains a connection phrase for any locale.
const ALREADY_HAS = /center connection|side connection|center & side connection|plug-in|mittelanschluss|seitenanschluss|mittel-? ?(?:und|oder|&) ?seiten|middenaansluiting|zijaansluiting|midden-? ?(?:of|en|&) ?zij|raccordement central|raccordement lat[ée]ral/i;

function injectIntoTitle(title, locale, phrase) {
  if (!title) return null;
  if (ALREADY_HAS.test(title)) return null; // already has a connection phrase
  const colourRe = COLOUR_RE[locale];
  const m = title.match(colourRe);
  if (!m) return null;
  const matched = m[0]; // includes the leading ", "
  const colour = m[1];
  // Replace ", colour" with ", phrase, colour" (or leading-position fallback)
  if (matched.startsWith(', ')) {
    return title.replace(matched, `, ${phrase}, ${colour}`);
  }
  // Title is just a single colour word — unlikely on our catalogue but
  // handle defensively.
  return `${phrase}, ${colour}`;
}

// ---- main ----

console.log('Fetching products…');
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){products(first:50,after:$c){pageInfo{hasNextPage endCursor} nodes{
      id handle title
      metafields(first:30){nodes{namespace key value}}
    }}}`,
    {c: cursor},
  );
  for (const p of d.products.nodes) {
    const ct = p.metafields.nodes.find((m) => m.namespace === 'specs' && m.key === 'connection_type')?.value;
    products.push({...p, ct});
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`  ${products.length} products fetched`);
console.log('');

let titleWrites = 0;
let translationWrites = 0;
let skippedNoCT = 0;
let skippedAlreadyHas = 0;
let skippedNoColourMatch = 0;

for (const p of products) {
  if (!p.ct || !CONNECTION_PHRASE[p.ct]) {
    skippedNoCT++;
    continue;
  }
  const phrases = CONNECTION_PHRASE[p.ct];
  // EN source title
  const newEnTitle = injectIntoTitle(p.title, 'en', phrases.en);
  if (!newEnTitle) {
    if (ALREADY_HAS.test(p.title)) skippedAlreadyHas++;
    else skippedNoColourMatch++;
    continue;
  }
  console.log(`  ${p.handle}`);
  console.log(`    EN: "${p.title}" → "${newEnTitle}"`);

  // Fetch existing translations + digest
  const trData = await gql(
    `query($id:ID!){translatableResource(resourceId:$id){translatableContent{key value digest}}}`,
    {id: p.id},
  );
  const titleC = trData.translatableResource.translatableContent.find((c) => c.key === 'title');
  if (!titleC) {
    console.log(`    ✗ no translatable title content`);
    continue;
  }

  // Apply the EN write FIRST (this changes the digest)
  if (APPLY) {
    const r = await gql(
      `mutation($p:ProductUpdateInput!){productUpdate(product:$p){userErrors{field message}}}`,
      {p: {id: p.id, title: newEnTitle}},
    );
    const errs = r.productUpdate.userErrors;
    if (errs.length) {
      console.log(`    ✗ EN update failed: ${JSON.stringify(errs)}`);
      continue;
    }
  }

  // Re-fetch the digest (it changed when we updated the EN source)
  let newDigest = titleC.digest;
  if (APPLY) {
    const tr2 = await gql(
      `query($id:ID!){translatableResource(resourceId:$id){translatableContent{key value digest}}}`,
      {id: p.id},
    );
    const t2 = tr2.translatableResource.translatableContent.find((c) => c.key === 'title');
    newDigest = t2?.digest ?? newDigest;
  }

  titleWrites++;

  // For each target locale, fetch existing title translation and inject
  for (const locale of ['de', 'nl', 'fr']) {
    const trLoc = await gql(
      `query($id:ID!,$loc:String!){translatableResource(resourceId:$id){translations(locale:$loc){key value}}}`,
      {id: p.id, loc: locale},
    );
    const existing = (trLoc.translatableResource?.translations || []).find((t) => t.key === 'title')?.value;
    if (!existing) {
      console.log(`    ⚠ ${locale}: no existing translation; skipping (will be machine-translated by next sync)`);
      continue;
    }
    const phrase = phrases[locale];
    const newLocTitle = injectIntoTitle(existing, locale, phrase);
    if (!newLocTitle) {
      console.log(`    ⚠ ${locale}: "${existing}" — colour token not detected; skipping`);
      continue;
    }
    console.log(`    ${locale}: "${existing}" → "${newLocTitle}"`);
    if (APPLY) {
      const r = await gql(
        `mutation($id:ID!,$translations:[TranslationInput!]!){translationsRegister(resourceId:$id,translations:$translations){userErrors{field message}}}`,
        {id: p.id, translations: [{locale, key: 'title', value: newLocTitle, translatableContentDigest: newDigest}]},
      );
      const errs = r.translationsRegister.userErrors;
      if (errs.length) console.log(`      ✗ ${JSON.stringify(errs)}`);
      else translationWrites++;
    } else {
      translationWrites++;
    }
  }
}

console.log('');
console.log(`Summary:`);
console.log(`  titles updated      : ${titleWrites}`);
console.log(`  translations written: ${translationWrites}`);
console.log(`  skipped (no ct set) : ${skippedNoCT}`);
console.log(`  skipped (already ok): ${skippedAlreadyHas}`);
console.log(`  skipped (no colour) : ${skippedNoColourMatch}`);
if (!APPLY) console.log('\n(dry-run — re-run with --apply to write)');
