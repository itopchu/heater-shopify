/**
 * Shopify Storefront client wired up for the heating app.
 *
 * Reads env at call site so dev errors are explicit.
 * Returns a shared client instance per Node process.
 */

import {
  createStorefrontClient,
  type StorefrontClient,
} from "@gberg/shopify-client";

let cached: StorefrontClient | null = null;

/**
 * Get the (lazily-initialized) Storefront API client.
 *
 * Throws if SHOPIFY_STOREFRONT_TOKEN is missing — surfacing this loudly is
 * intentional. We never want a silent fallback that ships an unbranded site.
 */
export function getShopifyClient(): StorefrontClient {
  if (cached) return cached;

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION;

  if (!domain) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN is not set. See apps/store-heating/.env.local.example.",
    );
  }
  if (!accessToken) {
    throw new Error(
      "SHOPIFY_STOREFRONT_TOKEN is not set. See apps/store-heating/.env.local.example for how to mint one.",
    );
  }

  cached = createStorefrontClient({
    domain,
    accessToken,
    ...(apiVersion ? { apiVersion } : {}),
  });
  return cached;
}

/** Returns true if env vars are present. Used to render a graceful empty-state. */
export function isShopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_TOKEN);
}
