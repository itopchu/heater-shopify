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
