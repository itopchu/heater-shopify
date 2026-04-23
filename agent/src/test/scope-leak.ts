import assert from 'node:assert/strict';
import { checkToolCall } from '../../hooks/pre-tool.js';
import type { StoreConfig } from '../store-config.js';

const devStore: StoreConfig = {
  key: 'dev',
  handle: 'heater-dev.myshopify.com',
  token: 'dev-token',
  apiVersion: '2026-04',
};

const prodStore: StoreConfig = {
  key: 'prod',
  handle: 'heater-prod.myshopify.com',
  token: 'prod-token',
  apiVersion: '2026-04',
};

let pass = 0;
let fail = 0;

async function expect(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    pass++;
  } catch (err) {
    fail++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${name}\n      ${msg}`);
  }
}

console.log('Agent scope-leak + pre-tool hook smoke tests\n');

await expect('dev store allows read query', async () => {
  const res = await checkToolCall(
    { name: 'shopify.graphql', input: { query: '{ shop { name } }' } },
    devStore,
  );
  assert.equal(res.allow, true);
});

await expect('dev store allows mutation without prompt', async () => {
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: { query: 'mutation productCreate($p: ProductInput!) { productCreate(product: $p) { product { id } } }' },
    },
    devStore,
  );
  assert.equal(res.allow, true);
});

await expect('prod store allows read query', async () => {
  const res = await checkToolCall(
    { name: 'shopify.graphql', input: { query: '{ shop { name } }' } },
    prodStore,
  );
  assert.equal(res.allow, true);
});

await expect('prod store BLOCKS mutation when promptUser=false', async () => {
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: { query: 'mutation productCreate($p: ProductInput!) { productCreate(product: $p) { product { id } } }' },
    },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, false);
  if (res.allow === false) {
    assert.match(res.reason, /Production mutation blocked/);
  }
});

await expect('prod store BLOCKS REST POST', async () => {
  const res = await checkToolCall(
    { name: 'shopify.rest', input: { method: 'POST', path: '/shop.json', body: {} } },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, false);
});

await expect('prod store ALLOWS REST GET', async () => {
  const res = await checkToolCall(
    { name: 'shopify.rest', input: { method: 'GET', path: '/shop.json' } },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, true);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
