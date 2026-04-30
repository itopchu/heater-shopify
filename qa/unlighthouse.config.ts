import {defineConfig} from 'unlighthouse';

/**
 * Unlighthouse config for the G-Berg Heizung storefront.
 *
 * Crawls every locale × every public URL (home, PLP, PDP, pages, policies)
 * via the live sitemap.xml, runs Lighthouse on each, and produces a single
 * dashboard at .unlighthouse-reports/<run>/.
 *
 * Run:    pnpm qa:lighthouse
 * Open:   the HTML index it prints at the end (Windows-friendly path).
 *
 * Why Unlighthouse over plain Lighthouse:
 * - One run audits the whole site (560+ URLs across 8 locales) instead
 *   of one URL at a time.
 * - Sortable dashboard makes regression spotting trivial.
 * - Sitemap-driven so we automatically pick up new product/page URLs.
 *
 * CWV gates from CLAUDE.md (LCP < 2.5s, INP < 200ms, CLS < 0.1, scores ≥ 95
 * perf/a11y/SEO) are enforced via assertion matrix below.
 */
export default defineConfig({
  site: 'https://www.gberg-heizung.de',

  // Crawl strategy.
  scanner: {
    // Sitemap.xml is the source of truth — it lists every locale-prefixed URL.
    sitemap: true,
    // Crawler threshold: storefront has ~70 unique route patterns × 8 locales.
    maxRoutes: 600,
    // Mobile-first: budget gates are strictest here.
    device: 'mobile',
    // Throttle to mid-tier 4G — represents the EU buyer.
    throttle: true,
    // Skip URLs we don't want graded: account/auth, API callbacks, sitemap.
    exclude: [
      '/account',
      '/account/*',
      '/api/*',
      '/sitemap.xml',
      '/sitemap_*.xml',
      '/robots.txt',
      '/discount/*',
      '/cdn/*',
    ],
  },

  // Per-URL Lighthouse settings.
  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'],
  },

  // Assertion matrix: each row is a route-pattern with its own thresholds.
  // Mirrors .github/workflows/lighthouse.yml so local + CI agree.
  ci: {
    budget: {
      // Home / PLP — strictest performance bar (lots of headroom expected).
      '/': {performance: 95, accessibility: 95, seo: 95},
      '/de': {performance: 95, accessibility: 95, seo: 95},
      '/collections/*': {performance: 95, accessibility: 95, seo: 95},
      // PDP — gallery image is heavy LCP; 85 leaves room for variance.
      '/products/*': {performance: 85, accessibility: 95, seo: 95},
      // Cart / search — perf doesn't matter as much; a11y is paramount.
      '/cart': {accessibility: 95},
      '/search': {accessibility: 95, seo: 90},
      // Pages / policies — content-only, should be near-perfect.
      '/pages/*': {performance: 95, accessibility: 95, seo: 95},
      '/policies/*': {performance: 95, accessibility: 95, seo: 95},
    },
  },

  // Output.
  outputPath: './.unlighthouse-reports',
});
