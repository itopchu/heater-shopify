import { z } from 'zod';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { StoreConfig } from '../store-config.js';
import { shopifyGraphQL, shopifyRest } from './shopify.js';
import { checkToolCall } from '../../hooks/pre-tool.js';

export function buildHavnMcpServer(store: StoreConfig) {
  const graphqlTool = tool(
    'shopify_graphql',
    'Execute a GraphQL query or mutation against the Shopify Admin API (version 2026-04). Input: { query: GraphQL string, variables?: object }. Use this for every read and every write.',
    {
      query: z.string().describe('GraphQL query or mutation string'),
      variables: z
        .record(z.unknown())
        .optional()
        .describe('Optional variables object for the GraphQL operation'),
    },
    async (args) => {
      const gate = await checkToolCall(
        { name: 'shopify.graphql', input: args as unknown as Record<string, unknown> },
        store,
        { promptUser: true },
      );
      if (!gate.allow) {
        return { content: [{ type: 'text', text: `BLOCKED: ${gate.reason}` }], isError: true };
      }
      try {
        const call: { query: string; variables?: Record<string, unknown> } = { query: args.query };
        if (args.variables !== undefined) call.variables = args.variables as Record<string, unknown>;
        const data = await shopifyGraphQL(store, call);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
      }
    },
  );

  const restTool = tool(
    'shopify_rest',
    'Execute a REST call against the Shopify Admin API (version 2026-04). Input: { method, path, body? }. Prefer shopify_graphql; use this only for endpoints not available in GraphQL (e.g. /shop.json tax flags).',
    {
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string().describe('Path after /admin/api/<version>, e.g. "/shop.json"'),
      body: z.unknown().optional().describe('Optional request body (object)'),
    },
    async (args) => {
      const gate = await checkToolCall(
        { name: 'shopify.rest', input: args as unknown as Record<string, unknown> },
        store,
        { promptUser: true },
      );
      if (!gate.allow) {
        return { content: [{ type: 'text', text: `BLOCKED: ${gate.reason}` }], isError: true };
      }
      try {
        const data = await shopifyRest(store, {
          method: args.method,
          path: args.path,
          body: args.body,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
      }
    },
  );

  return createSdkMcpServer({
    name: 'havn',
    version: '0.1.0',
    tools: [graphqlTool, restTool],
  });
}

export const HAVN_TOOL_NAMES = [
  'mcp__havn__shopify_graphql',
  'mcp__havn__shopify_rest',
];
