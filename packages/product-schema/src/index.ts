export * from "./core";
export * from "./heating";

import type { HeatingProduct, UnderwearProduct, FurnitureProduct } from "./heating";

/**
 * Discriminated union over all storefront categories.
 * Only `HeatingProduct` is fully implemented at this stage;
 * the other two are stubs that will be filled when those stores spin up.
 */
export type Product = HeatingProduct | UnderwearProduct | FurnitureProduct;
