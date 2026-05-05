/**
 * Shopify Function entry — bundled by esbuild and compiled to WASM by
 * Javy. The exported `run` function is the WASM-level export named in
 * `function.wit`. Shopify invokes it once per cart-delivery transform;
 * inside, we read the input via the runtime's `ShopifyFunction.readInput`
 * shim, hand it to our typed user function, and write the result back.
 *
 * The shim is provided by Shopify's function runtime when the .wasm runs
 * under their Function infrastructure — at compile time TypeScript only
 * needs the type declaration.
 */
import userFunction from './run';

declare const ShopifyFunction: {
  readInput(): unknown;
  writeOutput(value: unknown): void;
};

export function run(): void {
  const input = ShopifyFunction.readInput() as Parameters<typeof userFunction>[0];
  const output = userFunction(input);
  ShopifyFunction.writeOutput(output);
}
