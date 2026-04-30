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
Disallow: /policies/
Disallow: /search
Allow: /search/
Disallow: /search/?*`;
}
