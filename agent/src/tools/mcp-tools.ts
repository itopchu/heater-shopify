import { z } from 'zod';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { StoreConfig } from '../store-config.js';
import { shopifyGraphQL, shopifyRest } from './shopify.js';
import { checkToolCall } from '../../hooks/pre-tool.js';

function findNewestSyncReport(): { file: string; path: string } | null {
  try {
    const dir = resolve(process.cwd(), 'sync-reports');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return null;
    let best: { file: string; path: string; mtime: number } | null = null;
    for (const f of files) {
      const p = resolve(dir, f);
      const m = statSync(p).mtimeMs;
      if (!best || m > best.mtime) best = { file: f, path: p, mtime: m };
    }
    return best ? { file: best.file, path: best.path } : null;
  } catch {
    return null;
  }
}

function runNpmSync(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const isWin = process.platform === 'win32';
    const bin = isWin ? 'npm.cmd' : 'npm';
    const child = execFile(
      bin,
      args,
      { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        let code: number | null;
        if (!err) {
          code = 0;
        } else {
          // Node typings say ErrnoException.code is string | undefined, but execFile's
          // callback in practice attaches the numeric exit code as `.code` on the error.
          // Route through `unknown` so the runtime narrowing is type-sound.
          const errCode = (err as unknown as { code?: number | string }).code;
          code = typeof errCode === 'number' ? errCode : 1;
        }
        resolvePromise({ stdout: String(stdout || ''), stderr: String(stderr || ''), code });
      },
    );
    void child;
  });
}

function tail(text: string, lines = 60): string {
  const arr = text.split(/\r?\n/);
  return arr.slice(Math.max(0, arr.length - lines)).join('\n');
}

export function buildGBergMcpServer(store: StoreConfig) {
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

  const readSyncReportTool = tool(
    'read_sync_report',
    'Read the most recent catalog-sync report (or the N-th most recent if "ago" is given). Returns the JSON summary from sync-reports/. Use this to answer "what did the last sync do?" without running sync.',
    {
      ago: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('0 = latest report, 1 = previous, etc.'),
    },
    async (args) => {
      try {
        const dir = resolve(process.cwd(), 'sync-reports');
        const files = readdirSync(dir)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length === 0) {
          return { content: [{ type: 'text', text: 'No sync reports found.' }] };
        }
        const idx = Math.min(args.ago, files.length - 1);
        const path = resolve(dir, files[idx]!);
        const body = readFileSync(path, 'utf8');
        return { content: [{ type: 'text', text: `${files[idx]}:\n${body}` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
      }
    },
  );

  const syncDryRunTool = tool(
    'sync_dry_run',
    'Run the catalog sync pipeline in dry-run mode against the current store. Spawns `npm run sync -- --store <key> --dry-run --limit N` as a child process (120s timeout). Input: { limit?: number } (default 5). Returns the tail of stdout/stderr plus the JSON of the newest sync-reports/*.json produced.',
    {
      limit: z.number().int().min(1).max(1000).optional().describe('Max products to process (default 5)'),
    },
    async (args) => {
      const input: Record<string, unknown> = {};
      if (args.limit !== undefined) input.limit = args.limit;
      const gate = await checkToolCall(
        { name: 'sync.dry_run', input },
        store,
        { promptUser: true },
      );
      if (!gate.allow) {
        return { content: [{ type: 'text', text: `BLOCKED: ${gate.reason}` }], isError: true };
      }
      const limit = args.limit ?? 5;
      const beforeNewest = findNewestSyncReport();
      try {
        const { stdout, stderr, code } = await runNpmSync(
          ['run', 'sync', '--', '--store', store.key, '--dry-run', '--limit', String(limit)],
          120_000,
        );
        const afterNewest = findNewestSyncReport();
        let reportBlock = '';
        if (afterNewest && (!beforeNewest || afterNewest.path !== beforeNewest.path)) {
          try {
            const body = readFileSync(afterNewest.path, 'utf8');
            reportBlock = `\n\n--- sync-report: ${afterNewest.file} ---\n${body}`;
          } catch {
            reportBlock = `\n\n(failed to read newest report ${afterNewest.file})`;
          }
        } else {
          reportBlock = '\n\n(no new sync-report emitted)';
        }
        const text = [
          `exit=${code}`,
          `--- stdout (tail) ---`,
          tail(stdout),
          `--- stderr (tail) ---`,
          tail(stderr),
          reportBlock,
        ].join('\n');
        return { content: [{ type: 'text', text }], isError: code !== 0 };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
      }
    },
  );

  const syncStatusTool = tool(
    'sync_status',
    'Summarize the most recent catalog-sync report. Returns a compact JSON summary: { file, startedAt, finishedAt, dryRun, actions, errors, imagesGenerated }.',
    {},
    async () => {
      const gate = await checkToolCall(
        { name: 'sync.status', input: {} },
        store,
        { promptUser: false },
      );
      if (!gate.allow) {
        return { content: [{ type: 'text', text: `BLOCKED: ${gate.reason}` }], isError: true };
      }
      try {
        const newest = findNewestSyncReport();
        if (!newest) {
          return { content: [{ type: 'text', text: JSON.stringify({ file: null, message: 'No sync reports found.' }) }] };
        }
        const body = readFileSync(newest.path, 'utf8');
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const errors = Array.isArray(parsed.errors) ? (parsed.errors as unknown[]) : [];
        const summary = {
          file: newest.file,
          startedAt: parsed.startedAt ?? null,
          finishedAt: parsed.finishedAt ?? null,
          dryRun: parsed.dryRun ?? null,
          actions: parsed.actions ?? null,
          errors: errors.length,
          imagesGenerated: parsed.imagesGenerated ?? null,
        };
        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
      }
    },
  );

  const syncLastReportTool = tool(
    'sync_last_report',
    'Return the full parsed JSON of the most recent catalog-sync report from sync-reports/. No arguments.',
    {},
    async () => {
      const gate = await checkToolCall(
        { name: 'sync.last_report', input: {} },
        store,
        { promptUser: false },
      );
      if (!gate.allow) {
        return { content: [{ type: 'text', text: `BLOCKED: ${gate.reason}` }], isError: true };
      }
      try {
        const newest = findNewestSyncReport();
        if (!newest) {
          return { content: [{ type: 'text', text: 'No sync reports found.' }] };
        }
        const body = readFileSync(newest.path, 'utf8');
        const parsed = JSON.parse(body);
        return { content: [{ type: 'text', text: `${newest.file}:\n${JSON.stringify(parsed, null, 2)}` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
      }
    },
  );

  return createSdkMcpServer({
    name: 'gberg',
    version: '0.1.0',
    tools: [graphqlTool, restTool, readSyncReportTool, syncDryRunTool, syncStatusTool, syncLastReportTool],
  });
}

export const GBERG_TOOL_NAMES = [
  'mcp__gberg__shopify_graphql',
  'mcp__gberg__shopify_rest',
  'mcp__gberg__read_sync_report',
  'mcp__gberg__sync_dry_run',
  'mcp__gberg__sync_status',
  'mcp__gberg__sync_last_report',
];
