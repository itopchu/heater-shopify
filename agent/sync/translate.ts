/**
 * DE → EN translation for normalized products.
 *
 * Uses the Claude Agent SDK's query() — same auth path as the main agent
 * harness (Claude Code CLI / Claude Max). No Anthropic API key required
 * when run via the CLI; CI runs can fall back to ANTHROPIC_API_KEY if set.
 *
 * Caches translations on disk keyed by sha256(DE source) so unchanged copy
 * is never re-translated on subsequent runs.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { query } from '@anthropic-ai/claude-agent-sdk';

import type { NormalizedProduct } from './types.js';

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

async function translateViaClaude(deText: string, context: string): Promise<string> {
  const systemPrompt = `You are a professional DE→EN product-copy translator for an e-commerce heater/radiator retailer.
Translate the German source text to idiomatic, concise, customer-facing British English.
Preserve HTML tags, markdown, and any technical units (mm, cm, W, °C) exactly.
Do not add explanations. Output only the translation.`;

  const userPrompt = `Context: ${context}

--- DE source ---
${deText}`;

  const stream = query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      maxTurns: 1,
      permissionMode: 'bypassPermissions' as const,
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

export interface TranslateResult {
  titleEn: string;
  bodyHtmlEn: string;
  cacheHitTitle: boolean;
  cacheHitBody: boolean;
}

export async function translateProduct(p: NormalizedProduct): Promise<TranslateResult> {
  ensureCacheDir();

  const titleKey = cacheKey(`title:${p.titleDe}`);
  const bodyKey = cacheKey(`body:${p.bodyHtmlDe}`);

  let titleEn = p.titleDe.trim() ? readCache(titleKey) : '';
  const cacheHitTitle = titleEn != null;
  if (titleEn == null || (titleEn === '' && p.titleDe.trim())) {
    titleEn = await translateViaClaude(p.titleDe, `Product title (handle: ${p.xxlHandle})`);
    writeCache(titleKey, titleEn);
  }

  // Short-circuit empty body — Claude returns chatty refusals when given an
  // empty string, which would poison the product description.
  let bodyHtmlEn: string | null;
  let cacheHitBody: boolean;
  if (!p.bodyHtmlDe.trim()) {
    bodyHtmlEn = '';
    cacheHitBody = true;
  } else {
    bodyHtmlEn = readCache(bodyKey);
    cacheHitBody = bodyHtmlEn != null;
    if (!bodyHtmlEn) {
      bodyHtmlEn = await translateViaClaude(
        p.bodyHtmlDe,
        `Product description HTML (handle: ${p.xxlHandle}, title: "${titleEn}"). Keep HTML tags intact.`,
      );
      writeCache(bodyKey, bodyHtmlEn);
    }
  }

  return { titleEn: titleEn ?? '', bodyHtmlEn, cacheHitTitle, cacheHitBody };
}
