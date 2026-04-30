# Metafield & Metaobject Schema

Canonical source of truth for custom data. Every entry here must have a corresponding definition in Shopify Admin (Settings → Custom data). The theme reads only what is listed here.

Status key: `planned` · `defined` · `in-theme`

All definitions below are currently **`defined`** on the `heater-dev` store (created via `agent/scripts/create-metaobjects.mjs` on 2026-04-23). Run that script after any schema edit — it's idempotent.

## Metaobjects

### `testimonial` — defined
Reusable customer quote.

| Field | Type | Required | Notes |
|---|---|---|---|
| name | single_line_text | yes | First name + last initial |
| role | single_line_text | no | e.g., "Verified customer" |
| quote | multi_line_text | yes | Max ~300 chars |
| rating | number_integer | yes | 1–5 |
| avatar | file_reference (image) | no | ~128×128 |
| source | single_line_text | no | e.g., "Judge.me", "Google" |
| locale_hint | single_line_text | no | `de` or `en` — optional filter |

### `trust_badge` — defined
Homepage / PDP trust strip items (10 Jahre Garantie, TÜV, Schnelle Lieferung, etc.).

| Field | Type | Required | Notes |
|---|---|---|---|
| label | single_line_text | yes | short heading |
| body | multi_line_text | no | 1 short line |
| icon | file_reference (image/svg) | yes | 48×48 |
| link | url | no | optional landing |

### `spec_section` — defined
PDP accordion block. Products reference a list of these via a product metafield.

| Field | Type | Required | Notes |
|---|---|---|---|
| title | single_line_text | yes | accordion heading |
| body | rich_text | no | paragraph |
| bullets | list.single_line_text | no | bullet list |
| icon | file_reference (image/svg) | no | optional |
| order | number_integer | no | sort hint |

### `faq_item` — defined
Reusable FAQ row.

| Field | Type | Required | Notes |
|---|---|---|---|
| question | single_line_text | yes | |
| answer | rich_text | yes | |
| category | single_line_text | no | for grouping |

### `usp_item` — defined (used by sections/usp-strip.liquid; new sections/announcement-top-bar.liquid uses block-level USPs instead)
Global USP strip item.

## Product metafields (namespace: `custom`)

| Key | Type | Purpose |
|---|---|---|
| `spec_sections` | list.metaobject_reference → `spec_section` | PDP accordions |
| `datasheet_pdf` | file_reference | PDF download |
| `bundle_partner` | product_reference | Legacy single-pair upsell (prefer `bundle_products`) |
| `bundle_products` | list.product_reference | "Spare im Set" multi-product upsell |
| `faqs` | list.metaobject_reference → `faq_item` | PDP FAQ accordion |
| `delivery_contents` | list.single_line_text | Itemized what's-in-the-box |
| `delivery_eta` | single_line_text | Human shipping speed, translatable (e.g. "2-4 business days") |
| `warranty_years` | number_integer | Override default 10 |
| `grundpreis_value` | number_decimal | Price per unit (Grundpreis) |
| `grundpreis_unit` | single_line_text | e.g., "m²", "W" |
| `ral_color` | single_line_text | e.g., "RAL 9016" |
| `connection_type` | single_line_text | Mittelanschluss / Seitenanschluss |
| `width_cm` | number_decimal | Filterable via Search & Discovery |
| `height_cm` | number_decimal | Filterable |
| `wattage` | number_integer | Filterable |

## Product sync keys (namespace: `sync`)

Written by the catalog-sync pipeline (`agent/sync/`). Diagnostic, not for merchant editing.

| Key | Type | Purpose |
|---|---|---|
| `xxl_source_id` | number_integer | Upstream product ID — primary sync key |
| `xxl_source_handle` | single_line_text | Upstream handle — traceability |
| `xxl_last_synced_at` | date_time | ISO timestamp of last successful sync |

## Collection metafields

| Key | Type | Purpose |
|---|---|---|
| `card_image` | file_reference | Override image for homepage category grid |
| `badge_text` | single_line_text | Optional badge on category card |

## Shop-level (theme settings, not metafields)

- Promo bar text + countdown target → theme settings
- USP strip items → header-group section blocks
- Footer columns → footer-group section blocks
- Legal page links → theme settings (linklist)

---

## Design Refresh — April 2026

Adds the PRODUCT metafields required by `docs/design-refresh-plan.md`
sections 2 (card eyebrow + wattage chip), 4 (PDP structured spec block),
and 6 (header trust bar — reuses the existing `usp_item` metaobject; no
new metaobject needed, see Decision below).

**Namespace decision** — the Track B brief proposed namespace `gberg`. The
project has already migrated PRODUCT metafields out of `gberg.*` into the
brief-compliant namespace structure (see
`agent/scripts/migrate-metafield-namespaces.mjs` and
`for-claude/shop/08_shopify_metafields_metaobjects_definitions.md`).
Re-introducing `gberg` would re-fragment the namespace surface. Each new
field below uses the existing brief-compliant namespace it belongs to
(`custom` for editorial / per-SKU defaults, `specs` for measurable
attributes).

**Install** — run `npm run install:metafields:design-refresh:dry` to preview,
then `npm run install:metafields:design-refresh` to apply. The script is
idempotent; re-runs skip already-installed definitions.

**Pinning** — Shopify caps pinned PRODUCT definitions at 20. The existing
installer already pins ~18 high-frequency keys; the design-refresh installer
requests pins for `series`, `wattage_w`, `energy_class`, `warranty_years`
(in storefront-edit-frequency order). The script auto-degrades to unpinned
on `PINNED_LIMIT_REACHED` so two of the four may land unpinned. Unpinned
definitions are still editable in Admin → Custom data and still readable
from the Storefront API.

### New product metafields (alphabetical)

| Namespace.key | Type | Validations | UI label | Pin | Surfaces on |
|---|---|---|---|---|---|
| `custom.series` | `single_line_text_field` | none | Series | yes | Card eyebrow wordmark; PDP eyebrow above title |
| `custom.warranty_years` | `number_integer` | min 1, max 25 | Warranty (years) | yes | PDP spec block (warranty icon + caption) |
| `specs.dimensions_w_h_d_mm` | `single_line_text_field` | none | Dimensions W×H×D (mm) | no | PDP spec block (dimensions row) |
| `specs.energy_class` | `single_line_text_field` | choices: A+++, A++, A+, A, B, C, D, E, F, G | Energy class | yes | PDP spec block (energy badge) |
| `specs.installation_difficulty` | `single_line_text_field` | choices: easy, standard, professional | Installation difficulty | no | PDP spec block (install icon caption) |
| `specs.room_coverage_m2` | `number_decimal` | min 1, max 80 | Room coverage (m²) | no | PDP spec block ("Heats rooms up to N m²") |
| `specs.wattage_w` | `number_integer` | min 50, max 5000 | Wattage (W) | yes | Card top-right chip; PDP spec block (kW chip) |

### Reused product metafields (no schema change)

| Namespace.key | Status | Notes |
|---|---|---|
| `specs.connection_type` | already installed (pinned, single_line_text_field, no enum) | The brief proposed enum side\|center\|both. Existing field accepts free text ("Mittelanschluss", "Seitenanschluss"). Tightening to enum is deferred — it requires a normalize-then-update migration; doing it inline would break the catalog-sync writes. |
| `specs.width_mm` / `specs.height_mm` / `specs.depth_mm` | already installed (number_integer, pinned) | Numeric source of truth. `specs.dimensions_w_h_d_mm` (new) is the display-string mirror used by the PDP spec row — merchant-controlled formatting (× separator, locale spacing). |

### Header trust bar — metaobject decision

**Reuse `usp_item`** (no new metaobject). The existing `usp_item` metaobject
already has `{ icon, label, body }` — the same field set the slim header
trust bar needs. A separate `header_trust_mark` type with the same fields
would just clone semantics for one extra `priority` integer that a Theme
Editor section setting on `header-trust-bar.liquid` solves cleanly. Track A
(Liquid) adds three "trust mark" block-pickers on the section that reference
`usp_item.values` by handle; merchants pick which 3 surface in the header
without leaving the Theme Editor.

---

