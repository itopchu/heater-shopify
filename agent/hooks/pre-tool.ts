/**
 * Pre-tool safety hook for the G-Berg Claude Agent SDK harness.
 *
 * Multi-layer production safety gate. The model invokes Shopify Admin tools through
 * the MCP wrapper; this hook is called BEFORE every tool dispatch and decides
 * allow/deny + (when interactive) prompts the human operator.
 *
 * Trust model
 * -----------
 * The hook receives a fully-resolved {@link StoreConfig}. We trust `store.key` because
 * `resolveStore()` in `agent/src/store-config.ts` enforces:
 *   - **Domain allowlist**: a `dev` key must resolve to a domain matching one of
 *     `AGENT_DEV_DOMAIN_ALLOWLIST` (default `-dev.myshopify.com`), and a `prod` key
 *     must NOT match any of those suffixes. This blocks env-var injection where a
 *     prod domain is jammed into `SHOPIFY_DEV_STORE`.
 *   - **Source tracking**: `--store prod` from the CLI is the only path to a prod
 *     `StoreConfig`. `AGENT_DEFAULT_STORE=prod` (env-only) is rejected before we ever
 *     get here.
 *
 * If those upstream invariants hold, then `store.key === 'prod'` truly means "the
 * user explicitly opted into prod targeting on this invocation."
 *
 * Mutation detection
 * ------------------
 * GraphQL `mutation` documents and REST POST/PUT/PATCH/DELETE are treated as writes.
 * Detection is case-insensitive and tolerates leading whitespace, comments, and
 * multi-document strings. See {@link looksLikeMutation}.
 *
 * Confirmation UX
 * ---------------
 * On a prod write the prompt prints the resolved domain + tool name + the first
 * 200 chars of the GraphQL/REST payload, so a typo'd domain (e.g. accidentally
 * pointing at the live store) is visible before the operator types
 * "yes mutate prod" to proceed.
 */

import type { StoreConfig } from '../src/store-config.js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const CONFIRMATION_PHRASE = 'yes mutate prod';

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type ToolCheckResult =
  | { allow: true }
  | { allow: false; reason: string };

/**
 * True if the GraphQL document string looks like a mutation operation.
 *
 * Strategy:
 *   1. Strip leading whitespace + line/block comments, then check for
 *      `^\s*mutation\b` case-insensitively. Catches `Mutation`, `MUTATION`,
 *      and indented forms.
 *   2. Secondary heuristic: scan the whole string for `mutation <name|{>`
 *      to catch multi-document strings where the mutation is not first
 *      (e.g. a query followed by a mutation in the same payload).
 *   3. Comments-only matches (the literal word "mutation" inside a `#`
 *      line or `"""..."""` block) do NOT trip the gate.
 *
 * Note: we deliberately do not depend on the `graphql` npm package — it is not
 * installed and pulling it in for a tiny regex check is overkill. If we ever
 * add it as a real dependency we can swap to `parse(query).definitions[].operation`.
 */
export function looksLikeGraphQLMutation(query: string): boolean {
  if (!query) return false;
  // Remove # line comments and """block""" string literals so the word "mutation"
  // inside docs/comments does not trigger.
  const stripped = query
    .replace(/"""[\s\S]*?"""/g, ' ')
    .replace(/#[^\n]*/g, ' ');

  if (/^\s*mutation\b/i.test(stripped)) return true;
  // Mid-string: `mutation Foo {` or `mutation {` or `mutation Foo(`.
  if (/\bmutation\s+[A-Za-z_]/i.test(stripped)) return true;
  if (/\bmutation\s*\{/i.test(stripped)) return true;
  if (/\bmutation\s*\(/i.test(stripped)) return true;
  return false;
}

function looksLikeMutation(tool: ToolCall): boolean {
  if (tool.name.toLowerCase().includes('mutation')) return true;
  const query = typeof tool.input.query === 'string' ? tool.input.query : '';
  const body = typeof tool.input.body === 'string' ? tool.input.body : '';
  if (looksLikeGraphQLMutation(query)) return true;
  if (looksLikeGraphQLMutation(body)) return true;
  return false;
}

function requireRestWritesOnProd(tool: ToolCall): boolean {
  if (tool.name !== 'shopify.rest') return false;
  const method = typeof tool.input.method === 'string' ? tool.input.method.toUpperCase() : 'GET';
  return method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
}

function checkImageBudget(tool: ToolCall): ToolCheckResult | null {
  if (!tool.name.startsWith('sync.')) return null;
  const rawLimit = tool.input.limit;
  const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : 5;
  const projectedImages = limit * 5;
  const model = (process.env.GEMINI_IMAGE_MODEL || '').toLowerCase();
  const perImageCost = model.includes('pro') ? 0.15 : 0.04;
  const projectedCost = projectedImages * perImageCost;
  if (projectedCost <= 10) return null;
  if (process.env.ALLOW_LARGE_IMAGE_RUN === '1') return null;
  return {
    allow: false,
    reason: `image-budget: projected $${projectedCost.toFixed(2)} > $10, set ALLOW_LARGE_IMAGE_RUN=1 to override`,
  };
}

function buildPreview(tool: ToolCall): string {
  const input = tool.input;
  if (typeof input.query === 'string') {
    const oneLine = input.query.replace(/\s+/g, ' ').trim();
    return `query: ${oneLine.slice(0, 200)}${oneLine.length > 200 ? '…' : ''}`;
  }
  if (typeof input.path === 'string') {
    const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET';
    return `${method} ${input.path}`.slice(0, 200);
  }
  if (typeof input.body === 'string') {
    const oneLine = input.body.replace(/\s+/g, ' ').trim();
    return `body: ${oneLine.slice(0, 200)}${oneLine.length > 200 ? '…' : ''}`;
  }
  return JSON.stringify(input).slice(0, 200);
}

export async function checkToolCall(
  tool: ToolCall,
  store: StoreConfig,
  options: { promptUser?: boolean } = {},
): Promise<ToolCheckResult> {
  const budget = checkImageBudget(tool);
  if (budget) return budget;

  if (store.key !== 'prod') return { allow: true };

  const isMutation =
    looksLikeMutation(tool) || requireRestWritesOnProd(tool) || tool.name.startsWith('sync.');
  if (!isMutation) return { allow: true };

  if (!options.promptUser) {
    return {
      allow: false,
      reason: `Production mutation blocked without interactive confirmation. Tool: ${tool.name}.`,
    };
  }

  const preview = buildPreview(tool);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(
      `\n=== PROD MUTATION REQUESTED ===\n` +
        `  store : ${store.handle} (${store.key})\n` +
        `  tool  : ${tool.name}\n` +
        `  call  : ${preview}\n` +
        `\nType "${CONFIRMATION_PHRASE}" to allow, anything else to deny: `,
    );
    const answer = (await rl.question('')).trim();
    if (answer === CONFIRMATION_PHRASE) return { allow: true };
    return {
      allow: false,
      reason: `User denied prod mutation for ${tool.name}.`,
    };
  } finally {
    rl.close();
  }
}
