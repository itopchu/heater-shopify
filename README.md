# heater-shopify

Bilingual, English-default Shopify storefront for **Havn** — radiators sold across a European multi-country market (DE, BE, ES, AT, NL, extensible). Plus a local Claude Agent SDK dev agent that drives the store through the Admin GraphQL API.

See [CLAUDE.md](CLAUDE.md) for the project charter and non-negotiables.

## Repo layout

```
heater-shopify/
├── theme/                  Shopify theme (Dawn fork). Managed by shopify theme.
├── agent/
│   ├── src/                TypeScript Claude Agent SDK harness.
│   ├── hooks/              Pre-tool guard for prod mutations.
│   └── scripts/            One-shot .mjs scripts for seeding/configuring.
├── data/
│   └── images/             Licensed + AI-rendered product photography.
├── docs/                   metafields, legal checklist, app decisions.
├── .env.example            Required env vars (see also .env.local, gitignored).
├── package.json            npm run agent / agent:test / typecheck.
├── tsconfig.json
└── CLAUDE.md
```

## Quickstart

```bash
npm install
cp .env.example .env.local   # then fill in Shopify tokens
npm run agent:test            # 6-case scope-leak smoke test
npm run agent -- --store dev "ping"
```

## Agent harness

Runs against the Claude Code CLI runtime — no `ANTHROPIC_API_KEY` required if you are on Claude Max.

```bash
npm run agent -- --store dev "ping"            # basic shop info
npm run agent -- --store dev "list products"   # 10 newest products
```

The pre-tool hook at [agent/hooks/pre-tool.ts](agent/hooks/pre-tool.ts) blocks any production mutation unless the caller types `yes mutate prod` interactively.

## One-shot provisioning scripts

All scripts are **idempotent** and operate on the store configured in `.env.local`.

```bash
node agent/scripts/create-metaobjects.mjs         # bootstrap custom data schema
node agent/scripts/seed-sample-data.mjs           # seed testimonials/trust badges
node agent/scripts/seed-products.mjs              # seed 5 Havn products + 5 collections
node agent/scripts/publish-and-configure.mjs      # publish to Online Store, enable DE locale
node agent/scripts/seed-legal-extra.mjs           # /pages/shipping-delivery + /payment-methods
node agent/scripts/configure-phase-6.mjs          # legal pages, menus, WILLKOMMEN discount
node agent/scripts/configure-markets.mjs          # Europe multi-country market (DE/BE/ES/AT/NL)
node agent/scripts/seed-translations.mjs          # register DE translations on active theme
node agent/scripts/attach-product-images-local.mjs # upload data/images/<handle>/* to each product
```

## Theme workflow

The local [theme/](theme/) is a Dawn fork. Shopify CLI manages push/pull:

```bash
shopify theme dev   --store=heater-dev.myshopify.com   # local preview
shopify theme check                                    # must be 0 errors
shopify theme push  --store=heater-dev.myshopify.com   # deploy as new unpublished theme
shopify theme pull  --store=heater-dev.myshopify.com   # pull merchant UI edits
```

> **Important:** the local theme is not live until you `shopify theme push` and promote it to MAIN via Admin → Online Store → Themes. Until then, the dev store serves whatever Shopify installed by default (usually Horizon). `seed-translations.mjs` only matches strings on the currently-active MAIN theme.

## Non-negotiables

- EN-default UI; DE via Translate & Adapt. English is the source of truth.
- Zero hard-coded customer-visible strings in `.liquid` — use locale keys, section settings, or metaobjects.
- Shopify-native / free-first — paid apps need justification in [docs/app-decisions.md](docs/app-decisions.md).
- `shopify theme check` = 0 errors before commit.
- Prod mutations require the typed confirmation phrase. Dev mutations flow freely.

## Outstanding before launch

- Push local theme and promote it to MAIN.
- Remove dev-store password (Admin → Online Store → Preferences) so `onlineStoreUrl` populates.
- Set Shopify WhatsApp phone number in Theme Editor → Settings → WhatsApp chat bubble.
- Drop licensed product photography into `data/images/<handle>/`, run `attach-product-images-local.mjs`.
- Commission real legal text (eRecht24 / IT-Recht Kanzlei) — pages ship with `⚠ Placeholder text` banners.
- Per-country VAT + shipping zones must be set in Admin (2026-04 API does not expose those).
