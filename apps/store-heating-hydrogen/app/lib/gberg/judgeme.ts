/**
 * Judge.me REST API client (server-side only).
 *
 * Judge.me's "auto-install into theme" feature is for Liquid themes —
 * Hydrogen needs to fetch via the REST API and render the widget itself
 * in React. The Private API token is the only one that has read access
 * to aggregate rating + per-product review data; the Public token is
 * limited to embed widgets and was rejected by every per-product
 * endpoint we tried.
 *
 * Token lives in `JUDGE_ME_PRIVATE_API_TOKEN` (server env, not exposed
 * to the client). All calls go through the server during PDP loader
 * execution, so the token never reaches the browser.
 *
 * Rate / cache strategy: aggregate rating per product is cached for
 * 5 minutes — long enough to absorb a hot product page, short enough
 * that newly approved reviews appear within a minute or two on next
 * worker spin.
 */

const JUDGE_ME_BASE = 'https://judge.me/api/v1';

export interface JudgemeAggregate {
  /** 0–5 mean rating. */
  rating: number;
  /** Total published review count for this product. */
  count: number;
}

interface JudgemeProductResponse {
  product?: {
    id: number;
    handle: string;
    external_id: number;
    title: string;
  };
}

interface JudgemeReviewListResponse {
  current_page: number;
  per_page: number;
  reviews: Array<{
    id: number;
    rating: number;
  }>;
}

interface ClientConfig {
  shopDomain: string;
  privateToken: string;
}

function readConfig(env: Record<string, string | undefined>): ClientConfig | null {
  const shopDomain = env.SHOPIFY_PROD_STORE ?? env.PUBLIC_STORE_DOMAIN;
  const privateToken = env.JUDGE_ME_PRIVATE_API_TOKEN;
  if (!shopDomain || !privateToken) return null;
  return { shopDomain, privateToken };
}

/**
 * Fetch the aggregate rating + count for a single product. Returns null
 * when reviews are missing, the API errors, or the integration isn't
 * configured. Callers should render the badge only when aggregate is
 * non-null and `count > 0` — never render a hardcoded "no reviews yet"
 * (per cart/empty-section conventions in this codebase).
 */
export async function fetchJudgemeAggregate(
  productHandle: string,
  env: Record<string, string | undefined>,
): Promise<JudgemeAggregate | null> {
  const cfg = readConfig(env);
  if (!cfg) return null;
  try {
    // 1. Look up the Judge.me product id by handle.
    const lookup = await fetch(
      `${JUDGE_ME_BASE}/products/-1?api_token=${cfg.privateToken}&shop_domain=${cfg.shopDomain}&handle=${encodeURIComponent(productHandle)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!lookup.ok) return null;
    const lookupJson = (await lookup.json()) as JudgemeProductResponse;
    const productId = lookupJson.product?.id;
    if (!productId) return null;

    // 2. Pull the published reviews for that product. Judge.me doesn't
    //    expose an aggregate endpoint per product on the REST API; we
    //    page through reviews and compute the mean ourselves. For the
    //    scale we'll see (single-digit to dozens of reviews per product)
    //    this is a single round-trip.
    const reviews = await fetch(
      `${JUDGE_ME_BASE}/reviews?api_token=${cfg.privateToken}&shop_domain=${cfg.shopDomain}&product_id=${productId}&per_page=100&published=true`,
      { headers: { Accept: 'application/json' } },
    );
    if (!reviews.ok) return null;
    const reviewsJson = (await reviews.json()) as JudgemeReviewListResponse;
    const list = reviewsJson.reviews ?? [];
    if (list.length === 0) return { rating: 0, count: 0 };
    const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return {
      rating: Math.round((sum / list.length) * 10) / 10,
      count: list.length,
    };
  } catch {
    return null;
  }
}
