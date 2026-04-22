# agent/scripts

One-off maintenance scripts for the Shopify dev/prod stores. Run from the repo
root so relative paths (`.env.local`) resolve correctly.

## `create-metaobjects.mjs`

Creates every metaobject and metafield definition documented in
`docs/metafields.md` on the Shopify dev store. Idempotent and safe to re-run —
each definition is checked via the Admin GraphQL API before being created, and
already-existing definitions are skipped.

### Prerequisites

- Node.js 18+ (uses the native `fetch`).
- `.env.local` at the repo root containing:
  ```env
  SHOPIFY_DEV_STORE=heater-dev.myshopify.com
  SHOPIFY_DEV_ADMIN_TOKEN=shpat_xxx...
  ```
  The admin token must hold `write_metaobject_definitions` and
  `write_metafield_definitions` scopes (read scopes are implied).

### Run

```bash
# from repo root
node agent/scripts/create-metaobjects.mjs
```

Expected output (first run):

```
→ Syncing custom-data definitions on heater-dev.myshopify.com (Admin API 2026-04)
[create] metaobject:testimonial → gid://shopify/MetaobjectDefinition/123
[create] metaobject:trust_badge → gid://shopify/MetaobjectDefinition/124
...
[create] metafield:product.custom.spec_sections → gid://shopify/MetafieldDefinition/555
...
Done. created: 18, skipped: 0
```

On subsequent runs with no schema changes every line becomes `[skip] …` and
the summary reads `created: 0, skipped: 18`.

### Behavior / guarantees

- **Idempotent.** Uses `metaobjectDefinitionByType` and `metafieldDefinitions`
  to detect pre-existing definitions. Existing definitions are never modified
  or deleted.
- **Two-pass.** Metaobject definitions are created first; their GIDs are then
  injected into `product.custom.spec_sections` as a
  `metaobject_definition_id` validation so the list reference is strongly
  typed.
- **Pinned.** All product/collection metafields are created with `pin: true`
  so they appear by default in the Admin product editor.
- **Storefront-exposed.** All definitions are created with
  `access.storefront = PUBLIC_READ` so the theme can render their values.
- **Exits 0** on success with a `created / skipped` summary, **exits 1** on
  any fatal error (HTTP, GraphQL, or `userErrors`).

### When the schema changes

1. Edit `docs/metafields.md` first — it is the source of truth.
2. Mirror the change in the `METAOBJECT_DEFS`, `buildProductMetafieldDefs`,
   or `COLLECTION_METAFIELD_DEFS` arrays in `create-metaobjects.mjs`.
3. Re-run the script. Only new definitions will be created.
4. Edits/deletes to existing definitions are intentionally out of scope — do
   those in Shopify Admin (Settings → Custom data) or add an explicit
   migration script.
