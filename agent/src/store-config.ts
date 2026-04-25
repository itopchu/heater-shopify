import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: '.env.local' });
loadEnv();

const storeSchema = z.object({
  handle: z.string().min(1),
  token: z.string().min(1),
});

const envSchema = z.object({
  SHOPIFY_DEV_STORE: z.string().optional(),
  SHOPIFY_DEV_ADMIN_TOKEN: z.string().optional(),
  SHOPIFY_PROD_STORE: z.string().optional(),
  SHOPIFY_PROD_ADMIN_TOKEN: z.string().optional(),
  AGENT_DEFAULT_STORE: z.enum(['dev', 'prod']).default('dev'),
  SHOPIFY_API_VERSION: z.string().default('2026-04'),
  AGENT_DEV_DOMAIN_ALLOWLIST: z.string().optional(),
});

export type StoreKey = 'dev' | 'prod';
export type StoreConfig = z.infer<typeof storeSchema> & { key: StoreKey; apiVersion: string };

/**
 * Source of the requested store key.
 *   - 'cli'  : user passed `--store dev|prod` explicitly (acknowledged)
 *   - 'env'  : value came from AGENT_DEFAULT_STORE (silent fallback — extra guards apply)
 *   - 'default': nothing requested at all → defaults to dev
 *
 * Tracking the source lets us reject silent prod targeting via env vars while still
 * allowing legitimate explicit prod runs (`npm run agent -- --store prod ...`).
 */
export type StoreKeySource = 'cli' | 'env' | 'default';

export interface ResolveOptions {
  /** Where the requested key came from. Defaults to 'default' when key is absent, 'cli' when present. */
  source?: StoreKeySource;
}

const env = envSchema.parse(process.env);

const DEFAULT_DEV_SUFFIXES = ['-dev.myshopify.com'];

function getDevAllowlistSuffixes(): string[] {
  const raw = process.env.AGENT_DEV_DOMAIN_ALLOWLIST ?? env.AGENT_DEV_DOMAIN_ALLOWLIST;
  if (!raw || !raw.trim()) return DEFAULT_DEV_SUFFIXES;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Asserts the resolved store domain is consistent with the requested store key.
 *   - dev keys must end with one of the allowlist suffixes (catches a typo'd prod domain in
 *     SHOPIFY_DEV_STORE).
 *   - prod keys must NOT match any dev suffix (catches a swapped/copy-pasted dev domain in
 *     SHOPIFY_PROD_STORE).
 *
 * Override the dev allowlist via `AGENT_DEV_DOMAIN_ALLOWLIST="-dev.myshopify.com,-staging.myshopify.com"`.
 */
export function requireDevSafety(key: StoreKey, handle: string): void {
  const suffixes = getDevAllowlistSuffixes();
  const lower = handle.toLowerCase();
  if (key === 'dev') {
    const ok = suffixes.some((s) => lower.endsWith(s));
    if (!ok) {
      throw new Error(
        `SHOPIFY_DEV_STORE=${handle} does not match the dev allowlist [${suffixes.join(', ')}]; refusing to proceed. To override, add the suffix to AGENT_DEV_DOMAIN_ALLOWLIST.`,
      );
    }
    return;
  }
  // prod
  const looksDev = suffixes.some((s) => lower.endsWith(s));
  if (looksDev) {
    throw new Error(
      `SHOPIFY_PROD_STORE=${handle} looks like a dev domain (matches allowlist [${suffixes.join(', ')}]) — likely a config error.`,
    );
  }
}

export function resolveStore(
  requested?: StoreKey,
  options: ResolveOptions = {},
): StoreConfig {
  const source: StoreKeySource =
    options.source ?? (requested === undefined ? 'default' : 'cli');

  // Read AGENT_DEFAULT_STORE live from process.env so tests (and runtime mutations)
  // see the current value rather than the snapshot captured at module load.
  const liveDefault = process.env.AGENT_DEFAULT_STORE;
  const defaultStore: StoreKey =
    liveDefault === 'prod' ? 'prod' : liveDefault === 'dev' ? 'dev' : env.AGENT_DEFAULT_STORE;

  // If no explicit CLI flag and AGENT_DEFAULT_STORE points at prod, refuse.
  // Production targeting must always be acknowledged by passing --store prod.
  if (source !== 'cli' && defaultStore === 'prod') {
    throw new Error(
      'AGENT_DEFAULT_STORE=prod is not allowed. Pass --store prod explicitly to acknowledge production targeting.',
    );
  }

  const key: StoreKey = requested ?? defaultStore;

  const apiVersion = process.env.SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION;

  if (key === 'prod') {
    const parsed = storeSchema.safeParse({
      handle: process.env.SHOPIFY_PROD_STORE ?? env.SHOPIFY_PROD_STORE,
      token: process.env.SHOPIFY_PROD_ADMIN_TOKEN ?? env.SHOPIFY_PROD_ADMIN_TOKEN,
    });
    if (!parsed.success) {
      throw new Error(
        'Production store not configured. Set SHOPIFY_PROD_STORE and SHOPIFY_PROD_ADMIN_TOKEN in .env.local.',
      );
    }
    requireDevSafety('prod', parsed.data.handle);
    return { ...parsed.data, key, apiVersion };
  }

  const parsed = storeSchema.safeParse({
    handle: process.env.SHOPIFY_DEV_STORE ?? env.SHOPIFY_DEV_STORE,
    token: process.env.SHOPIFY_DEV_ADMIN_TOKEN ?? env.SHOPIFY_DEV_ADMIN_TOKEN,
  });
  if (!parsed.success) {
    throw new Error(
      'Dev store not configured. Set SHOPIFY_DEV_STORE and SHOPIFY_DEV_ADMIN_TOKEN in .env.local.',
    );
  }
  requireDevSafety('dev', parsed.data.handle);
  return { ...parsed.data, key, apiVersion };
}

export function parseStoreFlag(argv: string[]): StoreKey | undefined {
  const idx = argv.indexOf('--store');
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (value !== 'dev' && value !== 'prod') {
    throw new Error(`--store must be "dev" or "prod", got "${value ?? ''}"`);
  }
  return value;
}

export function stripStoreFlag(argv: string[]): string[] {
  const idx = argv.indexOf('--store');
  if (idx === -1) return argv;
  return [...argv.slice(0, idx), ...argv.slice(idx + 2)];
}
