#!/usr/bin/env python3
"""
Reconcile xxl-heizung scrape output against our owner-licensed catalog.

Three sources of truth:
  1. data/catalog-scraper-join.json          — hand-curated alias/mapping
  2. product-catalog/.cache/products/*.json     — fresh live scrape
  3. catalog/<folder>/*                      — owner-licensed images on disk

The join file already does the hard work of mapping confusing model aliases
(MILAN handle <-> FLORA Vertikal folder, KASKA <-> FLORA Horizontal,
ASTORIA title <-> alpha handle, KONRAD = commodity with no folder, etc.).

What this script catches:
  - Join entries pointing to handles that vanished from the live website.
  - Join entries pointing to catalog folders that vanished from disk.
  - Live scrape handles that nobody mapped (new-on-website).
  - Catalog folders nobody references (unused-on-disk).
  - Per-product stock health folded into each match.

Output buckets follow the user's framing:
  A — catalog AND scraper AND any in-stock variant       (canonical)
  B — catalog AND scraper AND fully sold out             (likely discontinued)
  C — catalog only (folder exists, no live handle)       (have photos, not selling)
  D — scraper only (handle exists, no catalog folder)    (selling, no licensed photos)

Usage:
    python agent/scripts/reconcile_catalog.py
    python agent/scripts/reconcile_catalog.py --quiet           # only write JSON, no text summary

Writes:
    product-catalog/.cache/reconciliation.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


# Turkish/German color token aliases used in catalog/ filenames.
# Lowercase for matching after NFKD-stripping diacritics.
COLOR_ALIASES: dict[str, str] = {
    # German
    "anthrazit": "anthrazit",
    "schwarz":   "schwarz",
    "weiss":     "weiss",
    "weisz":     "weiss",  # ß -> ss after stripping
    "chrom":     "chrom",
    # Turkish
    "antrasit": "anthrazit",
    "siyah":    "schwarz",
    "beyaz":    "weiss",
    "krom":     "chrom",
}

# What "premium" / "platis" / etc. mean as catalog-side variant tokens.
NON_COLOR_FILENAME_TOKENS = {
    "platis", "premium", "premim",  # premim = misspelling seen in folder
    "elanor", "astoria", "flora", "pullman", "twister", "skyline",
    "horizontal", "vertikal", "elektrisch", "austausch",
    "mittelanschluss", "seitenanschluss", "wc", "haenge",
    "alt", "ueberst", "oberst", "uberst", "uest",
    "karsi", "duvar", "arka", "plan", "aparati",
    "180", "270", "derece", "deredce", "acidan", "acidan",
    "haengewc", "twoside", "topdown",
}


def strip_diacritics(s: str) -> str:
    import unicodedata
    s = s.replace("ß", "ss").replace("Ä", "A").replace("Ö", "O").replace("Ü", "U") \
         .replace("ä", "a").replace("ö", "o").replace("ü", "u")
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def list_image_filenames(folder: Path) -> list[str]:
    out: list[str] = []
    for img in folder.iterdir():
        if img.is_file() and img.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            out.append(img.name)
    return sorted(out)


def colors_in_folder(folder: Path) -> set[str]:
    """Best-effort color tokens in a folder's filenames.

    Used only as a soft hint; do NOT use this to flag drift, because catalog
    filenames mix German colors, Turkish colors, finish words ("glänzend"),
    photographer brand ("Platis"), or no color at all (Hänge WC). The
    authoritative drift check is substring-matching the join's `image_filter`.
    """
    found: set[str] = set()
    for fname in list_image_filenames(folder):
        stem = strip_diacritics(Path(fname).stem).lower()
        for tok in stem.replace("_", " ").split():
            tok_clean = "".join(ch for ch in tok if ch.isalpha())
            if tok_clean in COLOR_ALIASES:
                found.add(COLOR_ALIASES[tok_clean])
    return found


def folder_matches_filter(folder: Path, image_filter: str) -> tuple[bool, list[str]]:
    """Substring-match `image_filter` against filenames the way the join file
    intends. Returns (any_match, matching_filenames).

    Comparison is case-insensitive and diacritic-stripped on BOTH sides so
    the join's "weiß" matches a filename "Weiss ...". An empty filter is
    treated as "always matches" — the join file uses empty filters when the
    catalog folder is single-color and every image is the right one.
    """
    needle = strip_diacritics(image_filter or "").strip().lower()
    matches: list[str] = []
    for fname in list_image_filenames(folder):
        hay = strip_diacritics(fname).lower()
        if not needle or needle in hay:
            matches.append(fname)
    return (bool(matches), matches)


# -------- main --------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--scrape-dir", type=Path,
                    default=Path("product-catalog/.cache"),
                    help="Output dir of scrape_xxl_heizung.py")
    ap.add_argument("--catalog-dir", type=Path, default=Path("catalog"),
                    help="Owner-licensed catalog photo root")
    ap.add_argument("--join-file", type=Path,
                    default=Path("data/catalog-scraper-join.json"),
                    help="Hand-curated handle ↔ catalog_folder map")
    ap.add_argument("--out", type=Path, default=None,
                    help="Where to write JSON report (default: <scrape-dir>/reconciliation.json)")
    ap.add_argument("--quiet", action="store_true", help="Only write JSON, no text summary")
    args = ap.parse_args()

    out_path = args.out or (args.scrape_dir / "reconciliation.json")

    # ----- load all three sources -----
    if not args.scrape_dir.exists():
        print(f"!! scrape dir not found: {args.scrape_dir}", file=sys.stderr)
        return 2
    if not args.join_file.exists():
        print(f"!! join file not found: {args.join_file}", file=sys.stderr)
        return 2
    catalog_present = args.catalog_dir.exists()
    if not catalog_present:
        print(f"   note: catalog dir {args.catalog_dir} not present — running in "
              f"scrape-only mode (no licensed-photo drift checks).")

    join = json.loads(args.join_file.read_text(encoding="utf-8"))
    join_products: list[dict] = join.get("products", [])
    join_orphan_catalog: list[dict] = join.get("_orphan_catalog_folders", [])
    join_orphan_handles: list = join.get("_orphan_scraper_handles", [])

    scrape_products: dict[str, dict] = {}
    for p_path in sorted((args.scrape_dir / "products").glob("*.json")):
        rec = json.loads(p_path.read_text(encoding="utf-8"))
        scrape_products[rec["handle"]] = rec

    catalog_folders: dict[str, set[str]] = {}
    if catalog_present:
        for d in sorted(args.catalog_dir.iterdir()):
            if d.is_dir():
                catalog_folders[d.name] = colors_in_folder(d)

    # ----- build matches -----
    bucket_A: list[dict] = []  # catalog + scraper + in-stock
    bucket_B: list[dict] = []  # catalog + scraper + sold out
    bucket_C: list[dict] = []  # catalog only
    bucket_D: list[dict] = []  # scraper only
    drift: list[dict] = []

    join_handles = {p["handle"] for p in join_products}
    referenced_folders = {p.get("catalog_folder") for p in join_products if p.get("catalog_folder")}

    # Pass 1 — every join entry: still on website? still on disk?
    for jp in join_products:
        handle = jp["handle"]
        cat_folder = jp.get("catalog_folder")
        scrape_rec = scrape_products.get(handle)

        if scrape_rec is None:
            drift.append({
                "kind": "join_handle_missing_from_scrape",
                "handle": handle,
                "join_entry": jp,
                "implication": "Was sold on xxl-heizung when join was authored; no longer listed.",
            })
            continue

        stock_summary = {
            "available": scrape_rec.get("available"),
            "in_stock_variants": scrape_rec.get("in_stock_variants"),
            "out_of_stock_variants": scrape_rec.get("out_of_stock_variants"),
            "stock_unknown_variants": scrape_rec.get("stock_unknown_variants"),
            "variant_count": scrape_rec.get("variant_count"),
        }

        catalog_status: dict[str, Any] = {"folder": cat_folder}
        if cat_folder and catalog_present:
            if cat_folder not in catalog_folders:
                drift.append({
                    "kind": "join_catalog_folder_missing_from_disk",
                    "handle": handle,
                    "expected_folder": cat_folder,
                    "join_entry": jp,
                })
                catalog_status["folder_present"] = False
            else:
                catalog_status["folder_present"] = True
                catalog_status["folder_colors_hint"] = sorted(catalog_folders[cat_folder])
                # Authoritative check: does the join's image_filter actually
                # match at least one filename in this folder? (Filenames vary
                # wildly: German color, Turkish color, finish word, no color.)
                folder_path = args.catalog_dir / cat_folder
                image_filter = jp.get("image_filter") or ""
                ok, matches = folder_matches_filter(folder_path, image_filter)
                catalog_status["image_filter"] = image_filter
                catalog_status["matched_image_count"] = len(matches)
                catalog_status["sample_matches"] = matches[:3]
                if not ok:
                    drift.append({
                        "kind": "join_filter_matches_no_files",
                        "handle": handle,
                        "folder": cat_folder,
                        "image_filter": image_filter,
                        "implication": ("Join's image_filter no longer matches any file in the catalog "
                                        "folder — folder contents likely renamed or moved."),
                    })

        match = {
            "handle": handle,
            "title": scrape_rec.get("title"),
            "series": jp.get("series"),
            "color": jp.get("color"),
            "electric": jp.get("electric"),
            "primary_collection": scrape_rec.get("primary_collection"),
            "url": scrape_rec.get("url"),
            "primary_image_src": scrape_rec.get("primary_image_src"),
            "stock": stock_summary,
            "catalog": catalog_status,
            "join_notes": jp.get("notes"),
            "source_signature": scrape_rec.get("source_signature"),
        }

        if not cat_folder or not catalog_present:
            # No catalog folder (per join) OR catalog/ not on disk => scraper-only.
            reason = jp.get("notes") or (
                "no catalog folder per join" if not cat_folder
                else "catalog/ folder absent on disk — scrape-only mode"
            )
            bucket_D.append(match | {"reason": reason})
        else:
            if stock_summary.get("available") is False:
                bucket_B.append(match)
            else:
                bucket_A.append(match)

    # Pass 2 — fresh-scrape handles NOT in join (new on website since join was written)
    for handle, rec in scrape_products.items():
        if handle in join_handles:
            continue
        bucket_D.append({
            "handle": handle,
            "title": rec.get("title"),
            "series": rec.get("model_inferred"),
            "color": rec.get("color_inferred"),
            "primary_collection": rec.get("primary_collection"),
            "url": rec.get("url"),
            "primary_image_src": rec.get("primary_image_src"),
            "stock": {
                "available": rec.get("available"),
                "in_stock_variants": rec.get("in_stock_variants"),
                "out_of_stock_variants": rec.get("out_of_stock_variants"),
                "variant_count": rec.get("variant_count"),
            },
            "reason": "Live scrape handle not present in catalog-scraper-join.json — new on website?",
        })
        drift.append({
            "kind": "scrape_handle_not_in_join",
            "handle": handle,
            "implication": "Site added a product since the join file was last curated.",
        })

    # Pass 3 — catalog folders nobody uses (skipped when catalog/ is absent)
    declared_orphans = {o.get("folder") for o in join_orphan_catalog}
    for folder, colors in catalog_folders.items() if catalog_present else []:
        if folder in referenced_folders:
            continue
        # Folder is unused. Categorize by whether the join file flagged it.
        entry = {
            "folder": folder,
            "colors_on_disk": sorted(colors),
            "image_count": sum(1 for _ in (args.catalog_dir / folder).iterdir()),
        }
        match = next((o for o in join_orphan_catalog if o.get("folder") == folder), None)
        if match:
            entry["reason"] = match.get("reason")
            entry["acknowledged"] = True
        else:
            entry["reason"] = "Catalog folder is not referenced by any join entry."
            entry["acknowledged"] = False
            drift.append({
                "kind": "catalog_folder_unreferenced",
                "folder": folder,
                "implication": "Owner has photos for a model the join file doesn't map to any handle.",
            })
        bucket_C.append(entry)

    report = {
        "_doc": ("Catalog ↔ scrape reconciliation. "
                 "A=catalog+scrape+in-stock, B=catalog+scrape+sold-out, "
                 "C=catalog-only, D=scraper-only."),
        "scrape_dir": str(args.scrape_dir),
        "catalog_dir": str(args.catalog_dir),
        "join_file": str(args.join_file),
        "join_authored": join.get("_generated"),
        "totals": {
            "join_products": len(join_products),
            "scrape_products": len(scrape_products),
            "catalog_folders": len(catalog_folders),
            "bucket_A_canonical": len(bucket_A),
            "bucket_B_sold_out": len(bucket_B),
            "bucket_C_catalog_only": len(bucket_C),
            "bucket_D_scraper_only": len(bucket_D),
            "drift_findings": len(drift),
        },
        "bucket_A_canonical": bucket_A,
        "bucket_B_sold_out": bucket_B,
        "bucket_C_catalog_only": bucket_C,
        "bucket_D_scraper_only": bucket_D,
        "drift_findings": drift,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    if args.quiet:
        return 0

    # ----- print human summary -----
    t = report["totals"]
    print(f"Catalog ↔ scrape reconciliation")
    print(f"  Join file authored : {report['join_authored']}")
    print(f"  Join entries       : {t['join_products']}")
    print(f"  Live scrape         : {t['scrape_products']}")
    print(f"  Catalog folders     : {t['catalog_folders']}")
    print()
    print(f"Buckets")
    print(f"  A canonical (catalog+sells+in-stock) : {t['bucket_A_canonical']}")
    print(f"  B sold-out (catalog+sells+OOS)       : {t['bucket_B_sold_out']}")
    print(f"  C catalog-only (no live handle)      : {t['bucket_C_catalog_only']}")
    print(f"  D scraper-only (no catalog folder)   : {t['bucket_D_scraper_only']}")
    print()
    if bucket_B:
        print("Sold-out / discontinued candidates:")
        for b in bucket_B:
            s = b["stock"]
            print(f"  - {b['handle']}  in:{s['in_stock_variants']}/{s['variant_count']}")
        print()
    print("Drift findings:")
    if not drift:
        print("  (none — join file still matches reality)")
    else:
        from collections import Counter
        kinds = Counter(d["kind"] for d in drift)
        for k, n in kinds.most_common():
            print(f"  {n:>3}  {k}")
        # show the first few of each kind
        seen_kinds: set[str] = set()
        for d in drift:
            k = d["kind"]
            if k in seen_kinds:
                continue
            seen_kinds.add(k)
            sample = {kk: vv for kk, vv in d.items() if kk in ("handle", "folder", "expected_folder", "expected_color", "implication")}
            print(f"     example [{k}]: {sample}")
    print()
    print(f"Full report -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
