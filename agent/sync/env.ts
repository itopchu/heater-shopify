/**
 * Env loading + config validation for the sync pipeline.
 * Reads .env.local at repo root (if present) plus any shell-provided vars.
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireDevSafety } from '../src/store-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
dotenvConfig({ path: resolve(REPO_ROOT, '.env.local') });

export interface SyncConfig {
  storeKey: 'dev' | 'prod';
  shopifyStore: string;
  shopifyToken: string;
  shopifyApiVersion: string;
  xxlBaseUrl: string;
  googleApiKey: string | null;
  geminiImageModel: string;
  imageGenCap: number;
  dryRunDefault: boolean;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

interface ParsedStore {
  key: 'dev' | 'prod';
  source: 'cli' | 'env' | 'default';
}

function parseStoreFlag(argv: string[]): ParsedStore {
  const i = argv.indexOf('--store');
  if (i !== -1) {
    const v = argv[i + 1];
    if (v !== 'dev' && v !== 'prod') {
      throw new Error(`--store must be "dev" or "prod" (got ${JSON.stringify(v)})`);
    }
    return { key: v, source: 'cli' };
  }
  const fromEnv = process.env.AGENT_DEFAULT_STORE;
  if (fromEnv === 'dev' || fromEnv === 'prod') {
    return { key: fromEnv, source: 'env' };
  }
  return { key: 'dev', source: 'default' };
}

export function loadConfig(argv: string[] = process.argv.slice(2)): SyncConfig {
  const { key: storeKey, source } = parseStoreFlag(argv);

  // Mirror store-config.ts: silent prod targeting via AGENT_DEFAULT_STORE is forbidden.
  if (source !== 'cli' && storeKey === 'prod') {
    throw new Error(
      'AGENT_DEFAULT_STORE=prod is not allowed. Pass --store prod explicitly to acknowledge production targeting.',
    );
  }

  const suffix = storeKey === 'prod' ? 'PROD' : 'DEV';

  const shopifyStore = requireEnv(`SHOPIFY_${suffix}_STORE`);
  const shopifyToken = requireEnv(`SHOPIFY_${suffix}_ADMIN_TOKEN`);
  requireDevSafety(storeKey, shopifyStore);
  const shopifyApiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
  const xxlBaseUrl = (process.env.XXL_SOURCE_BASE_URL || 'https://xxl-heizung.de').replace(/\/$/, '');
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null;
  const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const imageGenCap = Number(process.env.IMAGE_GEN_CAP || '50');
  const dryRunDefault = process.env.SYNC_DRY_RUN_DEFAULT === '1';

  if (!Number.isFinite(imageGenCap) || imageGenCap < 0) {
    throw new Error(`IMAGE_GEN_CAP must be a non-negative integer (got ${process.env.IMAGE_GEN_CAP})`);
  }

  return {
    storeKey,
    shopifyStore,
    shopifyToken,
    shopifyApiVersion,
    xxlBaseUrl,
    googleApiKey,
    geminiImageModel,
    imageGenCap,
    dryRunDefault,
  };
}
