# Metafield & Metaobject Schema

Canonical source of truth for custom data. Every entry here must have a corresponding definition in Shopify Admin (Settings → Custom data). The theme reads only what is listed here.

Status key: `planned` · `defined` · `in-theme`

## Metaobjects

### `testimonial` — planned
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

### `trust_badge` — planned
Homepage / PDP trust strip items (10 Jahre Garantie, TÜV, Schnelle Lieferung, etc.).

| Field | Type | Required | Notes |
|---|---|---|---|
| label | single_line_text | yes | short heading |
| body | multi_line_text | no | 1 short line |
| icon | file_reference (image/svg) | yes | 48×48 |
| link | url | no | optional landing |

### `spec_section` — planned
PDP accordion block. Products reference a list of these via a product metafield.

| Field | Type | Required | Notes |
|---|---|---|---|
| title | single_line_text | yes | accordion heading |
| body | rich_text | no | paragraph |
| bullets | list.single_line_text | no | bullet list |
| icon | file_reference (image/svg) | no | optional |
| order | number_integer | no | sort hint |

### `faq_item` — planned
Reusable FAQ row.

| Field | Type | Required | Notes |
|---|---|---|---|
| question | single_line_text | yes | |
| answer | rich_text | yes | |
| category | single_line_text | no | for grouping |

### `usp_item` — planned (or use section blocks instead — decide in Phase 3)
Global USP strip item.

## Product metafields (namespace: `custom`)

| Key | Type | Purpose |
|---|---|---|
| `spec_sections` | list.metaobject_reference → `spec_section` | PDP accordions |
| `datasheet_pdf` | file_reference | PDF download |
| `bundle_partner` | product_reference | "Spare im Set" upsell |
| `warranty_years` | number_integer | Override default 10 |
| `grundpreis_value` | number_decimal | Price per unit (Grundpreis) |
| `grundpreis_unit` | single_line_text | e.g., "m²", "W" |
| `ral_color` | single_line_text | e.g., "RAL 9016" |
| `connection_type` | single_line_text | Mittelanschluss / Seitenanschluss |
| `width_cm` | number_decimal | Filterable via Search & Discovery |
| `height_cm` | number_decimal | Filterable |
| `wattage` | number_integer | Filterable |

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
