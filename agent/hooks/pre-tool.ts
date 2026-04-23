import type { StoreConfig } from '../src/store-config.js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const MUTATION_KEYWORDS = [
  'mutation',
  'Create',
  'Update',
  'Delete',
  'Remove',
  'Publish',
  'Unpublish',
  'Enable',
  'Disable',
  'Upsert',
];

const CONFIRMATION_PHRASE = 'yes mutate prod';

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type ToolCheckResult =
  | { allow: true }
  | { allow: false; reason: string };

function looksLikeMutation(tool: ToolCall): boolean {
  if (tool.name.toLowerCase().includes('mutation')) return true;
  const query = typeof tool.input.query === 'string' ? tool.input.query : '';
  const body = typeof tool.input.body === 'string' ? tool.input.body : '';
  const haystack = `${query} ${body}`;
  return MUTATION_KEYWORDS.some((kw) =>
    haystack.includes(kw.toLowerCase() === kw ? kw : kw) &&
    new RegExp(`\\b${kw}\\b`).test(haystack),
  );
}

function requireRestWritesOnProd(tool: ToolCall): boolean {
  if (tool.name !== 'shopify.rest') return false;
  const method = typeof tool.input.method === 'string' ? tool.input.method.toUpperCase() : 'GET';
  return method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
}

export async function checkToolCall(
  tool: ToolCall,
  store: StoreConfig,
  options: { promptUser?: boolean } = {},
): Promise<ToolCheckResult> {
  if (store.key !== 'prod') return { allow: true };

  const isMutation = looksLikeMutation(tool) || requireRestWritesOnProd(tool);
  if (!isMutation) return { allow: true };

  if (!options.promptUser) {
    return {
      allow: false,
      reason: `Production mutation blocked without interactive confirmation. Tool: ${tool.name}.`,
    };
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(
      `\nPROD mutation requested via ${tool.name}. Type "${CONFIRMATION_PHRASE}" to allow, anything else to deny: `,
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
