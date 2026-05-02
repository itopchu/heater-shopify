// Plain-JS Unlighthouse config (no defineConfig import — runs under pnpm dlx).
// See qa/unlighthouse.config.ts for the typed reference version.
//
// Run: pnpm dlx unlighthouse --config-file qa/unlighthouse.config.js

export default {
  site: 'https://www.gberg-heizung.de',

  scanner: {
    sitemap: true,
    maxRoutes: 600,
    device: 'mobile',
    throttle: true,
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

  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'],
  },

  outputPath: './.unlighthouse-reports',
};
