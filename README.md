# heater-shopify

Bilingual, English-default Shopify storefront for **G-Berg GmbH** (`gberg-heizung`) — authorized regional reseller of xxl-heizung.de, selling heaters/radiators across a European multi-country market (DE, BE, ES, AT, NL, extensible). Plus a local Claude Agent SDK dev agent and an external GitHub Actions catalog-sync pipeline that mirrors xxl-heizung's Shopify-native product data into our store with AI-regenerated imagery.

See [CLAUDE.md](CLAUDE.md) for the project charter and non-negotiables.

## Repo layout

```
heater-shopify/
├── theme/                  Shopify theme (Dawn fork). Managed by shopify theme.
├── agent/
│   ├── src/                TypeScript Claude Agent SDK harness.
│   ├── hooks/              Pre-tool guard for prod mutations.
│   ├── scripts/            One-shot .mjs scripts for seeding/configuring/rebranding.
│   └── sync/               Catalog sync pipeline (fetch → translate → images → diff → write).
├── data/
│   └── images/             AI-generated product photography (populated by sync).
├── docs/                   metafields, legal checklist, app decisions.
├── .github/workflows/sync-catalog.yml   Weekly + manual catalog sync.
├── .env.example            Required env vars (see also .env.local, gitignored).
├── package.json            npm run agent / agent:test / sync / typecheck.
├── tsconfig.json
└── CLAUDE.md
```

## Quickstart

```bash
npm install
cp .env.example .env.local   # fill in Shopify token + image-API key
npm run agent:test            # scope-leak smoke test
npm run agent -- --store dev "ping"
```

## Agent harness

Runs against the Claude Code CLI runtime — no `ANTHROPIC_API_KEY` required if you are on Claude Max.

```bash
npm run agent -- --store dev "ping"            # basic shop info
npm run agent -- --store dev "list products"   # 10 newest products
```

The pre-tool hook at [agent/hooks/pre-tool.ts](agent/hooks/pre-tool.ts) blocks any production mutation unless the caller types `yes mutate prod` interactively.

## Catalog sync pipeline

External, idempotent. Runs weekly on GitHub Actions (`.github/workflows/sync-catalog.yml`) or manually via the Run-workflow button. Can also run locally for dev.

```bash
npm run sync -- --store dev --dry-run --limit 5   # preview diff, no writes
npm run sync -- --store dev --limit 5             # write 5 products to dev store
```

Source: xxl-heizung.de's public Shopify JSON endpoints (`/collections.json`, `/products/{handle}.json`). Images regenerated via Google Gemini (`gemini-2.5-flash-image` / Nano Banana by default, switchable to Pro via `GEMINI_IMAGE_MODEL`) with a lifestyle in-room prompt — xxl-heizung source photos never land in our Shopify Files.

## One-shot provisioning scripts

All scripts are **idempotent** and operate on the store configured in `.env.local`.

```bash
node agent/scripts/rebrand-to-gberg.mjs           # apply G-Berg brand (shop name, theme preview name)
node agent/scripts/delete-havn-catalog.mjs        # wipe placeholder Havn products
node agent/scripts/seed-collections.mjs           # create G-Berg collection tree
node agent/scripts/create-metaobjects.mjs         # bootstrap custom data schema
node agent/scripts/publish-and-configure.mjs      # publish to Online Store, enable DE locale
node agent/scripts/seed-legal-extra.mjs           # /pages/shipping-delivery + /payment-methods
node agent/scripts/configure-phase-6.mjs          # legal pages, menus, welcome discount
node agent/scripts/configure-markets.mjs          # Europe multi-country market (DE/BE/ES/AT/NL)
node agent/scripts/seed-translations.mjs          # register DE translations on active theme
```

## Theme workflow

The local [theme/](theme/) is a Dawn fork. Shopify CLI manages push/pull:

```bash
shopify theme dev   --store=heater-dev.myshopify.com   # local preview
shopify theme check                                    # must be 0 errors
shopify theme push  --store=heater-dev.myshopify.com   # deploy as new unpublished theme
shopify theme pull  --store=heater-dev.myshopify.com   # pull merchant UI edits
```

> **Note:** the local theme is not live until you `shopify theme push` and promote it to MAIN via Admin → Online Store → Themes. Until then, the dev store serves whatever Shopify installed by default. `seed-translations.mjs` only matches strings on the currently-active MAIN theme.

## Non-negotiables

- EN-default UI; DE via Translate & Adapt. English is the source of truth.
- Zero hard-coded customer-visible strings in `.liquid` — use locale keys, section settings, or metaobjects.
- Shopify-native / free-first — paid apps need justification in [docs/app-decisions.md](docs/app-decisions.md).
- `shopify theme check` = 0 errors before commit.
- Prod mutations require the typed confirmation phrase. Dev mutations flow freely.
- No xxl-heizung source photos in Shopify Files. Ever.

## Outstanding before launch

- Provision production store (deferred; dev-only currently).
- Supply G-Berg GmbH legal details for Impressum (address, HRB, VAT ID, managing director).
- Supply G-Berg logo artwork (text-only placeholder in Theme Editor until then).
- Commission real legal text (eRecht24 / IT-Recht Kanzlei) — pages ship with `⚠ Placeholder text` banners.
- Confirm Shopify WhatsApp phone number in Theme Editor → Settings.
- Wire `SHOPIFY_DEV_ADMIN_TOKEN` + `GOOGLE_API_KEY` as GitHub Actions secrets before first CI sync run.
