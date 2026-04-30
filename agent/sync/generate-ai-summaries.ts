/**
 * Generate AI-readable factual summaries for each heating product, written
 * back to the `aix.*` metafields:
 *
 *   - aix.entity_summary           — multi_line_text_field, 2-3 factual sentences
 *   - aix.key_facts                — json, [{label, value}, ...]  (4-6 items)
 *   - aix.compatibility_summary    — multi_line_text_field, 1-2 sentences
 *   - aix.customer_question_summary — multi_line_text_field, 1-2 sentences
 *
 * Why this script exists separately:
 *   - These summaries are read by AI search crawlers (Google AI Overview,
 *     Perplexity, ChatGPT browsing) and by our own PDP `<AiBlock>` component.
 *   - They distill the much longer scraper-sourced content/sections_en into
 *     factual, claim-restricted prose. Generating them per-page on each
 *     request would be expensive and non-deterministic; running once per
 *     product change and caching on disk by sha256(input) is cheap.
 *
 * Mirrors `translate-sections.ts`:
 *   - Same Admin GraphQL fetch loop
 *   - Same disk cache layout (.sync-cache/ai-summaries/<key>.json)
 *   - Same idempotency rule (skip if `aix.entity_summary` already set; pass
 *     `--force` to overwrite)
 *   - Same Claude Agent SDK auth (Claude Code CLI runtime)
 *
 * CLI:
 *   npx tsx agent/sync/generate-ai-summaries.ts --store dev --dry-run
 *   npx tsx agent/sync/generate-ai-summaries.ts --store dev --limit 1
 *   npx tsx agent/sync/generate-ai-summaries.ts --store dev --handle konrad-ventilheizkorper-typ-22
 *   npx tsx agent/sync/generate-ai-summaries.ts --store dev --force
 *
 * Cost note (don't surprise the merchant):
 *   - 47 products × ~4 prompts each = ~188 Claude calls. Run via CI/manually
 *     after major catalog changes; the disk cache handles re-runs for free.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '@anthropic-ai/claude-agent-sdk';

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

interface Cli {
  store: 'dev' | 'prod';
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  handle: string | null;
}

function parseCli(argv: string[]): Cli {
  const store = (argv.includes('--store') ? argv[argv.indexOf('--store') + 1] : 'dev') as
    | 'dev'
    | 'prod';
  if (store !== 'dev' && store !== 'prod') throw new Error(`--store must be dev or prod`);
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : null;
  if (limit != null && (!Number.isFinite(limit) || limit < 0))
    throw new Error('--limit must be non-negative integer');
  const handleIdx = argv.indexOf('--handle');
  const handle = handleIdx >= 0 ? (argv[handleIdx + 1] ?? null) : null;
  return { store, dryRun, force, limit, handle };
}

function loadEnvLocal(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

// ---------------------------------------------------------------------------
// Shopify Admin GraphQL
// ---------------------------------------------------------------------------

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';

interface GraphqlError {
  message: string;
  extensions?: { code?: string };
}

async function gql<T>(
  endpoint: string,
  token: string,
  q: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: q, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: GraphqlError[] };
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data as T;
}

interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  productType: string | null;
  tags: string[];
  description: string;
  sectionsEn: { value: string } | null;
  sectionsDe: { value: string } | null;
  entitySummary: { value: string } | null;
  keyFacts: { value: string } | null;
  compatibilitySummary: { value: string } | null;
  customerQuestionSummary: { value: string } | null;
  specsColor: { value: string } | null;
  specsHeatingMedium: { value: string } | null;
  specsMaterial: { value: string } | null;
  specsConnectionType: { value: string } | null;
  filtersProductType: { value: string } | null;
}

async function listProducts(endpoint: string, token: string): Promise<ShopifyProductNode[]> {
  const q = `
    query($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          handle
          title
          productType
          tags
          description
          sectionsEn:           metafield(namespace: "content",  key: "sections_en") { value }
          sectionsDe:           metafield(namespace: "content",  key: "sections_de") { value }
          entitySummary:        metafield(namespace: "aix",      key: "entity_summary") { value }
          keyFacts:             metafield(namespace: "aix",      key: "key_facts") { value }
          compatibilitySummary: metafield(namespace: "aix",      key: "compatibility_summary") { value }
          customerQuestionSummary: metafield(namespace: "aix",   key: "customer_question_summary") { value }
          specsColor:           metafield(namespace: "specs",    key: "color") { value }
          specsHeatingMedium:   metafield(namespace: "specs",    key: "heating_medium") { value }
          specsMaterial:        metafield(namespace: "specs",    key: "material") { value }
          specsConnectionType:  metafield(namespace: "specs",    key: "connection_type") { value }
          filtersProductType:   metafield(namespace: "filters",  key: "product_type") { value }
        }
      }
    }
  `;
  const out: ShopifyProductNode[] = [];
  let cursor: string | null = null;
  for (;;) {
    const data = await gql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ShopifyProductNode[];
      };
    }>(endpoint, token, q, { cursor });
    out.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

interface AiSummaries {
  entity_summary: string;
  key_facts: Array<{ label: string; value: string }>;
  compatibility_summary: string;
  customer_question_summary: string;
}

async function setAiMetafields(
  endpoint: string,
  token: string,
  productId: string,
  s: AiSummaries,
): Promise<void> {
  const m = `
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `;
  const data = await gql<{
    metafieldsSet: { userErrors: Array<{ field: string[]; message: string }> };
  }>(endpoint, token, m, {
    metafields: [
      {
        ownerId: productId,
        namespace: 'aix',
        key: 'entity_summary',
        type: 'multi_line_text_field',
        value: s.entity_summary,
      },
      {
        ownerId: productId,
        namespace: 'aix',
        key: 'key_facts',
        type: 'json',
        value: JSON.stringify(s.key_facts),
      },
      {
        ownerId: productId,
        namespace: 'aix',
        key: 'compatibility_summary',
        type: 'multi_line_text_field',
        value: s.compatibility_summary,
      },
      {
        ownerId: productId,
        namespace: 'aix',
        key: 'customer_question_summary',
        type: 'multi_line_text_field',
        value: s.customer_question_summary,
      },
    ],
  });
  const errs = data.metafieldsSet.userErrors;
  if (errs.length > 0) throw new Error(`metafieldsSet errors: ${JSON.stringify(errs)}`);
}

// ---------------------------------------------------------------------------
// Cache (sha256 of the *combined input* → JSON summaries)
// ---------------------------------------------------------------------------

const CACHE_DIR = resolve(process.cwd(), '.sync-cache', 'ai-summaries');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(input: string): string {
  return createHash('sha256').update(`aix-v1:${input}`).digest('hex').slice(0, 16);
}

function readCache(key: string): AiSummaries | null {
  const p = resolve(CACHE_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as AiSummaries;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: AiSummaries): void {
  ensureCacheDir();
  writeFileSync(resolve(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// Claude prompt
// ---------------------------------------------------------------------------

interface ScraperSection {
  title: string;
  text: string;
}

/**
 * Build a compact, factual context string from the product. We keep this small
 * (truncated) because the goal is *factual extraction*, not a creative rewrite,
 * and large contexts blow the cache hit rate.
 */
function buildContext(p: ShopifyProductNode): string {
  const sectionsRaw = p.sectionsEn?.value ?? p.sectionsDe?.value ?? null;
  let sections: ScraperSection[] = [];
  if (sectionsRaw) {
    try {
      const parsed = JSON.parse(sectionsRaw);
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (s && typeof s === 'object' && typeof s.title === 'string') {
            sections.push({
              title: String(s.title),
              text: typeof s.text === 'string' ? String(s.text) : '',
            });
          }
        }
      }
    } catch {
      /* ignore parse error; fall through to description */
    }
  }
  // Limit to first ~4 sections, ~600 chars each. That's enough to identify
  // type/material/connection/wattage without flooding the prompt.
  const sectionBlob = sections
    .slice(0, 4)
    .map((s) => `### ${s.title}\n${s.text.slice(0, 600)}`)
    .join('\n\n');

  const facts: string[] = [];
  if (p.filtersProductType?.value) facts.push(`product_type: ${p.filtersProductType.value}`);
  if (p.specsHeatingMedium?.value) facts.push(`heating_medium: ${p.specsHeatingMedium.value}`);
  if (p.specsColor?.value) facts.push(`color: ${p.specsColor.value}`);
  if (p.specsMaterial?.value) facts.push(`material: ${p.specsMaterial.value}`);
  if (p.specsConnectionType?.value) facts.push(`connection: ${p.specsConnectionType.value}`);

  return [
    `Title: ${p.title}`,
    p.productType ? `Shopify product type: ${p.productType}` : '',
    p.tags.length ? `Tags: ${p.tags.slice(0, 12).join(', ')}` : '',
    facts.length ? `Known facts:\n${facts.map((f) => `- ${f}`).join('\n')}` : '',
    sectionBlob ? `Source content:\n${sectionBlob}` : '',
    p.description ? `Plain description:\n${p.description.slice(0, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const SYSTEM_PROMPT = `You are a factual product-data extractor for a European heater/radiator retailer.
Your job: read the supplied product context and emit four short, factual blocks suitable for AI search crawlers.

Strict rules:
- No promotional adjectives (avoid "premium", "stylish", "elegant", "high-quality").
- No claims that aren't directly supported by the input. If a fact isn't stated, omit it.
- British English. Use technical units exactly as stated (mm, cm, W, kW, °C, bar).
- The output must be valid JSON matching the schema given in the user prompt — no surrounding prose.`;

const USER_PROMPT_TEMPLATE = (context: string) => `Generate AI-readable summaries for this product.

Product context:
---
${context}
---

Output a single JSON object with exactly these keys:

{
  "entity_summary": "2-3 sentence factual product summary. State what the product is, its category, and 1-2 key technical attributes. No promotional language.",
  "key_facts": [
    {"label": "Type", "value": "..."},
    {"label": "Material", "value": "..."}
    /* 4 to 6 items total. Only stated facts. Each value should be a short phrase, not a sentence. */
  ],
  "compatibility_summary": "1-2 sentences on what heating systems / installations this works with. For accessories, what products it fits.",
  "customer_question_summary": "1-2 sentences anticipating the most common buyer question (sizing, installation, compatibility). Use the FAQ-shaped sections when available."
}

Return only the JSON object — no markdown fences, no commentary.`;

async function generateViaClaude(context: string): Promise<AiSummaries> {
  const prompt = USER_PROMPT_TEMPLATE(context);

  const stream = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 1,
      permissionMode: 'default' as const,
      allowedTools: [],
    },
  });

  let raw = '';
  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') raw += block.text;
      }
    }
  }
  return parseClaudeOutput(raw);
}

/**
 * Defensive parser — strips ``` fences if Claude adds them despite the prompt,
 * extracts the first {...} block, and validates required fields.
 */
function parseClaudeOutput(raw: string): AiSummaries {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
  }
  // Find first { and last } to be robust to a stray prefix.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error(`No JSON object in Claude output: ${raw.slice(0, 200)}`);
  const jsonStr = s.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (typeof parsed !== 'object' || !parsed) throw new Error('Claude output not an object');
  const obj = parsed as Record<string, unknown>;

  const entity_summary = String(obj.entity_summary ?? '').trim();
  const compatibility_summary = String(obj.compatibility_summary ?? '').trim();
  const customer_question_summary = String(obj.customer_question_summary ?? '').trim();

  let key_facts: Array<{ label: string; value: string }> = [];
  if (Array.isArray(obj.key_facts)) {
    key_facts = obj.key_facts
      .filter(
        (e: unknown): e is { label: string; value: string } =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as { label: unknown }).label === 'string' &&
          typeof (e as { value: unknown }).value === 'string',
      )
      .map((e) => ({ label: e.label.trim(), value: e.value.trim() }))
      .slice(0, 6);
  }

  if (!entity_summary) throw new Error('Claude output missing entity_summary');
  if (key_facts.length < 1) throw new Error('Claude output missing key_facts');

  return { entity_summary, key_facts, compatibility_summary, customer_question_summary };
}

async function cachedGenerate(
  context: string,
): Promise<{ summaries: AiSummaries; cacheHit: boolean }> {
  const key = cacheKey(context);
  const cached = readCache(key);
  if (cached) return { summaries: cached, cacheHit: true };
  const summaries = await generateViaClaude(context);
  writeCache(key, summaries);
  return { summaries, cacheHit: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const projectRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
  loadEnvLocal(resolve(projectRoot, '.env.local'));

  const cli = parseCli(process.argv.slice(2));
  const storeKey = cli.store === 'prod' ? 'PROD' : 'DEV';
  const domain = process.env[`SHOPIFY_${storeKey}_STORE`];
  const token = process.env[`SHOPIFY_${storeKey}_ADMIN_TOKEN`];
  if (!domain || !token) throw new Error(`Missing SHOPIFY_${storeKey}_STORE / _ADMIN_TOKEN`);
  const endpoint = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;

  console.log(
    `[generate-ai-summaries] store=${cli.store} domain=${domain} dryRun=${cli.dryRun} force=${cli.force} limit=${cli.limit ?? '∞'}`,
  );

  const products = await listProducts(endpoint, token);
  let scope = products;
  if (cli.handle) scope = scope.filter((p) => p.handle === cli.handle);
  if (cli.limit != null) scope = scope.slice(0, cli.limit);

  console.log(
    `[generate-ai-summaries] ${scope.length} product(s) in scope (of ${products.length} total)`,
  );

  let totalCalls = 0;
  let totalCacheHits = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  const errors: Array<{ handle: string; message: string }> = [];

  for (let i = 0; i < scope.length; i++) {
    const p = scope[i]!;
    const prefix = `[${i + 1}/${scope.length}] ${p.handle}`;

    if (!cli.force && p.entitySummary?.value) {
      console.log(`${prefix} — skip (aix.entity_summary already present, --force to overwrite)`);
      totalSkipped++;
      continue;
    }

    const context = buildContext(p);
    if (!context.trim()) {
      console.warn(`${prefix} — empty context, skipping`);
      continue;
    }

    try {
      const { summaries, cacheHit } = await cachedGenerate(context);
      if (cacheHit) totalCacheHits++;
      else totalCalls++;

      console.log(`${prefix} — ${cacheHit ? 'cached' : 'generated'}`);
      console.log(`  entity_summary: ${summaries.entity_summary}`);
      console.log(
        `  key_facts: ${summaries.key_facts.map((f) => `${f.label}=${f.value}`).join(', ')}`,
      );
      console.log(`  compatibility: ${summaries.compatibility_summary}`);
      console.log(`  customer_q: ${summaries.customer_question_summary}`);

      if (!cli.dryRun) {
        await setAiMetafields(endpoint, token, p.id, summaries);
        totalWritten++;
      }
    } catch (err) {
      console.error(`${prefix} — error: ${(err as Error).message}`);
      errors.push({ handle: p.handle, message: (err as Error).message });
    }
  }

  console.log(`\n[generate-ai-summaries] done.`);
  console.log(`  products written: ${totalWritten}`);
  console.log(`  products skipped (already had aix.entity_summary): ${totalSkipped}`);
  console.log(`  total Claude calls: ${totalCalls}`);
  console.log(`  total cache hits: ${totalCacheHits}`);
  if (errors.length > 0) {
    console.log(`  errors (${errors.length}):`);
    for (const e of errors) console.log(`    - ${e.handle}: ${e.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
