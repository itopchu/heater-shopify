#!/usr/bin/env node
/**
 * Restore the truncated `custom.short_description` and `custom.subtitle`
 * metafields from each product's full body_html. Earlier translation
 * pass capped these at ~215 chars and ended them with "…" — visible
 * to customers in the PDP Overview.
 *
 * Strategy: pull the visible text out of the body_html (already English),
 * and overwrite the truncated short_description / subtitle.
 *
 * - subtitle (single_line_text_field) gets the FIRST bullet — one
 *   short sentence.
 * - short_description (multi_line_text_field) gets the FULL bullet
 *   list — no truncation.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');

async function gql(q, v) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function listProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const d = await gql(`query($c:String){
      products(first:50, after:$c){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id handle title
          descriptionHtml
          short: metafield(namespace:"custom", key:"short_description"){ value type }
          subtitle: metafield(namespace:"custom", key:"subtitle"){ value type }
        }
      }
    }`, { c: cursor });
    out.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

/**
 * Pull the full bullet-list short copy out of body_html. xxl-style
 * radiator bodies open with a `<span class="metafield-multi_line_text_field">`
 * containing the visible "✔ …" bullets, separated by `<br>`. This is
 * the same content that was originally meant to live in
 * custom.short_description before truncation.
 */
function extractBulletList(html) {
  if (!html) return null;
  // Find the first multi-line metafield span (where the bullet list lives).
  const m = html.match(/<span[^>]*class="[^"]*metafield-multi_line_text_field[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return null;
  return m[1]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function firstSentence(text) {
  if (!text) return '';
  const firstLine = text.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return '';
  return firstLine.replace(/[\s\.…]+$/, '').trim();
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
const products = await listProducts();
let touched = 0;
for (const p of products) {
  const truncatedShort = /…$|\.\.\.$/.test((p.short?.value || '').trim());
  const truncatedSub = /…$|\.\.\.$/.test((p.subtitle?.value || '').trim());
  if (!truncatedShort && !truncatedSub) continue;
  const fullBullets = extractBulletList(p.descriptionHtml);
  if (!fullBullets) {
    console.log(`SKIP ${p.handle}: no bullet list found in body`);
    continue;
  }
  const fullSubtitle = firstSentence(fullBullets).slice(0, 240);
  console.log(`\n${p.handle}`);
  if (truncatedShort) {
    console.log(`  short: ${p.short.value.length}c (truncated) → ${fullBullets.length}c`);
  }
  if (truncatedSub) {
    console.log(`  subtitle: "${(p.subtitle.value || '').slice(0, 60)}…" → "${fullSubtitle.slice(0, 60)}…"`);
  }
  touched++;
  if (!APPLY) continue;
  const mf = [];
  if (truncatedShort) {
    mf.push({
      ownerId: p.id,
      namespace: 'custom',
      key: 'short_description',
      type: p.short.type ?? 'multi_line_text_field',
      value: fullBullets,
    });
  }
  if (truncatedSub) {
    mf.push({
      ownerId: p.id,
      namespace: 'custom',
      key: 'subtitle',
      type: p.subtitle.type ?? 'single_line_text_field',
      value: fullSubtitle,
    });
  }
  if (mf.length) {
    const r = await gql(`mutation($m:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$m){ userErrors{message} }
    }`, { m: mf });
    if (r.metafieldsSet.userErrors.length) {
      console.log(`  ✗ ${JSON.stringify(r.metafieldsSet.userErrors)}`);
    }
  }
}
console.log(`\nTouched ${touched} products`);
