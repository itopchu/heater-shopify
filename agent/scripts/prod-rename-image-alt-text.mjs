#!/usr/bin/env node
/**
 * Update product image `altText` to match the German-cities rename.
 *
 *   Twister → Berlin   Pullman → Dresden  Elanor → Hamburg
 *   Astoria → Potsdam  Kira    → Mainz    Flora  → Köln
 *   Atlas   → Essen    Konrad  → Aachen   Lavinno → Baden
 *
 * The rename script (prod-rename-series-to-german-cities.mjs) updated the
 * product *title* and `custom.series` metafield, but left every image's
 * `altText` carrying the old leading codename — visible in the rendered
 * <img alt="…">. This script fixes the alt text on every image whose
 * value starts with one of the old codenames.
 *
 * Idempotent: an alt that doesn't lead with an old codename is skipped.
 *
 *   node agent/scripts/prod-rename-image-alt-text.mjs            # dry-run
 *   node agent/scripts/prod-rename-image-alt-text.mjs --apply
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const API = '2026-04';
const RENAMES = {
  Twister: 'Berlin',
  Pullman: 'Dresden',
  Elanor:  'Hamburg',
  Astoria: 'Potsdam',
  Kira:    'Mainz',
  Flora:   'Köln',
  Atlas:   'Essen',
  Konrad:  'Aachen',
  Lavinno: 'Baden',
};
// Match `^Old\b` so we don't rewrite e.g. "Astorian-something".
const LEAD_RE = new RegExp(`^(${Object.keys(RENAMES).join('|')})\\b`);

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes('--apply');
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

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// 1. Fetch every product + its images (id, altText).
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){
      products(first:50, after:$c){
        pageInfo{hasNextPage endCursor}
        nodes{
          id title handle
          media(first:30){
            nodes{
              ... on MediaImage{
                id alt
                image{ id altText url }
              }
            }
          }
        }
      }
    }`, {c: cursor});
  products.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`fetched ${products.length} products\n`);

let plannedProducts = 0, plannedImages = 0, appliedImages = 0;
for (const p of products) {
  const updates = [];
  for (const m of p.media.nodes) {
    if (!m?.id) continue;
    const alt = m.alt ?? m.image?.altText ?? '';
    const lead = alt.match(LEAD_RE);
    if (!lead) continue;
    const newAlt = alt.replace(LEAD_RE, RENAMES[lead[1]]);
    updates.push({id: m.id, oldAlt: alt, newAlt});
  }
  if (updates.length === 0) continue;
  plannedProducts++;
  plannedImages += updates.length;
  console.log(`• ${p.title}  (${updates.length} image${updates.length > 1 ? 's' : ''} to fix)`);
  for (const u of updates) console.log(`    "${u.oldAlt.slice(0, 60)}…" → "${u.newAlt.slice(0, 60)}…"`);
  if (!APPLY) continue;

  // productUpdateMedia(productId, media:[{id, alt}])
  const r = await gql(
    `mutation($pid:ID!, $media:[UpdateMediaInput!]!){
      productUpdateMedia(productId:$pid, media:$media){
        media{ id alt }
        mediaUserErrors{ field message }
      }
    }`,
    {pid: p.id, media: updates.map((u) => ({id: u.id, alt: u.newAlt}))});
  const errs = r.productUpdateMedia.mediaUserErrors;
  if (errs.length) {
    console.log(`    ⚠ errors: ${JSON.stringify(errs)}`);
    continue;
  }
  appliedImages += updates.length;
  console.log(`    ✓ ${updates.length} updated`);
}

console.log(`\n${APPLY ? 'Applied' : 'Planned'}: ${appliedImages || plannedImages} alt-texts across ${plannedProducts} products`);
if (!APPLY) console.log('Re-run with --apply to write.');
