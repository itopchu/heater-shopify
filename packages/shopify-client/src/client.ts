/**
 * Minimal Shopify Storefront API GraphQL client.
 * - No third-party deps (no Apollo / urql).
 * - `query<T>(gql, variables)` returns typed results.
 * - Locale/market context is propagated via the `@inContext` directive.
 *
 * Spec ref: shop/09_storefront_api_query_plan.md.
 */

export interface StorefrontClientConfig {
  domain: string;
  accessToken: string;
  /** Storefront API version, e.g. "2024-10". Defaults to a stable recent version. */
  apiVersion?: string;
  /** Optional fetch implementation (Next.js can patch this with caching options). */
  fetchImpl?: typeof fetch;
}

export interface QueryContext {
  /** ISO country code, e.g. "DE", "NL". Maps to `@inContext(country:)`. */
  country?: string;
  /** Language code, e.g. "EN", "DE", "NL". Maps to `@inContext(language:)`. */
  language?: string;
  /**
   * Next.js-specific cache hints. Forwarded into fetch options when the runtime
   * supports it. Safe to omit in non-Next environments.
   */
  next?: { revalidate?: number | false; tags?: string[] };
  /** Force a no-cache fetch. */
  cache?: RequestCache;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown; extensions?: unknown }>;
}

export class StorefrontApiError extends Error {
  readonly status: number;
  readonly errors?: GraphQLResponse<unknown>["errors"];
  constructor(message: string, status: number, errors?: GraphQLResponse<unknown>["errors"]) {
    super(message);
    this.name = "StorefrontApiError";
    this.status = status;
    this.errors = errors;
  }
}

export interface StorefrontClient {
  query<T>(gql: string, variables?: Record<string, unknown>, context?: QueryContext): Promise<T>;
  domain: string;
  apiVersion: string;
}

const DEFAULT_API_VERSION = "2024-10";

export function createStorefrontClient(config: StorefrontClientConfig): StorefrontClient {
  const { domain, accessToken } = config;
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!domain) throw new Error("createStorefrontClient: `domain` is required.");
  if (!accessToken) throw new Error("createStorefrontClient: `accessToken` is required.");

  const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;

  async function query<T>(
    gql: string,
    variables: Record<string, unknown> = {},
    context: QueryContext = {},
  ): Promise<T> {
    const init: RequestInit & { next?: QueryContext["next"] } = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": accessToken,
        Accept: "application/json",
      },
      body: JSON.stringify({ query: gql, variables }),
    };

    if (context.cache) init.cache = context.cache;
    if (context.next) init.next = context.next;

    const res = await fetchImpl(endpoint, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new StorefrontApiError(
        `Storefront API HTTP ${res.status}: ${body.slice(0, 200)}`,
        res.status,
      );
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors?.length) {
      throw new StorefrontApiError(
        `Storefront API GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
        200,
        json.errors,
      );
    }

    if (!json.data) {
      throw new StorefrontApiError("Storefront API returned no data.", 200);
    }
    return json.data;
  }

  return { query, domain, apiVersion };
}

/**
 * Build the `@inContext(country: $country, language: $language)` directive snippet.
 * Returns "" if neither is set, so it can be inlined unconditionally.
 */
export function inContextDirective(ctx: QueryContext | undefined): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.country) parts.push(`country: ${ctx.country.toUpperCase()}`);
  if (ctx.language) parts.push(`language: ${ctx.language.toUpperCase()}`);
  if (parts.length === 0) return "";
  return `@inContext(${parts.join(", ")})`;
}
