# heater-shopify

Multi-brand ecommerce platform for **G-Berg GmbH**. The repo combines:

1. A Shopify Liquid theme (Dawn fork) at `theme/`
2. A Claude Agent SDK harness + catalog-sync pipeline at `agent/`
3. A multi-brand Next.js storefront monorepo at `apps/` + `packages/` (this is
   the strategic frontend — the Liquid theme remains as a stopgap)

## Monorepo layout

```
apps/
  store-heating/        # Next.js 15 storefront (heating brand, English-default)
packages/
  shopify-client/       # Typed Storefront API GraphQL client
  product-schema/       # TypeScript types + parsers for products & metafields
  theme-tokens/         # Design tokens (CSS vars + TS exports) + brand skins
  ui/                   # Shared headless components
agent/                  # Claude Agent SDK harness + catalog sync (unchanged)
theme/                  # Shopify Liquid theme (unchanged)
data/, scrapper/, catalog/, docs/, sync-reports/  # data + ops artifacts (unchanged)
```

## Quickstart (Next.js storefront)

```bash
npm install -g pnpm           # if not already installed (>= 10.x)
pnpm install
cp apps/store-heating/.env.local.example apps/store-heating/.env.local
# fill in SHOPIFY_STOREFRONT_TOKEN — see apps/store-heating/README.md
pnpm dev:heating               # starts http://localhost:3000
```

## Workspace scripts

| Script | What it does |
|---|---|
| `pnpm dev:heating` | Start the heating storefront in dev mode |
| `pnpm build:heating` | Production build of the heating storefront |
| `pnpm typecheck` | TypeScript check across all workspace packages + agent |
| `pnpm lint` | Lint across all packages with their own lint scripts |

## Agent / catalog-sync (unchanged)

The Claude Agent SDK harness and the catalog-sync pipeline keep their original
scripts — they continue to be runnable from the repo root:

| Script | What it does |
|---|---|
| `npm run agent` | Start the local Claude Agent SDK harness |
| `npm run sync` | Run the catalog-sync pipeline |
| `npm run sync:dry` | Dry-run the catalog-sync pipeline |

See `CLAUDE.md` for the full project brief, principles and conventions.
