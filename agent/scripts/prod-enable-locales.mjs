#!/usr/bin/env node
// Enable + publish all 7 EU locales on the prod store.
// Idempotent. Reads SHOPIFY_PROD_STORE / SHOPIFY_PROD_ADMIN_TOKEN from .env.local.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '..', '.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_* in .env.local');

const APPLY = process.argv.includes('--apply');

// EN is already primary on the new store. Add the 7 launch locales.
const LOCALES = ['de', 'nl', 'fr', 'es', 'it', 'pl', 'da'];

async function gql(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

console.log(`→ ${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

const cur = await gql(`{ shopLocales { locale primary published } }`);
const existing = new Map(cur.shopLocales.map((l) => [l.locale, l]));
console.log('Current:', cur.shopLocales.map((l) => `${l.locale}${l.primary ? '*' : ''}${l.published ? '' : '[unpub]'}`).join(' '));

for (const locale of LOCALES) {
  const e = existing.get(locale);
  if (e?.published) {
    console.log(`  ${locale}  ✓ already published`);
    continue;
  }
  if (!e) {
    console.log(`  ${locale}  + enable + publish`);
    if (APPLY) {
      await gql(
        `mutation($l:String!){ shopLocaleEnable(locale:$l){ shopLocale{ locale published } userErrors{ field message } } }`,
        { l: locale }
      );
      await gql(
        `mutation($l:String!){ shopLocaleUpdate(locale:$l, shopLocale:{published:true}){ shopLocale{ locale published } userErrors{ field message } } }`,
        { l: locale }
      );
    }
  } else {
    console.log(`  ${locale}  + publish (was unpublished)`);
    if (APPLY) {
      await gql(
        `mutation($l:String!){ shopLocaleUpdate(locale:$l, shopLocale:{published:true}){ shopLocale{ locale published } userErrors{ field message } } }`,
        { l: locale }
      );
    }
  }
}

const after = await gql(`{ shopLocales { locale primary published } }`);
console.log('Final:  ', after.shopLocales.map((l) => `${l.locale}${l.primary ? '*' : ''}${l.published ? '' : '[unpub]'}`).join(' '));
