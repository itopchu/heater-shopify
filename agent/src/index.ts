import { checkToolCall } from '../hooks/pre-tool.js';
import { parseStoreFlag, resolveStore, stripStoreFlag } from './store-config.js';
import { shopifyGraphQL, shopifyRest } from './tools/shopify.js';

const rawArgv = process.argv.slice(2);
const storeKey = parseStoreFlag(rawArgv);
const restArgs = stripStoreFlag(rawArgv);

const task = restArgs.join(' ').trim();
if (!task) {
  console.error('Usage: npm run agent -- [--store dev|prod] "<task>"');
  console.error('Example: npm run agent -- --store dev "list 5 newest products"');
  process.exit(1);
}

const store = resolveStore(storeKey);

console.log(`[agent] store=${store.key} handle=${store.handle} api=${store.apiVersion}`);
console.log(`[agent] task: ${task}`);

type ToolDef<TInput> = {
  name: string;
  run(input: TInput): Promise<unknown>;
};

const tools: {
  graphql: ToolDef<{ query: string; variables?: Record<string, unknown> }>;
  rest: ToolDef<{ method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; body?: unknown }>;
} = {
  graphql: {
    name: 'shopify.graphql',
    async run(input) {
      const gate = await checkToolCall(
        { name: this.name, input: input as unknown as Record<string, unknown> },
        store,
        { promptUser: true },
      );
      if (!gate.allow) throw new Error(gate.reason);
      return shopifyGraphQL(store, input);
    },
  },
  rest: {
    name: 'shopify.rest',
    async run(input) {
      const gate = await checkToolCall(
        { name: this.name, input: input as unknown as Record<string, unknown> },
        store,
        { promptUser: true },
      );
      if (!gate.allow) throw new Error(gate.reason);
      return shopifyRest(store, input);
    },
  },
};

try {
  if (task.toLowerCase() === 'ping' || task.toLowerCase() === 'shop') {
    const data = await tools.graphql.run({
      query: '{ shop { name primaryDomain { host } plan { displayName } } }',
    });
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  if (task.toLowerCase().startsWith('list products')) {
    const data = await tools.graphql.run({
      query:
        '{ products(first: 10) { nodes { id handle title status onlineStoreUrl totalInventory } } }',
    });
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  console.error(
    `[agent] no free-form LLM loop is wired yet. Built-in tasks: "ping" / "shop" / "list products".`,
  );
  console.error(
    `[agent] wire the Claude Agent SDK driver by importing @anthropic-ai/claude-agent-sdk and passing tools.graphql + tools.rest as tool handlers.`,
  );
  process.exit(2);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[agent] error: ${message}`);
  process.exit(1);
}
