#!/usr/bin/env python3
"""
Regenerate every product image in catalog/ into a lifestyle scene via
nano-banana-test.py (oak-and-realistic-wall by default).

Default mode is DRY-RUN: discovers products and prints what would happen,
nothing is generated. Pass --apply to actually call the generator.

Outputs land in tmp/nano-banana-test/<product-slug>/scene/result-scene-*.png
following the existing per-product layout, so the replacement step can
map them back to the source files.

Usage:
    python regenerate-all.py                    # dry-run, summary only
    python regenerate-all.py --apply            # actually generate
    python regenerate-all.py --apply --label v1 # tag this batch
    python regenerate-all.py --apply --skip-existing  # skip products whose outputs already exist

Cost: ~$0.14 per generation (gemini-3-pro-image-preview).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "catalog"
OUT_ROOT = REPO / "tmp" / "nano-banana-test"
GENERATOR = REPO / "agent" / "scripts" / "nano-banana-test.py"

PER_IMAGE_USD = 0.14
USD_TO_EUR = 0.92


def discover_products(catalog_root: Path) -> list[tuple[Path, list[Path]]]:
    """Return [(product_dir, [image_path, ...]), ...] for every leaf
    directory under catalog_root that contains at least one image file."""
    out: list[tuple[Path, list[Path]]] = []
    for d in sorted(p for p in catalog_root.rglob("*") if p.is_dir()):
        imgs = sorted(
            p
            for p in d.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )
        if imgs:
            out.append((d, imgs))
    return out


def slug_from_product_dir(product_dir: Path) -> str:
    """Mirror nano-banana-test.product_slug() so we can locate outputs."""
    parts = product_dir.resolve().parts
    if "catalog" in parts:
        i = parts.index("catalog")
        tail = parts[i + 1 :]
        return "_".join(tail) if tail else product_dir.name
    return product_dir.name


def existing_outputs(product_dir: Path, label: str) -> int:
    """Count how many result-scene-*.png files already exist for this product."""
    slug = slug_from_product_dir(product_dir)
    scene_dir = OUT_ROOT / slug / "scene"
    if not scene_dir.exists():
        return 0
    label_suffix = f".{label}" if label else ""
    return sum(
        1
        for p in scene_dir.iterdir()
        if p.is_file()
        and p.name.startswith("result-scene-")
        and p.name.endswith(f"{label_suffix}.png")
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument(
        "--apply",
        action="store_true",
        help="Actually run the generator. Without this, prints a dry-run summary only.",
    )
    p.add_argument(
        "--label",
        default="",
        help="Optional label appended to output filenames (e.g. --label v1).",
    )
    p.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip products whose scene/ output dir already contains "
        "matching result-scene-*.png files (useful for resuming a partial run).",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most this many products (0 = all). Useful for partial test runs.",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if not CATALOG.exists():
        sys.exit(f"catalog/ not found at {CATALOG}")
    if not GENERATOR.exists():
        sys.exit(f"generator script not found at {GENERATOR}")

    products = discover_products(CATALOG)
    if not products:
        sys.exit("no products found under catalog/")

    if args.limit > 0:
        products = products[: args.limit]

    total_images = sum(len(imgs) for _, imgs in products)
    est_usd = total_images * PER_IMAGE_USD
    est_eur = est_usd * USD_TO_EUR

    print(f"Catalog root: {CATALOG.relative_to(REPO)}")
    print(f"Products discovered: {len(products)}")
    print(f"Source images: {total_images}")
    print(f"Estimated cost: ${est_usd:.2f} (~€{est_eur:.2f})")
    if args.label:
        print(f"Label: {args.label}")
    if args.skip_existing:
        already = sum(1 for d, _ in products if existing_outputs(d, args.label) > 0)
        print(f"Skip-existing: {already} products already have outputs and would be skipped")
    print()

    if not args.apply:
        print("=== DRY RUN — pass --apply to actually generate ===")
        print()
        print("First 10 products that would be processed:")
        for d, imgs in products[:10]:
            try:
                rel = d.relative_to(REPO)
            except ValueError:
                rel = d
            print(f"   {rel}  ({len(imgs)} image(s))")
        if len(products) > 10:
            print(f"   ... and {len(products) - 10} more")
        return 0

    # Live run.
    print("=== LIVE RUN — calling generator per product ===")
    succeeded: list[str] = []
    failed: list[tuple[str, str]] = []
    skipped: list[str] = []
    quota_hit = False

    for idx, (product_dir, imgs) in enumerate(products, 1):
        rel = product_dir.relative_to(REPO)

        if args.skip_existing:
            existing = existing_outputs(product_dir, args.label)
            if existing >= len(imgs):
                print(f"[{idx}/{len(products)}] {rel}  ({len(imgs)} images) — SKIP (already has {existing} outputs)")
                skipped.append(str(rel))
                continue

        print(f"\n[{idx}/{len(products)}] {rel}  ({len(imgs)} images)")
        cmd = [sys.executable, str(GENERATOR), "--input", str(product_dir)]
        if args.label:
            cmd.extend(["--label", args.label])

        t0 = time.time()
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        elapsed = time.time() - t0

        # Surface the generator's own progress lines.
        if proc.stdout:
            for line in proc.stdout.splitlines():
                if line.strip():
                    print(f"   | {line}")

        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "")[-500:]
            print(f"   ✗ failed in {elapsed:.1f}s")
            failed.append((str(rel), tail.strip()))
            # 429 = spending cap exhausted: stop the whole batch.
            if "RESOURCE_EXHAUSTED" in (proc.stdout + proc.stderr) or "exceeded its monthly spending cap" in (proc.stdout + proc.stderr):
                quota_hit = True
                print()
                print("!!! Spending cap hit — aborting batch. Raise the cap and re-run with --skip-existing to resume.")
                break
            continue

        print(f"   ✓ done in {elapsed:.1f}s")
        succeeded.append(str(rel))

    print()
    print("=== Summary ===")
    print(f"Succeeded: {len(succeeded)} / {len(products)}")
    print(f"Skipped:   {len(skipped)}")
    print(f"Failed:    {len(failed)}")
    if failed:
        print()
        print("Failures:")
        for rel, msg in failed[:20]:
            print(f"   - {rel}")
            for line in msg.splitlines()[-3:]:
                print(f"       {line}")
        if len(failed) > 20:
            print(f"   ... and {len(failed) - 20} more")
    if quota_hit:
        return 2
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
