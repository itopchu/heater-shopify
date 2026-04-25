import assert from 'node:assert/strict';
import { checkToolCall, looksLikeGraphQLMutation } from '../../hooks/pre-tool.js';
import { loadConfig } from '../../sync/env.js';
import { requireDevSafety, resolveStore } from '../store-config.js';
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

// ---------------------------------------------------------------------------
// R3 — store-config + pre-tool hardening (audit findings H3a/H3b/H3c)
// ---------------------------------------------------------------------------

await expect('prod store BLOCKS capital-M Mutation document', async () => {
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: { query: 'Mutation productCreate($p: ProductInput!) { productCreate(product: $p) { product { id } } }' },
    },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, false);
});

await expect('prod store BLOCKS ALL-CAPS MUTATION document', async () => {
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: { query: 'MUTATION foo { productCreate(product: {}) { product { id } } }' },
    },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, false);
});

await expect('prod store BLOCKS mid-string mutation in multi-doc payload', async () => {
  // A query followed by a mutation in the same document string — the old keyword
  // check would fire on "Create" anyway, but we want the dedicated detector to fire too.
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: {
        query: 'query a { shop { name } }\n\nmutation b { productDelete(input: {id:"gid"}) { deletedProductId } }',
      },
    },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, false);
});

await expect('prod store ALLOWS benign query with the word "mutation" in a # comment', async () => {
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      // Pure read query; the word "mutation" appears only in a comment and a description.
      input: { query: '# this query intentionally avoids any mutation\n{ shop { name } }' },
    },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, true);
});

await expect('prod store ALLOWS benign query with "mutation" inside a """block""" string', async () => {
  const res = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: {
        query: '{ shop { name } }\n"""\nthis schema description mentions mutation but is not one\n"""',
      },
    },
    prodStore,
    { promptUser: false },
  );
  assert.equal(res.allow, true);
});

await expect('looksLikeGraphQLMutation: leading-whitespace mutation trips', async () => {
  assert.equal(looksLikeGraphQLMutation('   \n   mutation foo { x }'), true);
});

await expect('looksLikeGraphQLMutation: false on plain read query', async () => {
  assert.equal(looksLikeGraphQLMutation('{ shop { name } }'), false);
});

await expect('requireDevSafety: dev key with prod-looking handle THROWS', async () => {
  let threw = false;
  try {
    requireDevSafety('dev', 'gberg-prod.myshopify.com');
  } catch (err) {
    threw = true;
    assert.match((err as Error).message, /does not match the dev allowlist/);
  }
  assert.equal(threw, true);
});

await expect('requireDevSafety: prod key with dev-looking handle THROWS', async () => {
  let threw = false;
  try {
    requireDevSafety('prod', 'heater-dev.myshopify.com');
  } catch (err) {
    threw = true;
    assert.match((err as Error).message, /looks like a dev domain/);
  }
  assert.equal(threw, true);
});

await expect('requireDevSafety: dev key with allowlisted dev handle PASSES', async () => {
  // Should not throw.
  requireDevSafety('dev', 'heater-dev.myshopify.com');
});

await expect('requireDevSafety: prod key with proper prod handle PASSES', async () => {
  requireDevSafety('prod', 'gberg-heizung.myshopify.com');
});

await expect('resolveStore: AGENT_DEFAULT_STORE=prod via env-only is REJECTED', async () => {
  const savedDefault = process.env.AGENT_DEFAULT_STORE;
  const savedProdStore = process.env.SHOPIFY_PROD_STORE;
  const savedProdToken = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
  process.env.AGENT_DEFAULT_STORE = 'prod';
  process.env.SHOPIFY_PROD_STORE = 'gberg-heizung.myshopify.com';
  process.env.SHOPIFY_PROD_ADMIN_TOKEN = 'prod-token';
  let threw = false;
  try {
    // No CLI flag → source defaults to 'default' → must reject prod-via-env.
    resolveStore(undefined);
  } catch (err) {
    threw = true;
    assert.match((err as Error).message, /AGENT_DEFAULT_STORE=prod is not allowed/);
  } finally {
    if (savedDefault === undefined) delete process.env.AGENT_DEFAULT_STORE;
    else process.env.AGENT_DEFAULT_STORE = savedDefault;
    if (savedProdStore === undefined) delete process.env.SHOPIFY_PROD_STORE;
    else process.env.SHOPIFY_PROD_STORE = savedProdStore;
    if (savedProdToken === undefined) delete process.env.SHOPIFY_PROD_ADMIN_TOKEN;
    else process.env.SHOPIFY_PROD_ADMIN_TOKEN = savedProdToken;
  }
  assert.equal(threw, true);
});

await expect('resolveStore: explicit --store prod (source=cli) is ACCEPTED', async () => {
  const savedProdStore = process.env.SHOPIFY_PROD_STORE;
  const savedProdToken = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
  process.env.SHOPIFY_PROD_STORE = 'gberg-heizung.myshopify.com';
  process.env.SHOPIFY_PROD_ADMIN_TOKEN = 'prod-token';
  try {
    const cfg = resolveStore('prod', { source: 'cli' });
    assert.equal(cfg.key, 'prod');
    assert.equal(cfg.handle, 'gberg-heizung.myshopify.com');
  } finally {
    if (savedProdStore === undefined) delete process.env.SHOPIFY_PROD_STORE;
    else process.env.SHOPIFY_PROD_STORE = savedProdStore;
    if (savedProdToken === undefined) delete process.env.SHOPIFY_PROD_ADMIN_TOKEN;
    else process.env.SHOPIFY_PROD_ADMIN_TOKEN = savedProdToken;
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
