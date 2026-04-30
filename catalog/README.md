# catalog/

Local mirror of xxl-heizung product images, organized for human review and selection.

## Layout

```
catalog/
  <series>/<color>/<handle>/
    01.jpg
    02.jpg
    ...
```

- `<series>` — lowercase product series slug (e.g. `elanor`, `twister`, `pullman`).
- `<color>` — lowercase color slug (e.g. `schwarz`, `weiss`, `anthrazit`).
- `<handle>` — Shopify product handle (matches `product-catalog/products/<handle>.json`).
- `NN.<ext>` — image, numbered by xxl-heizung's `cdn_in_canonical_order` position (1-based, zero-padded).

## Renaming convention

Once you've eyeballed a folder, rename to surface the lead shot:

- `01-hero.jpg` — primary product shot used for PLP card and PDP hero.
- `02-detail.jpg` — close-up / hardware / connector / valve detail.
- `03-lifestyle.jpg` — in-room / styled scene.
- `04-spec.jpg` — line drawing / dimensions.

Numbers stay sortable; the suffix is human-readable. The manifest re-syncs on next run.

## Regenerate

```
node agent/scripts/download-catalog-images.mjs            # incremental, skips files on disk
node agent/scripts/download-catalog-images.mjs --force    # re-download all
node agent/scripts/download-catalog-images.mjs --limit 3  # first 3 products only (smoke test)
```

## Source of truth

URLs are read from `product-catalog/products/<handle>.json` → `photos.cdn_in_canonical_order`.
The order in that array determines the `NN` numbering on disk.

## Git policy

`catalog/<subdirs>/` are gitignored (binary, ~60 MB regenerable). `README.md` and `manifest.json` are tracked.
