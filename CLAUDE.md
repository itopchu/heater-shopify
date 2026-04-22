# heater-shopify — Project Instructions

Bilingual (DE primary, EN secondary) Shopify storefront for a heater/radiator B2C brand, inspired by xxl-heizung.de. Plus a local Claude Agent SDK dev agent to help build and maintain it.

**Approved plan:** `C:\Users\mribr\.claude\plans\i-want-to-replicate-mossy-wadler.md` — read before making architectural decisions.

## Non-negotiable principles

1. **Design can be better than xxl-heizung.de.** It is inspiration, not a pixel target. Keep info architecture + trust signals; improve typography, whitespace, interaction detail.
2. **Quality and performance outrank speed.** Lighthouse ≥ 95 perf/a11y/SEO on home + PDP + PLP (throttled mobile). LCP < 2.5s, INP < 200ms, CLS < 0.1. No shortcuts traded for faster delivery.
3. **Everything merchant-editable in Shopify Admin.** Zero hard-coded copy, images, or lists in `.liquid` files. Every string/image/list reachable via Theme Editor, section settings, theme settings, metaobjects, metafields, Pages, or Translate & Adapt. Before writing any Liquid literal of user-visible content, answer "where does a merchant change this in Admin?" — if the answer is "edit the file", redesign.
4. **Shopify-native before third-party, free before paid.** Default to Translate & Adapt, Search & Discovery, Customer Privacy API, Shopify Email, Inbox, Forms, Markets, native Product Reviews, native CSV import. Any paid app requires justification logged in `docs/app-decisions.md` with the specific native feature it replaces and why that failed.

## Technology

- **Theme:** Custom OS 2.0, forked from Shopify Dawn. Liquid + JSON templates + metafields/metaobjects.
- **Languages:** DE (primary), EN (secondary) via Translate & Adapt + `locales/*.json`. Language switcher in header via `{% form 'localization' %}`.
- **Market:** single DE market at launch. 19% MwSt inclusive. Prices show `inkl. 19% MwSt, zzgl. Versand`.
- **Payments (via Shopify Payments):** Klarna (Rechnung/Ratenkauf), PayPal, Card, Apple/Google Pay. Sofort is deprecated — do not add. No SEPA Direct Debit.
- **Agent stack:** Claude Agent SDK (Node.js + TypeScript). Runs locally on Windows. Default store = dev. See Part 2 of the plan.

## Repo layout

```
heater-shopify/
├── theme/        Shopify theme (managed by Shopify CLI)
├── agent/        Claude Agent SDK harness
├── data/         Product CSVs + assets for import
├── docs/         metafields.md, legal-checklist.md, app-decisions.md
├── .env.example  Documents required env vars
├── .gitignore
└── CLAUDE.md     This file
```

## Working conventions

- Never hard-code a German or English string a customer will see. Use `{{ 'namespace.key' | t }}` + `locales/de.default.json` / `locales/en.json`, or a section setting, or a metaobject field.
- Every new section includes a full `{% schema %}` block exposing all text, CTAs, images, colors, padding — and block repeaters where content is list-shaped.
- Product-variant content (spec accordions, PDF datasheets, bundles) → metaobjects/metafields on the product, never Liquid branches.
- `shopify theme check` must pass with zero errors before committing.
- Agent work defaults to the dev store. Production mutations require explicit `--store prod` and typed confirmation (see `agent/hooks/pre-tool.ts` once built).
- Secrets live in `.env.local` (gitignored) or Windows Credential Manager. Never commit `.env`.

## Commands

```bash
# Theme dev
shopify theme dev --store=heater-dev.myshopify.com
shopify theme check
shopify theme push --store=heater-dev.myshopify.com
shopify theme pull --store=heater-dev.myshopify.com

# Agent (once Phase 7 scaffolded)
npm run agent -- --store dev "task description"
npm run agent:test     # scope-leak + unit tests
```

## Current phase

Phase 1 — Foundation. See plan for gate criteria.
