export {
  createStorefrontClient,
  inContextDirective,
  StorefrontApiError,
  type StorefrontClient,
  type StorefrontClientConfig,
  type QueryContext,
} from "./client";

export { getHeatingProductByHandle } from "./queries/product-by-handle";
export {
  getCollectionByHandle,
  getProductsList,
  type CollectionResult,
} from "./queries/collection-by-handle";
export { getMenu, type MenuItem } from "./queries/menu";
export { getPageByHandle, type ShopifyPage } from "./queries/page-by-handle";
export {
  getSearchResults,
  getPredictiveSearch,
  type SearchResult,
  type PredictiveProduct,
  type PredictiveResult,
} from "./queries/search";
export {
  getCollectionsList,
  getAllProducts,
  type CollectionListItem,
  type AllProductsResult,
  type ProductSortKey,
} from "./queries/collections-list";
export {
  getBlogByHandle,
  getAnyBlog,
  type BlogArticle,
  type BlogResult,
} from "./queries/blog";

export * from "./types";
