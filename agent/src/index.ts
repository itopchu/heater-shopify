import { query } from '@anthropic-ai/claude-agent-sdk';
import { checkToolCall } from '../hooks/pre-tool.js';
import { parseStoreFlag, resolveStore, stripStoreFlag } from './store-config.js';
import { shopifyGraphQL, shopifyRest } from './tools/shopify.js';
import { buildHavnMcpServer, HAVN_TOOL_NAMES } from './tools/mcp-tools.js';

const rawArgv = process.argv.slice(2);
const storeKey = parseStoreFlag(rawArgv);
const restArgs = stripStoreFlag(rawArgv);

const task = restArgs.join(' ').trim();
if (!task) {
  console.error('Usage: npm run agent -- [--store dev|prod] "<task>"');
  console.error('');
  console.error('Built-in shortcuts (no LLM, fast):');
  console.error('  ping | shop            → print shop + domain + plan');
  console.error('  list products          → print 10 newest products');
  console.error('');
  console.error('Anything else is routed through Claude with Havn Shopify tools.');
  console.error('Example: npm run agent -- --store dev "how many products do I have?"');
  process.exit(1);
}

const store = resolveStore(storeKey);

console.log(`[agent] store=${store.key} handle=${store.handle} api=${store.apiVersion}`);
console.log(`[agent] task: ${task}`);

async function runBuiltin(kind: 'ping' | 'list-products'): Promise<void> {
  const pretool = await checkToolCall(
    {
      name: 'shopify.graphql',
      input: { query: kind === 'ping' ? 'query shop' : 'query products' },
    },
    store,
    { promptUser: true },
  );
  if (!pretool.allow) throw new Error(pretool.reason);
  if (kind === 'ping') {
    const data = await shopifyGraphQL(store, {
      query: '{ shop { name primaryDomain { host } plan { displayName } } }',
    });
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const data = await shopifyGraphQL(store, {
    query:
      '{ products(first: 10) { nodes { id handle title status onlineStoreUrl totalInventory } } }',
  });
  console.log(JSON.stringify(data, null, 2));
}

const SYSTEM_PROMPT = `You are the Havn dev-store agent. You manage a Shopify store for a European heater brand (Havn) using the Shopify Admin GraphQL API 2026-04.

Active store: ${store.handle} (${store.key}). ${store.key === 'prod' ? 'PRODUCTION — mutations require user confirmation at runtime.' : 'DEV store — mutations flow freely.'}

You have two tools:
- mcp__havn__shopify_graphql({query, variables?}) — run any GraphQL operation.
- mcp__havn__shopify_rest({method, path, body?}) — use only when GraphQL does not expose the operation.

Conventions:
- Default to GraphQL. Batch requests when practical.
- When an action is irreversible or broad (bulk delete, bulk update, theme publish), pause and report intent before executing.
- Work on dev by default; never assume prod context.
- Report final state as concise JSON or a short summary, not as narration.

Shop context: English-default UI; DE secondary via Translate & Adapt. Products are Havn radiators seeded with handles havn-nord/havn-fjord/havn-skagen/havn-bris/havn-storm. Europe multi-country market (DE/BE/ES/AT/NL) with EUR currency.`;

async function runLLM(userTask: string): Promise<void> {
  const mcpServer = buildHavnMcpServer(store);
  const options = {
    mcpServers: { havn: mcpServer },
    tools: [] as string[],
    allowedTools: HAVN_TOOL_NAMES,
    maxTurns: 25,
    systemPrompt: SYSTEM_PROMPT,
    permissionMode: 'bypassPermissions' as const,
  };
  const stream = query({ prompt: userTask, options });

  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          console.log(`\n${block.text}`);
        } else if (block.type === 'tool_use') {
          const input = block.input as Record<string, unknown>;
          const summary =
            typeof input.query === 'string'
              ? String(input.query).slice(0, 100).replace(/\s+/g, ' ')
              : typeof input.path === 'string'
                ? `${input.method} ${input.path}`
                : JSON.stringify(input).slice(0, 100);
          console.log(`\n[tool] ${block.name} → ${summary}${summary.length >= 100 ? '…' : ''}`);
        }
      }
    } else if (message.type === 'result') {
      if (message.subtype !== 'success') {
        console.error(`\n[agent] finished: ${message.subtype}`);
        process.exitCode = 1;
      }
    }
  }
}

try {
  const lower = task.toLowerCase();
  if (lower === 'ping' || lower === 'shop') {
    await runBuiltin('ping');
  } else if (lower.startsWith('list products')) {
    await runBuiltin('list-products');
  } else {
    await runLLM(task);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[agent] error: ${message}`);
  process.exit(1);
}
