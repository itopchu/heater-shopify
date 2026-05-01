/**
 * robots.txt — crawl policy for the G-Berg Heizung storefront.
 *
 * Editorial decision (Phase 3, 2026-04-30):
 *   We explicitly ALLOW major AI training and answer-engine crawlers
 *   (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, Applebot-Extended,
 *   anthropic-ai, ChatGPT-User, CCBot). Heating product information is
 *   timeless and factual — getting cited in AI answers is brand-positive,
 *   not a leak. We optimise the crawl surface (sitemap + /llms.txt) to
 *   make their job easy and accurate.
 *
 * Keep in sync with:
 *   - app/routes/[llms.txt].tsx (companion machine-readable index)
 *   - app/routes/($locale).[sitemap.xml].tsx (sitemap index)
 *   - docs/seo-ai-readiness-plan.md §3
 */
import type {Route} from './+types/[robots.txt]';

export function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const body = robotsTxtData({url: url.origin});

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',

      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

function robotsTxtData({url}: {url?: string}) {
  // Always advertise the production sitemap, regardless of which host
  // the request hit (preview workers, custom domains, *.myshopify.dev).
  // Crawlers should always discover the canonical sitemap.
  const sitemapUrl = url
    ? `${url}/sitemap.xml`
    : 'https://www.gberg-heizung.de/sitemap.xml';

  return `
# Sitemap directive must precede user-agent groups so it applies globally.
Sitemap: ${sitemapUrl}

# ---------------------------------------------------------------------------
# AI crawlers — explicit allow.
# Editorial: we want our radiator content in AI training and retrieval.
# Heating info is timeless and citations are good for the brand.
# ---------------------------------------------------------------------------
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: CCBot
Allow: /

User-agent: *
${generalDisallowRules()}

# Google adsbot ignores robots.txt unless specifically named!
User-agent: adsbot-google
Disallow: /cart
Disallow: /account
Disallow: /search
Allow: /search/
Disallow: /search/?*

User-agent: Nutch
Disallow: /

User-agent: AhrefsBot
Crawl-delay: 10
${generalDisallowRules()}

User-agent: AhrefsSiteAudit
Crawl-delay: 10
${generalDisallowRules()}

User-agent: MJ12bot
Crawl-Delay: 10

User-agent: Pinterest
Crawl-delay: 1
`.trim();
}

/**
 * This function generates disallow rules that generally follow what Shopify's
 * Online Store has as defaults for their robots.txt. The Sitemap directive
 * is emitted once at the top of robots.txt rather than per user-agent
 * group — that's where Google and Bing expect it.
 *
 * Notable deviations from the Shopify defaults:
 *   - We DROP `/policies/` from the disallow list. Imprint, privacy, and
 *     terms pages carry indexing value for German e-commerce trust signals
 *     (Impressumspflicht). These should appear in SERPs.
 *   - We ADD `/api/predictive-search` — internal JSON endpoint with no
 *     indexable value, was previously implicitly allowed.
 */
function generalDisallowRules() {
  return `Disallow: /cart
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: /*/collections/*filter*&*filter*
Disallow: /blogs/*+*
Disallow: /blogs/*%2B*
Disallow: /blogs/*%2b*
Disallow: /*/blogs/*+*
Disallow: /*/blogs/*%2B*
Disallow: /*/blogs/*%2b*
Disallow: /api/predictive-search
Disallow: /search
Allow: /search/
Disallow: /search/?*`;
}
