# heater-shopify — Project Instructions

English-default Shopify storefront for **G-Berg GmbH** (`gberg-heizung`) — authorized regional reseller of xxl-heizung.de, selling heaters/radiators across a European multi-country market (Germany, Belgium, Spain, Austria, Netherlands, + others). Bilingual UI (EN default, DE secondary via Translate & Adapt); more EU languages added over time. Plus a local Claude Agent SDK dev agent + an external automated catalog-sync pipeline that mirrors xxl-heizung's Shopify-native product data into our store with AI-regenerated imagery.

**Approved plans (read before architectural decisions):**
- `C:\Users\mribr\.claude\plans\i-want-to-replicate-mossy-wadler.md` — foundational build (Phases 1–10)
- `C:\Users\mribr\.claude\plans\i-need-you-to-hashed-kitten.md` — G-Berg re-scope: rebrand, catalog-sync pipeline, AI image regen (active)

## Non-negotiable principles

1. **Design can be better than xxl-heizung.de.** It is the catalog source and IA inspiration, not a pixel target. Keep info architecture + trust signals; improve typography, whitespace, interaction detail.
2. **Quality and performance outrank speed.** Lighthouse ≥ 95 perf/a11y/SEO on home + PDP + PLP (throttled mobile). LCP < 2.5s, INP < 200ms, CLS < 0.1. No shortcuts traded for faster delivery.
3. **Everything merchant-editable in Shopify Admin.** Zero hard-coded copy, images, or lists in `.liquid` files. Every string/image/list reachable via Theme Editor, section settings, theme settings, metaobjects, metafields, Pages, or Translate & Adapt. Before writing any Liquid literal of user-visible content, answer "where does a merchant change this in Admin?" — if the answer is "edit the file", redesign.
4. **Shopify-native before third-party, free before paid.** Default to Translate & Adapt, Search & Discovery, Customer Privacy API, Shopify Email, Inbox, Forms, Markets, native Product Reviews, native CSV import. Any paid app requires justification logged in `docs/app-decisions.md` with the specific native feature it replaces and why that failed.
5. **No xxl-heizung photos ever land in our store.** Catalog text is licensed (user-attested written permission). Product images are regenerated via a paid AI image API with a lifestyle/in-room prompt template. The sync pipeline never downloads xxl source images into Shopify Files.

## Brand

- **Company:** G-Berg GmbH
- **Storefront brand:** G-Berg (slug: `gberg-heizung`)
- **Palette:** Primary red `#C8102E`, dark red `#8A0B1F`, white, near-black `#111111`.
- **Fonts:** Inter (body) + Fraunces (display/headings). Merchant-editable in Theme Editor.

## Technology

- **Theme:** Custom OS 2.0, forked from Shopify Dawn. Liquid + JSON templates + metafields/metaobjects.
- **Languages:** EN (default), DE (secondary) via Translate & Adapt + `locales/*.json`. Additional EU languages added as new markets open. Language switcher in header via `{% form 'localization' %}`.
- **Market:** single "Europe" Shopify Market covering Germany, Belgium, Spain, Austria, Netherlands, and other EU countries (extensible list). Currency EUR. Per-country VAT: DE 19%, BE 21%, ES 21%, etc. Prices inclusive of local VAT; show `incl. VAT, excl. shipping` in EN and localized equivalents per locale.
- **Payments (via Shopify Payments):** Klarna (availability varies per country), PayPal, Card, Apple/Google Pay. Sofort is deprecated — do not add. No SEPA Direct Debit.
- **Agent stack:** Claude Agent SDK (Node.js + TypeScript). Runs locally on Windows. Default store = dev. **Authenticates via the Claude Code CLI runtime, which uses the user's Claude Max subscription — no ANTHROPIC_API_KEY required.** Never suggest switching to API-key billing without being asked.
- **Catalog sync:** external GitHub Actions cron (weekly + manual trigger) pulls xxl-heizung.de's public Shopify JSON (`/collections.json`, `/products/{handle}.json`), diffs against our store, upserts via Admin GraphQL. AI image regen via Google Gemini (`gemini-2.5-flash-image` / Nano Banana by default, Pro available via env) with a lifestyle prompt. See `agent/sync/` and `.github/workflows/sync-catalog.yml`.

## Repo layout

```
heater-shopify/
├── theme/        Shopify theme (managed by Shopify CLI)
├── agent/
│   ├── src/      Claude Agent SDK harness
│   ├── scripts/  One-shot ops scripts (rebrand, seed, configure)
│   ├── sync/     Catalog sync pipeline (fetch → translate → images → diff → write)
│   └── hooks/    Pre-tool safety hooks
├── data/         Product CSVs + assets for import
├── docs/         metafields.md, legal-checklist.md, app-decisions.md
├── .github/workflows/sync-catalog.yml
├── .env.example  Documents required env vars
├── .gitignore
└── CLAUDE.md     This file
```

## Working conventions

- Never hard-code a customer-visible string in Liquid. Use `{{ 'namespace.key' | t }}` + `locales/en.default.json` / `locales/de.json`, or a section setting (translated via Translate & Adapt), or a metaobject field.
- Every new section includes a full `{% schema %}` block exposing all text, CTAs, images, colors, padding — and block repeaters where content is list-shaped.
- Product-variant content (spec accordions, PDF datasheets, bundles) → metaobjects/metafields on the product, never Liquid branches.
- `shopify theme check` must pass with zero errors before committing.
- Agent work defaults to the dev store. Production mutations require explicit `--store prod` and typed confirmation (see `agent/hooks/pre-tool.ts`).
- Catalog-sync writes run in CI only (GitHub Actions), never on dev machines, to avoid local-state drift.
- Secrets live in `.env.local` (gitignored), GitHub repo secrets (for CI), or Windows Credential Manager. Never commit `.env`.

## Commands

```bash
# Theme dev
shopify theme dev --store=heater-dev.myshopify.com
shopify theme check
shopify theme push --store=heater-dev.myshopify.com
shopify theme pull --store=heater-dev.myshopify.com

# Agent
npm run agent -- --store dev "task description"
npm run agent:test            # scope-leak + unit tests

# Catalog sync (run via GitHub Actions in prod; locally for dev)
npm run sync -- --store dev --dry-run --limit 5   # preview diff, no writes
npm run sync -- --store dev --limit 5             # write 5 products to dev store
```

## Current phase

G-Berg re-scope in progress. Phase A (rebrand Havn → G-Berg) active. See `i-need-you-to-hashed-kitten.md` for phase gates.
