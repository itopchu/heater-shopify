#!/usr/bin/env python3
"""
Replace catalog/<...>/<stem>.<ext> source images with the lifestyle
versions generated under tmp/nano-banana-test/<slug>/scene/.

Default mode is DRY-RUN: prints what would be replaced. Pass --apply
to actually overwrite files. The original catalog/ should already be
backed up to catalog.backup-<timestamp>/ by the regenerate-all step.

PNG outputs are converted to JPG when the source was JPG, so file
extensions in catalog/ are preserved (downstream sync references
expect the same paths).

Usage:
    python replace-from-generated.py                 # dry-run
    python replace-from-generated.py --apply         # actually replace
    python replace-from-generated.py --label v1      # match outputs tagged with --label v1
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "catalog"
OUT_ROOT = REPO / "tmp" / "nano-banana-test"


def slug_from_product_dir(product_dir: Path) -> str:
    parts = product_dir.resolve().parts
    if "catalog" in parts:
        i = parts.index("catalog")
        tail = parts[i + 1 :]
        return "_".join(tail) if tail else product_dir.name
    return product_dir.name


def discover_products(catalog_root: Path) -> list[tuple[Path, list[Path]]]:
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


def find_generated(product_dir: Path, source_stem: str, label: str) -> Path | None:
    """Locate a result-scene-*-<stem>[.<label>].png for the given source."""
    slug = slug_from_product_dir(product_dir)
    scene_dir = OUT_ROOT / slug / "scene"
    if not scene_dir.exists():
        return None
    label_suffix = f".{label}" if label else ""
    # Filename pattern: result-scene-<scene-slug>-<stem>[.label].png
    # We don't know the scene slug here, but stem + label uniquely identify
    # the file when only one scene is in use. Pick the most recently
    # modified match if multiple exist.
    candidates = [
        p
        for p in scene_dir.iterdir()
        if p.is_file()
        and p.name.startswith("result-scene-")
        and p.name.endswith(f"-{source_stem}{label_suffix}.png")
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument(
        "--apply",
        action="store_true",
        help="Actually overwrite catalog files. Without this, prints planned replacements only.",
    )
    p.add_argument(
        "--label",
        default="",
        help="Match outputs tagged with this label (e.g. --label v1).",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most this many products (0 = all).",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if not CATALOG.exists():
        sys.exit(f"catalog/ not found at {CATALOG}")

    # Pillow is required for PNG → JPG conversion. If the user has not
    # installed it, fall back to a copy-with-extension-change strategy.
    try:
        from PIL import Image  # type: ignore
        have_pillow = True
    except ImportError:
        Image = None  # type: ignore
        have_pillow = False

    products = discover_products(CATALOG)
    if args.limit > 0:
        products = products[: args.limit]

    print(f"Catalog products: {len(products)}")
    print(f"Pillow available: {have_pillow}  ({'PNG→JPG conversion enabled' if have_pillow else 'will copy as PNG and rename if needed'})")
    if args.label:
        print(f"Label: {args.label}")
    print()

    planned: list[tuple[Path, Path]] = []  # (source, generated)
    missing: list[Path] = []

    for product_dir, imgs in products:
        for src in imgs:
            gen = find_generated(product_dir, src.stem, args.label)
            if gen is None:
                missing.append(src)
                continue
            planned.append((src, gen))

    print(f"Replacements ready: {len(planned)}")
    print(f"Missing generated outputs: {len(missing)}")
    if missing:
        print("First 10 missing:")
        for m in missing[:10]:
            try:
                rel = m.relative_to(REPO)
            except ValueError:
                rel = m
            print(f"   - {rel}")
        if len(missing) > 10:
            print(f"   ... and {len(missing) - 10} more")
    print()

    if not args.apply:
        print("=== DRY RUN — pass --apply to actually overwrite catalog files ===")
        print()
        print("First 10 planned replacements:")
        for src, gen in planned[:10]:
            try:
                src_rel = src.relative_to(REPO)
                gen_rel = gen.relative_to(REPO)
            except ValueError:
                src_rel, gen_rel = src, gen
            print(f"   {gen_rel}")
            print(f"   → {src_rel}")
        return 0

    # Live: overwrite catalog files.
    if not have_pillow:
        sys.exit(
            "Pillow not installed; cannot reliably convert PNG → JPG. "
            "Install it with: pip install Pillow"
        )

    written = 0
    errors: list[tuple[Path, str]] = []
    for src, gen in planned:
        try:
            with Image.open(gen) as im:
                # Preserve original extension. JPG can't have alpha — flatten.
                ext = src.suffix.lower()
                if ext in {".jpg", ".jpeg"}:
                    if im.mode in ("RGBA", "LA", "P"):
                        im = im.convert("RGB")
                    im.save(src, "JPEG", quality=92, optimize=True)
                elif ext == ".png":
                    im.save(src, "PNG", optimize=True)
                else:
                    im.save(src)  # whatever Pillow infers
            written += 1
            try:
                rel = src.relative_to(REPO)
            except ValueError:
                rel = src
            print(f"   ✓ {rel}")
        except Exception as e:
            errors.append((src, str(e)))
            print(f"   ✗ {src.name}: {e}")

    print()
    print(f"Replaced: {written} / {len(planned)}")
    print(f"Errors:   {len(errors)}")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
