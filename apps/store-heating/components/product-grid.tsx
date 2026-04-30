/**
 * Legacy import shim. The canonical product grid now lives at
 * `components/plp/product-grid.tsx` so it can be reused by the PLP, the
 * shop-all `/products` route and the search results page. We keep this
 * file as a re-export so existing imports keep working while the codebase
 * migrates over.
 */
export { ProductGrid, type ProductGridProps } from "./plp/product-grid";
