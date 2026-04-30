/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow rendering Shopify CDN images.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "**.shopify.com" },
    ],
  },
  // Workspace packages need transpilation.
  transpilePackages: [
    "@gberg/ui",
    "@gberg/shopify-client",
    "@gberg/theme-tokens",
    "@gberg/product-schema",
  ],
};

export default nextConfig;
