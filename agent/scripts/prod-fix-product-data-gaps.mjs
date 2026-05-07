/**
 * Two prod data fixes in one script:
 *
 * 1. Backfill measurements on the bathroom-radiator mounting kit
 *    (`befestigungsset-fur-badheizkorper`). The xxl source page lists
 *    compatibility data that wasn't carried into our store, so the PDP
 *    spec table came up empty.
 *
 *    Sets:
 *      specs.material           = "plastic"
 *      specs.dimensions_w_h_d_mm = "≤ 2000 × 750"   (max compatible
 *      radiator size; the operator + numeric form is language-neutral
 *      so it renders identically across all four storefront locales)
 *
 * 2. Register de/nl/fr title translations for the 3 products created
 *    after the bulk translation pass:
 *      - elanor-replacement-towel-warmer-white
 *      - heizstab-white
 *      - heizstab-anthracite
 *
 * Idempotent. Dry-run by default; pass --apply to write.
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

// =====================================================================
// 1. Mounting kit metafields
// =====================================================================
console.log('[1/2] Mounting kit measurement backfill');
const MK = 'befestigungsset-fur-badheizkorper';
const mkProduct = (
  await gql(
    `query($h:String!){productByHandle(handle:$h){id title metafields(first:50){nodes{namespace key value}}}}`,
    {h: MK},
  )
).productByHandle;
if (!mkProduct) {
  console.log(`  ✗ ${MK} not found`);
} else {
  console.log(`  product: ${mkProduct.title}  ${mkProduct.id}`);
  const have = new Map(mkProduct.metafields.nodes.map((m) => [`${m.namespace}.${m.key}`, m.value]));
  const targets = [
    {namespace: 'specs', key: 'material', type: 'single_line_text_field', value: 'plastic'},
    {namespace: 'specs', key: 'dimensions_w_h_d_mm', type: 'single_line_text_field', value: '≤ 2000 × 750'},
  ];
  const toWrite = [];
  for (const mf of targets) {
    const k = `${mf.namespace}.${mf.key}`;
    if (have.get(k) === mf.value) {
      console.log(`  = ${k} already "${mf.value}"`);
    } else {
      console.log(`  + ${k} = "${mf.value}"  ${have.has(k) ? `(was "${have.get(k)}")` : '(new)'}`);
      toWrite.push({...mf, ownerId: mkProduct.id});
    }
  }
  if (APPLY && toWrite.length) {
    const r = await gql(
      `mutation($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{field message}}}`,
      {metafields: toWrite},
    );
    const errs = r.metafieldsSet.userErrors;
    if (errs.length) console.log(`  ✗ ${JSON.stringify(errs)}`);
    else console.log(`  ✓ wrote ${toWrite.length} metafields`);
  } else if (!APPLY && toWrite.length) {
    console.log(`  (dry-run — would write ${toWrite.length})`);
  }
}

// =====================================================================
// 2. Title translations for the 3 products created post-bulk-translate
// =====================================================================
console.log('\n[2/2] Title translation backfill');

const TITLE_TRANSLATIONS = {
  'elanor-replacement-towel-warmer-white': {
    de: 'Elanor — Austausch-Handtuchheizkörper, Seitenanschluss, Weiß',
    nl: 'Elanor — Vervangende handdoekradiator, zijaansluiting, wit',
    fr: 'Elanor — Sèche-serviettes de remplacement, raccordement latéral, blanc',
  },
  'heizstab-white': {
    de: 'Elektrischer Heizstab — Weiß',
    nl: 'Elektrisch verwarmingselement — Wit',
    fr: 'Élément chauffant électrique — Blanc',
  },
  'heizstab-anthracite': {
    de: 'Elektrischer Heizstab — Anthrazit',
    nl: 'Elektrisch verwarmingselement — Antraciet',
    fr: 'Élément chauffant électrique — Anthracite',
  },
};

let registered = 0,
  alreadyHad = 0;
for (const [handle, langs] of Object.entries(TITLE_TRANSLATIONS)) {
  const p = (
    await gql(`query($h:String!){productByHandle(handle:$h){id title}}`, {h: handle})
  ).productByHandle;
  if (!p) {
    console.log(`  ✗ ${handle} not found`);
    continue;
  }
  console.log(`  ${handle}  (source: "${p.title}")`);
  // Get title digest from translatableContent (digest is locale-agnostic)
  const tc = await gql(
    `query($id:ID!){translatableResource(resourceId:$id){translatableContent{key value digest}}}`,
    {id: p.id},
  );
  const titleC = tc.translatableResource.translatableContent.find((c) => c.key === 'title');
  if (!titleC) {
    console.log(`    ✗ no title content`);
    continue;
  }
  // Per-locale check (the translations() field requires a locale arg)
  const existing = new Set();
  for (const loc of Object.keys(langs)) {
    const r = await gql(
      `query($id:ID!,$loc:String!){translatableResource(resourceId:$id){translations(locale:$loc){key}}}`,
      {id: p.id, loc},
    );
    if ((r.translatableResource?.translations || []).some((t) => t.key === 'title')) {
      existing.add(loc);
    }
  }
  const translations = [];
  for (const [loc, value] of Object.entries(langs)) {
    if (existing.has(loc)) {
      console.log(`    = ${loc} already registered`);
      alreadyHad++;
    } else {
      translations.push({locale: loc, key: 'title', value, translatableContentDigest: titleC.digest});
      console.log(`    + ${loc} → "${value}"`);
    }
  }
  if (APPLY && translations.length) {
    const r = await gql(
      `mutation($id:ID!,$translations:[TranslationInput!]!){translationsRegister(resourceId:$id,translations:$translations){userErrors{field message}}}`,
      {id: p.id, translations},
    );
    const errs = r.translationsRegister.userErrors;
    if (errs.length) console.log(`    ✗ ${JSON.stringify(errs)}`);
    else registered += translations.length;
  } else if (!APPLY) {
    registered += translations.length;
  }
}
console.log(`\nSummary: ${registered} title translations registered, ${alreadyHad} already present`);
if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
