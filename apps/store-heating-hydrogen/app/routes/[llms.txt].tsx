/**
 * /llms.txt — machine-readable content index for AI crawlers and answer
 * engines, per the emerging Anthropic / Cloudflare / Vercel convention.
 *
 * Served at the ROOT (no `($locale)` prefix) — the convention specifies a
 * single canonical URL per origin. Returned as `text/plain`; the body is
 * Markdown-shaped but plain-text-served so any agent can ingest it without
 * negotiating content type.
 *
 * Anti-AI-confounding hygiene audit (Phase 3.5 — kept here so future
 * maintainers can see the assessment in source):
 *   PASS — Price renders server-side via the PDP loader → BuyBox; no
 *          JS-only "loading…" placeholder for crawlers.
 *   PASS — `withPrivacyBanner: false` in root.tsx; no cookie banner is
 *          mounted today, so nothing blocks the body for crawlers.
 *          When/if enabled later, the banner must be a fixed overlay
 *          (not a render gate).
 *   PASS — PLP uses cursor pagination, not infinite scroll.
 *   PASS — PDP `<details>` accordions render closed-by-default content
 *          inside the DOM regardless of `open` state.
 *
 * Keep in sync with:
 *   - app/routes/[robots.txt].tsx (allow-list of AI crawlers)
 *   - app/routes/($locale).[sitemap.xml].tsx (the sitemap index)
 */
import type {Route} from './+types/[llms.txt]';
import {createGbergClient} from '~/lib/storefront.server';
import {fetchAllProducts} from '~/lib/gberg/queries';

const PRIMARY_HOST = 'https://www.gberg-heizung.de';
const BRAND_TAGLINE =
  'Premium European radiators. Engineered in Germany, delivered EU-wide.';

/**
 * Footer / policy pages we expose at the root locale (`/en/...`). These are
 * the canonical targets — locale-prefixed mirrors are emitted via hreflang
 * in each page's <head>, the AI index just needs one entry per page.
 */
const POLICY_PAGES: ReadonlyArray<{label: string; path: string}> = [
  {label: 'Imprint', path: '/en/pages/imprint'},
  {label: 'Privacy', path: '/en/policies/privacy-policy'},
  {label: 'Terms of service', path: '/en/policies/terms-of-service'},
  {label: 'Shipping', path: '/en/policies/shipping-policy'},
  {label: 'Refund policy', path: '/en/policies/refund-policy'},
  {label: 'Contact', path: '/en/pages/contact'},
];

export async function loader({context, request}: Route.LoaderArgs) {
  const requestOrigin = new URL(request.url).origin;
  // Always cite the production canonical for sitemap / page links so AI
  // crawlers ingesting a preview origin don't index preview URLs.
  const sitemapUrl = `${PRIMARY_HOST}/sitemap.xml`;

  const client = createGbergClient(context.storefront);
  // 200 covers the 55-product catalog with headroom; pagination is unused
  // here because /llms.txt is a flat index, not a paged feed.
  const result = await fetchAllProducts(client, 'en', {
    first: 200,
    sortKey: 'BEST_SELLING',
  }).catch(() => ({products: [], pageInfo: {hasNextPage: false, endCursor: null}}));

  const productLines = result.products
    .filter((p) => Boolean(p.handle && p.title))
    .map((p) => {
      const url = `${PRIMARY_HOST}/en/products/${p.handle}`;
      // Prefer the merchant-curated subtitle / short description for a
      // single-line factual blurb; fall back to title-only when missing.
      const blurb =
        p.common.custom?.subtitle ||
        p.common.custom?.short_description ||
        '';
      const cleanBlurb = blurb.replace(/\s+/g, ' ').trim();
      return cleanBlurb
        ? `- [${p.title}](${url}) — ${cleanBlurb}`
        : `- [${p.title}](${url})`;
    });

  const policyLines = POLICY_PAGES.map(
    (p) => `- [${p.label}](${PRIMARY_HOST}${p.path})`,
  );

  const body = [
    '# G-Berg Heizung',
    '',
    `> ${BRAND_TAGLINE}`,
    '',
    '## About',
    '',
    'G-Berg GmbH is an authorised European reseller of premium hydronic and electric radiators, designed in Germany and shipped across the EU. The catalog covers living-room panel radiators, towel/bath radiators, electric towel rails, replacement radiators, underfloor-heating components, and accessories. Every product carries CE certification and EN 442 heat-output ratings.',
    '',
    '## Products',
    '',
    productLines.length > 0 ? productLines.join('\n') : '_(catalog unavailable)_',
    '',
    '## Pages',
    '',
    policyLines.join('\n'),
    '',
    '## Sitemap',
    '',
    `- ${sitemapUrl}`,
    '',
    '## Canonical origin',
    '',
    `- ${PRIMARY_HOST}`,
    requestOrigin !== PRIMARY_HOST ? `- (request received via ${requestOrigin})` : '',
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // 1h cache: catalog sync runs weekly, so an hourly revalidation
      // window is plenty of freshness with negligible origin load.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
