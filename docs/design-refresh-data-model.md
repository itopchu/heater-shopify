# Design Refresh — Data Model (April 2026)

Single-page reference for the metafields and metaobjects the new sections rely on. Pair with `docs/design-refresh-plan.md` (audit + section list) and `docs/metafields.md` (full schema).

## Scope

The April 2026 design refresh adds three storefront surfaces that need new or reused custom data:

1. **Product card** (`theme/snippets/card-product.liquid`) — series eyebrow + wattage chip + spec preview.
2. **PDP structured spec block** (`theme/sections/main-product.liquid`) — kW chip, energy class badge, room coverage, warranty, dimensions, install difficulty, connection type.
3. **Header trust bar** (new `theme/sections/header-trust-bar.liquid`, owned by Track A) — three trust marks above the announcement bar.

Track A (Liquid) and Track C (CSS) consume this data model. Track B (this track) only defines and documents it.

## Product → PDP spec block

The PDP spec block renders one row per metafield, in this order:

| Spec row | Source field | Type | Render hint |
|---|---|---|---|
| Power chip (top of block) | `specs.wattage_w` | number_integer | "{N} W" — convert to kW for display when ≥ 1000 |
| Energy class badge | `specs.energy_class` | single_line_text (enum) | EU-style colored band |
| Room coverage | `specs.room_coverage_m2` | number_decimal | "Heats rooms up to {N} m²" |
| Dimensions | `specs.dimensions_w_h_d_mm` | single_line_text | Display string, e.g. "600 × 1800 × 90 mm" |
| Connection type | `specs.connection_type` | single_line_text (free text — existing) | Render value as-is, capitalize |
| Installation | `specs.installation_difficulty` | single_line_text (enum) | Map to icon: easy → DIY, standard → wrench, professional → installer |
| Warranty | `custom.warranty_years` | number_integer | "{N}-year manufacturer warranty" |
| Heat output 75/65/20 | `specs.heat_output_75_65_20` (existing) | number_decimal | Optional — shown when set |
| Heat pump compatible | `specs.heat_pump_compatible` (existing) | boolean | Optional badge — shown when true |
| Mounting kit included | `specs.mounting_kit_included` (existing) | boolean | "Mounting kit included" |
| Material | `specs.material` (existing) | single_line_text | Optional |
| Color | `specs.color` (existing) | single_line_text | Optional |
| Datasheet PDF | `media.primary_pdf_url` (existing) | single_line_text | Download CTA |

The block is one Liquid snippet (Track A scope) iterating a fixed render list — no merchant-editable row order in this iteration. If row reordering becomes a requirement, escalate to a `pdp_spec_block` metaobject.

## Product → product card

The card renders the following from metafields:

| Card slot | Source field | Type | Render hint |
|---|---|---|---|
| Eyebrow above title | `custom.series` | single_line_text | Uppercase, Inter 500, letter-spacing 0.08em |
| Top-right chip | `specs.wattage_w` | number_integer | "{N}W" — pill, white-on-charcoal |
| Color swatches | `product.options_with_values` (variant `option1` = color) | native | 3-dot row; Track A wires; no metafield needed |
| Spec preview line | `specs.width_mm` × `specs.height_mm` (existing, both pinned) | number_integer | Compose "{w} × {h} mm" client-side |

`custom.series` is the only new field for the card grid. Wattage already had numeric fields elsewhere — `specs.wattage_w` formalizes it as the canonical wattage source (vs the legacy `custom.wattage` from `docs/metafields.md` v1, which is still defined but no longer the source of truth — backfill with `agent/scripts/build-catalog-driven-products.mjs` to bring `specs.wattage_w` into sync with the legacy field, then deprecate the legacy one in a later cleanup).

## Header trust bar → `usp_item` metaobject (reused)

```
usp_item                       header-trust-bar.liquid (Track A)
├─ icon (file_reference)  ───▶ <img class="trust-bar__icon" />
├─ label (single_line)    ───▶ <span class="trust-bar__label" />
└─ body  (multi_line)     ───▶ <span class="trust-bar__body" />  (optional, hidden on narrow viewports)
```

Section settings (Track A scope, listed here for handoff):

- `trust_mark_1`, `trust_mark_2`, `trust_mark_3` — `metaobject_reference` pickers, validation to `usp_item`.
- `link_target_blank` — boolean (open trust mark links in new tab).

No new metaobject. Rationale in `docs/metafields.md` § Header trust bar.

## PDP / homepage trust strip → `trust_badge` metaobject (existing, untouched)

The `trust_badge` metaobject (`label`, `body`, `icon`, `link`) continues to drive the existing `theme/sections/trust-badges.liquid`. Out of scope for this refresh.

## What is NOT changing

- No new metaobject definitions.
- No edits to existing metafield definitions (Shopify forbids type changes via the create mutation; the deferred `specs.connection_type` enum tightening would need a separate normalize + update script).
- No collection or shop-level metafields added.
- Catalog-sync pipeline (`agent/sync/`) keeps writing the same fields it does today; backfill of the new keys is via `build-catalog-driven-products.mjs` after install (see § Backfill below).

## Backfill plan

After installation, three metafields need a one-time backfill:

| Field | Backfill source | Tool |
|---|---|---|
| `custom.series` | Parse SKU prefix from `data/catalog/gberg-catalog.json` (ASTORIA, ELANOR, FLORA, KONRAD, LAVINNO, PLATIS, PULLMAN, TWISTER) | extend `agent/scripts/build-catalog-driven-products.mjs` |
| `specs.wattage_w` | `legacy custom.wattage` (where set) and / or `data/catalog/gberg-catalog.json` heat-output rows | extend `agent/scripts/build-catalog-driven-products.mjs` |
| `custom.warranty_years` | Default 10 across the catalog | one-off `metafieldsSet` loop using `agent/scripts/build-catalog-driven-products.mjs` patterns |

`specs.energy_class`, `specs.room_coverage_m2`, `specs.dimensions_w_h_d_mm`, and `specs.installation_difficulty` will remain blank until merchant or the next sync run fills them. The Liquid templates (Track A) must `{%- if field != blank -%}` every row so the block is robust to gaps.

## File map

- `agent/scripts/install-design-refresh-metafields.mjs` — installer (Track B).
- `package.json` script `install:metafields:design-refresh` — invocation.
- `docs/metafields.md` — schema doc (this refresh in the "Design Refresh — April 2026" section).
- `docs/design-refresh-data-model.md` — this file.
- `theme/snippets/card-product.liquid` — card slot integration (Track A).
- `theme/sections/main-product.liquid` — PDP spec block integration (Track A).
- `theme/sections/header-trust-bar.liquid` — new section (Track A).

## Open risks

1. **Pinned definitions cap (20)** — existing installer pins 18; this installer requests 4 more. Two of the four (`energy_class`, `warranty_years` per the order in the script) may degrade to unpinned. Unpinned still works for storefront and Admin Custom data — only the convenience of seeing them in the product page sidebar is lost.
2. **Existing `specs.connection_type` is free-text** — the design refresh asked for an enum. The catalog-sync pipeline writes German strings ("Mittelanschluss") today, so tightening would require a normalize migration before tightening. Deferred; document the deferral here so the downstream consumer (PDP spec row renderer) handles the wider value space.
3. **Two `wattage` fields** — `custom.wattage` (legacy, from `docs/metafields.md` v1) and `specs.wattage_w` (new, brief-compliant) coexist. Track C-Liquid must read `specs.wattage_w` for the design-refresh card chip and PDP kW chip. Schedule deprecation of `custom.wattage` for a later cleanup pass.
