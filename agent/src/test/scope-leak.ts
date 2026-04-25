import assert from 'node:assert/strict';
import { checkToolCall } from '../../hooks/pre-tool.js';
import { loadConfig } from '../../sync/env.js';
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

await expect('sync config defaults to dev when no --store flag', async () => {
  process.env.SHOPIFY_DEV_STORE = process.env.SHOPIFY_DEV_STORE || 'heater-dev.myshopify.com';
  process.env.SHOPIFY_DEV_ADMIN_TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN || 'dev-token';
  delete process.env.AGENT_DEFAULT_STORE;
  const cfg = loadConfig([]);
  assert.equal(cfg.storeKey, 'dev');
});

await expect('sync config requires explicit --store prod for prod', async () => {
  process.env.SHOPIFY_PROD_STORE = 'heater-prod.myshopify.com';
  process.env.SHOPIFY_PROD_ADMIN_TOKEN = 'prod-token';
  const cfg = loadConfig(['--store', 'prod']);
  assert.equal(cfg.storeKey, 'prod');
});

await expect('sync config rejects unknown --store value', async () => {
  let threw = false;
  try {
    loadConfig(['--store', 'staging']);
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});

await expect('sync config fails if prod creds missing', async () => {
  const savedStore = process.env.SHOPIFY_PROD_STORE;
  const savedToken = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
  delete process.env.SHOPIFY_PROD_STORE;
  delete process.env.SHOPIFY_PROD_ADMIN_TOKEN;
  let threw = false;
  try {
    loadConfig(['--store', 'prod']);
  } catch {
    threw = true;
  }
  if (savedStore) process.env.SHOPIFY_PROD_STORE = savedStore;
  if (savedToken) process.env.SHOPIFY_PROD_ADMIN_TOKEN = savedToken;
  assert.equal(threw, true);
});

await expect('sync.dry_run with --store prod is blocked unless confirmed', async () => {
  const res = await checkToolCall(
    { name: 'sync.dry_run', input: { limit: 5 } },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, false);
});

await expect('image budget guard trips when limit is huge', async () => {
  const savedModel = process.env.GEMINI_IMAGE_MODEL;
  const savedAllow = process.env.ALLOW_LARGE_IMAGE_RUN;
  delete process.env.GEMINI_IMAGE_MODEL;
  delete process.env.ALLOW_LARGE_IMAGE_RUN;
  try {
    const res = await checkToolCall(
      { name: 'sync.dry_run', input: { limit: 1000 } },
      devStore,
      { promptUser: false },
    );
    assert.equal(res.allow, false);
    if (res.allow === false) {
      assert.match(res.reason, /image-budget/);
    }
  } finally {
    if (savedModel !== undefined) process.env.GEMINI_IMAGE_MODEL = savedModel;
    if (savedAllow !== undefined) process.env.ALLOW_LARGE_IMAGE_RUN = savedAllow;
  }
});

await expect('ALLOW_LARGE_IMAGE_RUN=1 bypasses the budget guard', async () => {
  const savedAllow = process.env.ALLOW_LARGE_IMAGE_RUN;
  process.env.ALLOW_LARGE_IMAGE_RUN = '1';
  try {
    const res = await checkToolCall(
      { name: 'sync.dry_run', input: { limit: 1000 } },
      devStore,
      { promptUser: false },
    );
    assert.equal(res.allow, true);
  } finally {
    if (savedAllow === undefined) delete process.env.ALLOW_LARGE_IMAGE_RUN;
    else process.env.ALLOW_LARGE_IMAGE_RUN = savedAllow;
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
