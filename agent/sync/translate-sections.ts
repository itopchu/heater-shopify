/**
 * Translate `content.sections_de` (DE source sections from the scraper) into
 * `content.sections_en` on each product. Uses the Claude Agent SDK with disk
 * caching keyed by sha256 of source text — reruns are free after the first
 * pass.
 *
 * Why a separate script (not part of `agent/sync/translate.ts`):
 * - translate.ts only handles titleDe + bodyHtmlDe (the NormalizedProduct
 *   fields). Sections are stored in metafields, not normalized fields, so they
 *   sit outside the sync pipeline's translate phase.
 * - Section translation is bursty (~700 calls for 47 products) and we want to
 *   run it independently of the sync diff/write loop.
 *
 * Flow:
 *   1. Query products with `content.sections_de` metafield from Admin GraphQL
 *   2. For each product, translate title + text per section (cached)
 *   3. Skip products that already have `content.sections_en` (unless --force)
 *   4. Write `content.sections_en` (type: json) via metafieldsSet
 *
 * CLI:
 *   npx tsx agent/sync/translate-sections.ts --store dev --dry-run
 *   npx tsx agent/sync/translate-sections.ts --store dev
 *   npx tsx agent/sync/translate-sections.ts --store dev --limit 3
 *   npx tsx agent/sync/translate-sections.ts --store dev --handle konrad-ventilheizkorper-typ-22
 *   npx tsx agent/sync/translate-sections.ts --store dev --force
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const store = (argv.includes('--store') ? argv[argv.indexOf('--store') + 1] : 'dev') as 'dev' | 'prod';
  if (store !== 'dev' && store !== 'prod') throw new Error(`--store must be dev or prod`);
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : null;
  if (limit != null && (!Number.isFinite(limit) || limit < 0)) throw new Error('--limit must be non-negative integer');
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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

async function gql<T>(endpoint: string, token: string, q: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
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
  sectionsDe: { value: string } | null;
  sectionsEn: { value: string } | null;
}

async function listProductsWithSections(endpoint: string, token: string): Promise<ShopifyProductNode[]> {
  const q = `
    query($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          handle
          title
          sectionsDe: metafield(namespace: "content", key: "sections_de") { value }
          sectionsEn: metafield(namespace: "content", key: "sections_en") { value }
        }
      }
    }
  `;
  const out: ShopifyProductNode[] = [];
  let cursor: string | null = null;
  for (;;) {
    const data = await gql<{ products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyProductNode[] } }>(
      endpoint,
      token,
      q,
      { cursor },
    );
    out.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

async function setSectionsEn(endpoint: string, token: string, productId: string, sectionsEnJson: string): Promise<void> {
  const m = `
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `;
  const data = await gql<{ metafieldsSet: { userErrors: Array<{ field: string[]; message: string }> } }>(
    endpoint,
    token,
    m,
    {
      metafields: [
        { ownerId: productId, namespace: 'content', key: 'sections_en', type: 'json', value: sectionsEnJson },
      ],
    },
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length > 0) throw new Error(`metafieldsSet errors: ${JSON.stringify(errs)}`);
}

// ---------------------------------------------------------------------------
// Translation cache (sha256 of DE → EN string), shared shape with translate.ts
// ---------------------------------------------------------------------------

const CACHE_DIR = resolve(process.cwd(), '.sync-cache', 'translations');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(deText: string): string {
  return createHash('sha256').update(deText).digest('hex').slice(0, 16);
}

function readCache(key: string): string | null {
  const p = resolve(CACHE_DIR, `${key}.txt`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

function writeCache(key: string, value: string): void {
  ensureCacheDir();
  writeFileSync(resolve(CACHE_DIR, `${key}.txt`), value);
}

// ---------------------------------------------------------------------------
// Claude DE→EN translator (mirrors translate.ts)
// ---------------------------------------------------------------------------

async function translateViaClaude(deText: string, context: string): Promise<string> {
  if (!deText.trim()) return '';
  const systemPrompt = `You are a professional DE→EN product-copy translator for an e-commerce heater/radiator retailer.
Translate the German source text to idiomatic, concise, customer-facing British English.
Preserve HTML tags, markdown, and any technical units (mm, cm, W, °C) exactly.
Do not add explanations. Output only the translation.`;

  const userPrompt = `Context: ${context}\n\n--- DE source ---\n${deText}`;

  const stream = query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      maxTurns: 1,
      permissionMode: 'default' as const,
      allowedTools: [],
    },
  });

  let out = '';
  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') out += block.text;
      }
    }
  }
  return out.trim();
}

async function cachedTranslate(deText: string, context: string): Promise<{ en: string; cacheHit: boolean }> {
  const key = cacheKey(`section:${deText}`);
  const cached = readCache(key);
  if (cached != null) return { en: cached, cacheHit: true };
  const en = await translateViaClaude(deText, context);
  writeCache(key, en);
  return { en, cacheHit: false };
}

// ---------------------------------------------------------------------------
// Section translation orchestrator
// ---------------------------------------------------------------------------

interface ScraperSection {
  title: string;
  text: string;
  html: string;
  source: string;
}

async function translateProductSections(
  productHandle: string,
  productTitle: string,
  sectionsDe: ScraperSection[],
): Promise<{ sectionsEn: Array<ScraperSection & { titleDe: string; textDe: string }>; cacheHits: number; calls: number }> {
  const out: Array<ScraperSection & { titleDe: string; textDe: string }> = [];
  let cacheHits = 0;
  let calls = 0;
  for (let i = 0; i < sectionsDe.length; i++) {
    const s = sectionsDe[i]!;
    const titleCtx = `Section title for "${productTitle}" (${productHandle}), section ${i + 1}/${sectionsDe.length}`;
    const textCtx = `Section body for "${productTitle}" (${productHandle}), section heading: "${s.title}"`;

    const titleRes = await cachedTranslate(s.title, titleCtx);
    if (titleRes.cacheHit) cacheHits++; else calls++;

    const textRes = await cachedTranslate(s.text, textCtx);
    if (textRes.cacheHit) cacheHits++; else calls++;

    // HTML: only translate if it diverges meaningfully from the plain text (i.e.
    // contains tags). Otherwise reuse the text translation wrapped in <p>. This
    // avoids expensive, brittle HTML-preserving calls for ~30% of sections that
    // are basically `<p>${text}</p>`.
    const htmlIsRich = /<(div|ul|ol|li|h[1-6]|table|tr|td|strong|em|br|img)/i.test(s.html);
    let htmlEn: string;
    if (htmlIsRich) {
      const htmlRes = await cachedTranslate(s.html, textCtx + ' (HTML)');
      if (htmlRes.cacheHit) cacheHits++; else calls++;
      htmlEn = htmlRes.en;
    } else {
      htmlEn = `<p>${textRes.en.replace(/\n/g, '<br/>')}</p>`;
    }

    out.push({
      title: titleRes.en,
      text: textRes.en,
      html: htmlEn,
      source: s.source,
      titleDe: s.title,
      textDe: s.text,
    });
  }
  return { sectionsEn: out, cacheHits, calls };
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

  console.log(`[translate-sections] store=${cli.store} domain=${domain} dryRun=${cli.dryRun} force=${cli.force} limit=${cli.limit ?? '∞'}`);

  const products = await listProductsWithSections(endpoint, token);
  let scope = products.filter((p) => p.sectionsDe?.value);
  if (cli.handle) scope = scope.filter((p) => p.handle === cli.handle);
  if (cli.limit != null) scope = scope.slice(0, cli.limit);

  console.log(`[translate-sections] ${scope.length} product(s) in scope (of ${products.length} total, ${products.filter((p) => p.sectionsDe?.value).length} with sections_de)`);

  let totalCalls = 0;
  let totalCacheHits = 0;
  let totalProductsTranslated = 0;
  let totalProductsSkipped = 0;
  const errors: Array<{ handle: string; message: string }> = [];

  for (let i = 0; i < scope.length; i++) {
    const p = scope[i]!;
    const prefix = `[${i + 1}/${scope.length}] ${p.handle}`;
    if (!cli.force && p.sectionsEn?.value) {
      console.log(`${prefix} — skip (sections_en already present, use --force to overwrite)`);
      totalProductsSkipped++;
      continue;
    }

    let sectionsDe: ScraperSection[];
    try {
      sectionsDe = JSON.parse(p.sectionsDe!.value) as ScraperSection[];
    } catch (err) {
      console.warn(`${prefix} — sections_de parse error, skipping: ${(err as Error).message}`);
      errors.push({ handle: p.handle, message: `parse_error: ${(err as Error).message}` });
      continue;
    }
    if (sectionsDe.length === 0) {
      console.log(`${prefix} — empty sections_de, skipping`);
      continue;
    }

    try {
      const { sectionsEn, cacheHits, calls } = await translateProductSections(p.handle, p.title, sectionsDe);
      totalCalls += calls;
      totalCacheHits += cacheHits;
      console.log(`${prefix} — ${sectionsDe.length} sections, ${calls} translated, ${cacheHits} cached`);

      if (!cli.dryRun) {
        await setSectionsEn(endpoint, token, p.id, JSON.stringify(sectionsEn));
        totalProductsTranslated++;
      }
    } catch (err) {
      console.error(`${prefix} — error: ${(err as Error).message}`);
      errors.push({ handle: p.handle, message: (err as Error).message });
    }
  }

  console.log(`\n[translate-sections] done.`);
  console.log(`  products translated: ${totalProductsTranslated}`);
  console.log(`  products skipped (already had EN): ${totalProductsSkipped}`);
  console.log(`  total Claude calls: ${totalCalls}`);
  console.log(`  total cache hits: ${totalCacheHits}`);
  if (errors.length > 0) {
    console.log(`  errors (${errors.length}):`);
    for (const e of errors) console.log(`    - ${e.handle}: ${e.message}`);
  }
}

import { fileURLToPath } from 'node:url';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
