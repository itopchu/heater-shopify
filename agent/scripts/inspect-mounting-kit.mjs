import {readFileSync, writeFileSync} from 'node:fs';
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
async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: q, variables: v}),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

// Find the Mounting Kit product. Try the obvious German source handle first.
const candidates = ['befestigungsset-fur-badheizkorper', 'mounting-kit', 'mounting-kit-for-bathroom-radiators', 'befestigungsset'];
let p = null, foundHandle = null;
for (const h of candidates) {
  const r = await gql(`query($h:String!){productByHandle(handle:$h){id title handle}}`, {h});
  if (r.productByHandle) { p = r.productByHandle; foundHandle = h; break; }
}
if (!p) {
  // Search by title
  const s = await gql(`{ products(first:20, query:"title:Mounting OR title:Befestigung") { edges { node { id title handle } } } }`);
  console.log('Title search:'); for (const e of s.products.edges) console.log('  -', e.node.handle, '/', e.node.title);
  process.exit(0);
}

console.log(`→ Found by handle: ${foundHandle}`);
const detail = (await gql(
  `query($h:String!){productByHandle(handle:$h){
    id title handle status vendor productType tags descriptionHtml
    seo{title description}
    options{id name position values}
    variants(first:50){edges{node{id sku title price selectedOptions{name value}}}}
    images(first:50){edges{node{id url altText width height}}}
    metafields(first:50){edges{node{namespace key value type}}}
    collections(first:10){edges{node{handle title ruleSet{rules{column}}}}}
  }}`,
  {h: foundHandle},
)).productByHandle;

writeFileSync(resolve(ROOT, 'data/mounting-kit-prod-snapshot.json'), JSON.stringify(detail, null, 2));
console.log(`✓ wrote data/mounting-kit-prod-snapshot.json`);
console.log('\nSummary:');
console.log(`  id:        ${detail.id}`);
console.log(`  title:     ${detail.title}`);
console.log(`  handle:    ${detail.handle}`);
console.log(`  status:    ${detail.status}`);
console.log(`  options:   ${detail.options.map(o => `${o.name} [${o.values.join(', ')}]`).join(' · ') || '(none)'}`);
console.log(`  variants:  ${detail.variants.edges.length}`);
for (const v of detail.variants.edges.map(e => e.node)) {
  const so = v.selectedOptions.map(s => s.value).join('/') || '(default)';
  console.log(`    - ${so}  sku=${v.sku || '?'}  €${v.price}`);
}
console.log(`  images:    ${detail.images.edges.length}`);
for (const e of detail.images.edges) console.log(`    - ${e.node.url}  alt="${e.node.altText ?? ''}"`);
console.log(`  collections: ${detail.collections.edges.length}`);
for (const e of detail.collections.edges) console.log(`    - ${e.node.handle} (rules:${e.node.ruleSet?.rules?.length || 0})`);
console.log(`  metafields: ${detail.metafields.edges.length}`);
for (const e of detail.metafields.edges) console.log(`    - ${e.node.namespace}.${e.node.key} (${e.node.type})`);
