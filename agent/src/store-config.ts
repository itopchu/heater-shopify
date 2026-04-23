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
});

export type StoreKey = 'dev' | 'prod';
export type StoreConfig = z.infer<typeof storeSchema> & { key: StoreKey; apiVersion: string };

const env = envSchema.parse(process.env);

export function resolveStore(requested?: StoreKey): StoreConfig {
  const key = requested ?? env.AGENT_DEFAULT_STORE;

  if (key === 'prod') {
    const parsed = storeSchema.safeParse({
      handle: env.SHOPIFY_PROD_STORE,
      token: env.SHOPIFY_PROD_ADMIN_TOKEN,
    });
    if (!parsed.success) {
      throw new Error(
        'Production store not configured. Set SHOPIFY_PROD_STORE and SHOPIFY_PROD_ADMIN_TOKEN in .env.local.',
      );
    }
    return { ...parsed.data, key, apiVersion: env.SHOPIFY_API_VERSION };
  }

  const parsed = storeSchema.safeParse({
    handle: env.SHOPIFY_DEV_STORE,
    token: env.SHOPIFY_DEV_ADMIN_TOKEN,
  });
  if (!parsed.success) {
    throw new Error(
      'Dev store not configured. Set SHOPIFY_DEV_STORE and SHOPIFY_DEV_ADMIN_TOKEN in .env.local.',
    );
  }
  return { ...parsed.data, key, apiVersion: env.SHOPIFY_API_VERSION };
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
