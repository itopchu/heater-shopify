#!/usr/bin/env python3
"""
Build product-catalog/ — the canonical, agent-consumable product catalog.

Merges three sources into one tree at the project root that any agent or
script can read without re-scraping or re-deriving:

    1. product-catalog/.cache/products/*.json       (live scrape: prices, stock,
                                                  options, descriptions, specs)
    2. catalog/<folder>/*.{jpg,png,pdf}          (owner-licensed assets)
    3. data/catalog-scraper-join.json            (handle ↔ folder ↔ filter map)

Output (overwrites in place):

    product-catalog/
        README.md
        index.json                    flat list of every entry
        products/<handle>.json        full record per live product (55)
        catalog-only/<slug>.json      record per catalog-only entry (4)
        status/canonical.json         in catalog AND on website AND in stock
        status/sold-out.json          all variants OOS upstream (likely discontinued)
        status/catalog-only.json      photos exist, no live handle
        status/scraper-only.json      sells but no licensed photos
        by-series/<SERIES>.json       grouped by ASTORIA / FLORA / etc.

The `product-catalog/products/<handle>.json` schema is the one downstream
agents should consume — it has the photo paths, the spec table, the variants
with stock + price, and a `canonical_status` flag.

Usage:
    python agent/scripts/build_product_catalog.py
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def strip_diacritics(s: str) -> str:
    s = (s.replace("ß", "ss")
          .replace("Ä", "A").replace("Ö", "O").replace("Ü", "U")
          .replace("ä", "a").replace("ö", "o").replace("ü", "u"))
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def slugify(s: str) -> str:
    s = strip_diacritics(s).lower()
    return "".join(c if c.isalnum() else "-" for c in s).strip("-").replace("--", "-")


def list_assets(folder: Path) -> tuple[list[str], list[str]]:
    """Return (image_paths, pdf_paths) for a catalog folder, sorted."""
    if not folder.exists():
        return [], []
    imgs: list[str] = []
    pdfs: list[str] = []
    for f in sorted(folder.iterdir()):
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        rel = f.as_posix()
        if ext in (".jpg", ".jpeg", ".png", ".webp"):
            imgs.append(rel)
        elif ext == ".pdf":
            pdfs.append(rel)
    return imgs, pdfs


def filter_assets(images: list[str], image_filter: str) -> list[str]:
    """Substring-match (diacritic-stripped, case-insensitive) — same semantics
    the existing build pipeline uses for image_filter."""
    if not image_filter:
        return list(images)
    needle = strip_diacritics(image_filter).lower()
    return [p for p in images
            if needle in strip_diacritics(Path(p).name).lower()]


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--scrape-dir", type=Path, default=Path("product-catalog/.cache"))
    ap.add_argument("--catalog-dir", type=Path, default=Path("catalog"))
    ap.add_argument("--join-file", type=Path,
                    default=Path("data/catalog-scraper-join.json"))
    ap.add_argument("--out", type=Path, default=Path("product-catalog"))
    args = ap.parse_args()

    for needed in (args.scrape_dir, args.join_file):
        if not needed.exists():
            print(f"!! missing input: {needed}", file=sys.stderr)
            return 2
    catalog_present = args.catalog_dir.exists()
    if not catalog_present:
        print(f"   note: catalog dir {args.catalog_dir} not present — building in "
              f"scrape-only mode (no licensed-photo paths in records).")

    join = json.loads(args.join_file.read_text(encoding="utf-8"))
    join_by_handle = {p["handle"]: p for p in join["products"]}
    orphan_catalog = join.get("_orphan_catalog_folders", [])

    scrape_index = json.loads((args.scrape_dir / "index.json").read_text(encoding="utf-8"))
    scrape_by_handle: dict[str, dict] = {}
    for slim in scrape_index["products"]:
        full = json.loads(
            (args.scrape_dir / "products" / f"{slim['handle']}.json").read_text(encoding="utf-8")
        )
        scrape_by_handle[slim["handle"]] = full

    # Optional: pull through the reconciliation if it exists. We don't
    # require it, but fold its findings in when present.
    recon_path = args.scrape_dir / "reconciliation.json"
    recon = json.loads(recon_path.read_text(encoding="utf-8")) if recon_path.exists() else None

    out = args.out
    if out.exists():
        # Wipe the generated subtrees, but keep the README we'll re-author below.
        for sub in ("products", "catalog-only", "status", "by-series"):
            for f in (out / sub).glob("*.json") if (out / sub).exists() else []:
                f.unlink()
        if (out / "index.json").exists():
            (out / "index.json").unlink()
    out.mkdir(parents=True, exist_ok=True)

    # ----- per-product canonical records -----
    canonical: list[dict] = []
    sold_out: list[dict] = []
    scraper_only: list[dict] = []
    by_series: dict[str, list[str]] = defaultdict(list)
    flat_index: list[dict] = []

    for handle, scrape in scrape_by_handle.items():
        join_entry = join_by_handle.get(handle, {})
        cat_folder = join_entry.get("catalog_folder")
        image_filter = join_entry.get("image_filter") or ""

        photos_licensed: list[str] = []
        photos_licensed_all_in_folder: list[str] = []
        pdfs: list[str] = []
        if cat_folder and catalog_present:
            folder_path = args.catalog_dir / cat_folder
            all_imgs, pdfs = list_assets(folder_path)
            photos_licensed_all_in_folder = all_imgs
            photos_licensed = filter_assets(all_imgs, image_filter)

        # Status — when catalog/ is absent, every product is effectively
        # "scrape-only" (the storefront uses xxl CDN images directly).
        if not cat_folder or not catalog_present:
            status = "scraper-only"
        elif scrape.get("available") is False:
            status = "sold-out"
        else:
            status = "canonical"

        record = {
            "handle": handle,
            "url": scrape.get("url"),
            "canonical_status": status,
            "title_de": scrape.get("title"),
            "title_de_curated": join_entry.get("title_de"),
            "series": join_entry.get("series") or scrape.get("model_inferred"),
            "color": join_entry.get("color") or (scrape.get("color_inferred") or "").lower() or None,
            "electric": join_entry.get("electric"),
            "primary_collection": scrape.get("primary_collection"),
            "collections": scrape.get("collections", []),
            "breadcrumb": scrape.get("breadcrumb", []),

            "description_text": scrape.get("description_text"),
            "description_html": scrape.get("description_html"),
            "specs": scrape.get("specs", {}),

            "options": scrape.get("options", []),
            "variants": [
                {
                    "id": v["id"],
                    "sku": v.get("sku"),
                    "barcode": v.get("barcode"),
                    "title": v.get("title"),
                    "option1": v.get("option1"),
                    "option2": v.get("option2"),
                    "option3": v.get("option3"),
                    "price": v.get("price"),
                    "compare_at_price": v.get("compare_at_price"),
                    "available": v.get("available"),
                    "grams": v.get("grams"),
                    "featured_image_position": v.get("featured_image_position"),
                    "featured_image_src": v.get("featured_image_src"),
                }
                for v in scrape.get("variants", [])
            ],

            "stock_summary": {
                "available": scrape.get("available"),
                "in_stock_variants": scrape.get("in_stock_variants"),
                "out_of_stock_variants": scrape.get("out_of_stock_variants"),
                "stock_unknown_variants": scrape.get("stock_unknown_variants"),
                "variant_count": scrape.get("variant_count"),
            },
            "price": {
                "currency": scrape.get("currency", "EUR"),
                "price_min": scrape.get("price_min"),
                "price_max": scrape.get("price_max"),
                "compare_at_min": scrape.get("compare_at_min"),
                "compare_at_max": scrape.get("compare_at_max"),
            },

            "photos": {
                "cdn_in_canonical_order": [
                    img["src"] for img in scrape.get("images", [])
                ],
                "primary_cdn": scrape.get("primary_image_src"),
                "licensed_for_this_color": photos_licensed,
                "licensed_folder": cat_folder,
                "licensed_folder_all_images": photos_licensed_all_in_folder,
                "licensed_pdfs": pdfs,
                "image_filter": image_filter,
            },

            "join_notes": join_entry.get("notes"),
            "source_signature": scrape.get("source_signature"),
            "fetched_at": scrape.get("fetched_at"),
        }

        write_json(out / "products" / f"{handle}.json", record)

        flat_index.append({
            "handle": handle,
            "title_de": record["title_de"],
            "series": record["series"],
            "color": record["color"],
            "electric": record["electric"],
            "primary_collection": record["primary_collection"],
            "canonical_status": status,
            "available": scrape.get("available"),
            "in_stock_variants": scrape.get("in_stock_variants"),
            "variant_count": scrape.get("variant_count"),
            "price_min": scrape.get("price_min"),
            "price_max": scrape.get("price_max"),
            "image_count": scrape.get("image_count"),
            "licensed_image_count": len(photos_licensed),
            "url": scrape.get("url"),
            "primary_cdn": scrape.get("primary_image_src"),
        })

        if status == "canonical":
            canonical.append(record)
        elif status == "sold-out":
            sold_out.append(record)
        else:
            scraper_only.append(record)

        if record["series"]:
            by_series[record["series"].upper()].append(handle)

    # ----- catalog-only entries (from join file's _orphan_catalog_folders) -----
    # Skipped entirely when catalog/ is absent: the storefront uses only the
    # 55 live xxl-heizung products in that mode.
    catalog_only: list[dict] = []
    for orphan in (orphan_catalog if catalog_present else []):
        folder = orphan.get("folder")
        if not folder:
            continue
        folder_path = args.catalog_dir / folder
        imgs, pdfs = list_assets(folder_path)
        slug = slugify(folder)
        record = {
            "slug": slug,
            "canonical_status": "catalog-only",
            "catalog_folder": folder,
            "reason": orphan.get("reason"),
            "photos": {
                "licensed_folder": folder,
                "licensed_folder_all_images": imgs,
                "licensed_pdfs": pdfs,
            },
            "image_count": len(imgs),
            "implication": "No live xxl-heizung handle. Either add a manual product entry "
                           "or use as supplementary photography.",
        }
        write_json(out / "catalog-only" / f"{slug}.json", record)
        catalog_only.append(record)
        flat_index.append({
            "slug": slug,
            "title_de": None,
            "canonical_status": "catalog-only",
            "catalog_folder": folder,
            "image_count": len(imgs),
        })

    # ----- index, status buckets, by-series -----
    write_json(out / "index.json", {
        "_doc": "Flat list of every entry in product-catalog/. Sort/filter to taste.",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "totals": {
            "live_products": len(scrape_by_handle),
            "canonical": len(canonical),
            "sold_out": len(sold_out),
            "catalog_only": len(catalog_only),
            "scraper_only": len(scraper_only),
        },
        "entries": flat_index,
    })

    write_json(out / "status" / "canonical.json", {"count": len(canonical),
                                                    "products": [r["handle"] for r in canonical]})
    write_json(out / "status" / "sold-out.json", {"count": len(sold_out),
                                                   "products": [r["handle"] for r in sold_out]})
    write_json(out / "status" / "catalog-only.json", {"count": len(catalog_only),
                                                       "entries": [r["slug"] for r in catalog_only]})
    write_json(out / "status" / "scraper-only.json", {
        "count": len(scraper_only),
        "products": [{"handle": r["handle"],
                      "reason": r.get("join_notes") or "no catalog folder per join"}
                     for r in scraper_only],
    })
    for series, handles in sorted(by_series.items()):
        write_json(out / "by-series" / f"{slugify(series)}.json",
                   {"series": series, "count": len(handles), "handles": sorted(handles)})

    # ----- README -----
    mode_note = ("**Mode:** scrape-only (no licensed-photo folder on disk). "
                 "All product imagery comes from xxl-heizung's CDN."
                 if not catalog_present else
                 "**Mode:** scrape + licensed-catalog (photo paths under "
                 "`catalog/<folder>/` included for each product).")
    readme = f"""# product-catalog/

Canonical, agent-consumable view of the G-Berg product line. Generated by
`agent/scripts/build_product_catalog.py`. Do not hand-edit — re-run the generator.

Generated: {datetime.now(timezone.utc).isoformat(timespec="seconds")}

{mode_note}

## What's in here

| path | what it is |
|---|---|
| `index.json` | flat list of every entry — fast to scan |
| `products/<handle>.json` | full record per live xxl-heizung product (55 entries) |
| `catalog-only/<slug>.json` | photos exist on disk but no live product (4 entries) |
| `status/canonical.json` | live + has photos + at least one variant in stock |
| `status/sold-out.json` | live + has photos + every variant OOS upstream |
| `status/catalog-only.json` | photos only, needs manual product entry |
| `status/scraper-only.json` | live but no licensed photos (incl. KONRAD commodity, accessories) |
| `by-series/<slug>.json` | grouped by series (ASTORIA, FLORA, ELANOR, …) |

## Per-product schema (products/<handle>.json)

Top-level fields most agents will need:

- `canonical_status` — one of `canonical`, `sold-out`, `scraper-only`
- `title_de`, `series`, `color`, `electric`
- `primary_collection`, `collections[]` — xxl-heizung Shopify collections
- `description_text`, `description_html`, `specs{{}}` — from xxl-heizung body_html
- `options[]`, `variants[]` — full variant table with `sku`, `barcode` (EAN),
  `price`, `compare_at_price`, `available`, sizes
- `stock_summary` — product-level rollup (available, in/oos counts)
- `price` — min/max + compare-at min/max in EUR
- `photos.cdn_in_canonical_order[]` — xxl-heizung CDN URLs in xxl's gallery order
- `photos.primary_cdn` — xxl-heizung's hero image
- `photos.licensed_for_this_color[]` — owner-licensed photo paths under
  `catalog/<folder>/`, filtered to this product's color
- `photos.licensed_folder_all_images[]` — full folder contents (other colors too)
- `photos.licensed_pdfs[]` — datasheets in the same folder
- `photos.image_filter` — substring used to pick licensed photos
- `join_notes` — curation notes from `data/catalog-scraper-join.json`

## Data sources

This folder is derived from:

1. `product-catalog/.cache/products/*.json` — live xxl-heizung scrape (incl. stock)
2. `catalog/<folder>/*` — owner-licensed photo assets
3. `data/catalog-scraper-join.json` — handle ↔ folder ↔ image_filter map

To regenerate after a fresh scrape or join-file edit:

```bash
python agent/scripts/scrape_xxl_heizung.py        # refresh source 1
python agent/scripts/reconcile_catalog.py          # sanity check
python agent/scripts/build_product_catalog.py      # rebuild this folder
```

## Known gaps (catalog-only)

{chr(10).join(f"- **{r['catalog_folder']}** ({r['image_count']} imgs) — {r['reason']}" for r in catalog_only)}

## Known gaps (scraper-only — sells but no licensed photos)

{chr(10).join(f"- **{r['handle']}** — {r.get('join_notes') or 'no catalog folder per join'}" for r in scraper_only)}

## Notes on catalog/

- 6 photo pairs are byte-identical between `catalog/Elanor/` and
  `catalog/Elanor Austausch/` (same physical product reused for the
  replacement variant). This is intentional duplication.
- `catalog/Astorian Austausch/` is missing one anthrazit photo
  (filename sequence skips `4 Anthrazit …`). Upstream gap; expect
  `licensed_for_this_color` to return 2 photos for that handle instead of 3.
- `catalog/Fotos 11.8.25/` holds lifestyle / in-room imagery in
  `BANYO PETEKLERİ` (bath) and `SALON PETEKLERİ` (living-room) subfolders.
"""
    (out / "README.md").write_text(readme, encoding="utf-8")

    # ----- summary print -----
    print(f"==> wrote product-catalog/ to {out}")
    print(f"    {len(canonical):>3}  canonical")
    print(f"    {len(sold_out):>3}  sold-out")
    print(f"    {len(scraper_only):>3}  scraper-only")
    print(f"    {len(catalog_only):>3}  catalog-only")
    print(f"    {sum(len(v) for v in by_series.values()):>3}  series-grouped entries across "
          f"{len(by_series)} series")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
