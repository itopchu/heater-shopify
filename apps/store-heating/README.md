# store-heating

Custom Next.js 15 storefront for the **G-Berg heating** brand. Reads from
`heater-dev.myshopify.com` via the Storefront API.

## Quickstart

```bash
# from the repo root
pnpm install
cp apps/store-heating/.env.local.example apps/store-heating/.env.local
# fill in SHOPIFY_STOREFRONT_TOKEN — see below
pnpm --filter store-heating dev
# open http://localhost:3000  (redirects to /nl)
```

## Required Storefront API token

The Admin API token in the repo `.env.local` does **not** have permission to
mint a Storefront API token automatically (`storefrontAccessTokenCreate`
returns `ACCESS_DENIED`). Create one manually:

1. Open Shopify Admin: `https://heater-dev.myshopify.com/admin`
2. **Settings → Apps and sales channels → Develop apps**
3. If prompted, click **Allow custom app development**
4. **Create an app** — name: `Storefront — store-heating`
5. **Configuration → Storefront API integration → Configure**
6. Enable scopes:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_product_tags`
   - `unauthenticated_read_collection_listings`
   - `unauthenticated_read_metaobjects`
   - `unauthenticated_read_content`
7. **Save → Install app**
8. Copy the **Storefront API access token** (starts with anything, not `shpat_`)
9. Paste into `apps/store-heating/.env.local` as `SHOPIFY_STOREFRONT_TOKEN`

## Routes

| Route | File |
|---|---|
| `/` | `app/page.tsx` (redirects to `/[default-locale]`) |
| `/[locale]` | `app/(storefront)/[locale]/page.tsx` (homepage, 9 sections) |
| `/[locale]/collections/[handle]` | PLP |
| `/[locale]/products/[handle]` | PDP |

Locales: `nl` (default), `de`, `fr`, `en`. Routing scaffolded; translation
content arrives in Phase 4.

## Architecture

- **Server Components by default** — homepage, PLP, PDP, layout shell.
- **Client Components only where state/interaction is needed** — buy-box,
  variant selector, add-to-cart.
- All Shopify reads route through `lib/queries.ts`, which wraps
  `@gberg/shopify-client` with locale → `@inContext` mapping and revalidation
  defaults.

## Workspace dependencies

- `@gberg/ui` — shared headless components (Button, Chip, Breadcrumb, FaqAccordion, SpecsTable)
- `@gberg/theme-tokens` — design tokens + heating brand skin
- `@gberg/shopify-client` — Storefront API GraphQL client (typed)
- `@gberg/product-schema` — TypeScript types + parsers for products/metafields

## Known limits (this scaffold)

- Cart wiring is a placeholder (button stages the request but doesn't mutate Shopify Cart).
- PLP filter sidebar is shells only — real facets land via the search-index agent.
- FAQ resolution from `seo.faq_group` metaobject reference is stubbed; defaults are inlined.
- `media.asset_manifest` document parsing is best-effort; no validation yet.
