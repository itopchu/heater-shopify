#!/usr/bin/env python3
"""
Lifestyle scene generator (Gemini 3 Pro Image Preview / Nano Banana Pro).

For each input product image, renders the same product into a new floor/
wall environment while preserving the product itself, its color, and its
aspect ratio. Decor that doesn't fit the new aesthetic is removed or
replaced for scene coherence.

Usage:
    python nano-banana-test.py                                # default source, all scenes
    python nano-banana-test.py --input p/01.jpg
    python nano-banana-test.py --input dir/ --label last-test
    python nano-banana-test.py oak-and-realistic-wall

Cost: ~$0.14 per generated image (gemini-3-pro-image-preview).
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.request
from pathlib import Path

# Windows default console is cp1252 — force UTF-8 so unicode arrows/checks print.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass


REPO = Path(__file__).resolve().parents[2]
ENV_FILE = REPO / ".env.local"

DEFAULT_INPUT = REPO / "catalog" / "elanor" / "schwarz" / "austausch-badheizkorper-handtuchheizkorper-schwarz-elanor-seitlich-offen-kopie" / "01.jpg"

OUT_ROOT = REPO / "tmp" / "nano-banana-test"

# Pro first; Flash fallback only if Pro is unreachable.
IMAGE_MODELS = ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"]
PRO_COST_PER_IMAGE = 0.14  # empirical session average for Pro generations


SCENE_TEMPLATE = (
    "Take the reference photograph as the input. Render a NEW image with "
    "MINIMAL targeted edits, treating the reference as 90% canonical and "
    "changing only the specified peripheral element.\n\n"
    "ABSOLUTELY PRESERVE — pixel-identical to the reference:\n"
    "• The product itself, whatever it is: same scale, same position in the "
    "frame, same orientation, same color, same finish, every visible "
    "component / part / fitting / accent / surface detail. Nothing may be "
    "removed, added, moved, recolored, simplified, or re-rendered. The "
    "product must not be redrawn from a different angle. Treat the product "
    "region of the reference as a locked layer that is copied through "
    "unchanged.\n"
    "• The product's color and finish are NEVER changed. Whatever color the "
    "reference shows the product to be, the output shows the same. No tint, "
    "no color cast, no warming or cooling of the product must bleed in from "
    "the new floor or wall — the new surroundings change around the "
    "product, but the product's pixels and color stay as they are in the "
    "reference.\n"
    "• A safety buffer of approximately 20 cm of unchanged pixels around the "
    "perimeter of the product. The product's silhouette and the small halo "
    "of pixels right around it stay identical to the reference, so the "
    "lighting on the product and its edge transitions remain seamless even "
    "if the broader wall or floor surface is changed beyond that buffer.\n"
    "• The overall scene type and 'lived-in home' feeling — if the reference "
    "is a bathroom, the output is still recognizably the same kind of "
    "bathroom; if it is a bedroom corner, it stays the same kind of bedroom "
    "corner. Decor in the immediate vicinity of the product (within ~30cm) "
    "stays the same. This is NOT a studio shot.\n"
    "• Lighting direction, color temperature, and overall color grading.\n\n"
    "ASPECT RATIO: The output canvas aspect ratio must EXACTLY match the "
    "input reference image's aspect ratio. Do not crop, pad, letterbox, or "
    "reshape. If the input is square, the output is square; if portrait, "
    "portrait; if landscape, landscape — same dimensions ratio.\n\n"
    "IF THE REFERENCE ALREADY HAS A CLEAN / PLAIN BACKGROUND (e.g. plain "
    "studio backdrop, white cyclorama, no decor, no fixtures, no scene "
    "context), DO NOT invent decor to remove or to add. Simply render the "
    "new floor and wall surfaces around the product in a calm, realistic "
    "way and stop there. The product's existing isolated catalog look is a "
    "valid starting point — your job is to give it a real-room floor and "
    "wall, not to fabricate a bathroom or other context that wasn't there.\n\n"
    "ROOM COMPOSITION VARIETY: Vary the specific room composition naturally "
    "between generations — different far-edge furniture placement, "
    "different window position or size, different small decor accents — so "
    "different products do not all end up looking like the exact same "
    "room. Stay within the warm, residential, lived-in aesthetic, but no "
    "two outputs should be near-identical clones of each other.\n\n"
    "ONLY MODIFY — and only outside the safety buffer — the following "
    "peripheral element of the scene:\n"
    "{scene}\n\n"
    "SCENE COHERENCE — also reconcile decor: After applying the change, "
    "look at every other object visible in the reference (plants, fixtures, "
    "furniture, glassware, vessels, appliances, partial walls, doors, "
    "windows, accessories) that lies OUTSIDE the 20 cm product safety "
    "buffer. For each such object, decide:\n"
    "   – If it still reads naturally with the new floor and wall aesthetic, "
    "leave it untouched.\n"
    "   – If it clashes (e.g. a bathroom-specific fixture in a now warm-"
    "residential setting, a tropical plant in a now refined hotel-marble "
    "setting), either remove it cleanly so the surface behind it is "
    "rendered consistent with the new aesthetic, or replace it with a "
    "single calm, neutral, scale-appropriate object that fits the new "
    "aesthetic.\n"
    "The final image must read as ONE coherent residential interior in the "
    "new aesthetic — never a hybrid of old-source decor and new surfaces.\n"
    "Keep environmental tones soft, neutral and muted; nothing saturated, "
    "no high-contrast patterns, no busy textures. Photorealistic interior "
    "photography. No text, no overlays, no badges, no watermarks. Do not "
    "crop or reposition the product."
)


SCENES: list[tuple[str, str]] = [
    (
        "oak-and-realistic-wall",
        "REPLACE THE FLOOR AND THE WALL TOGETHER: change the floor surface "
        "to wide-plank warm honey-toned oak with a soft matte finish and "
        "visible grain. Repaint the wall in a warm soft off-white tone "
        "with a clearly REALISTIC residential plaster finish — visible "
        "subtle texture, gentle hand-applied trowel marks, soft tonal "
        "variation, faint shadows from ambient light, the kind of wall "
        "that actually lives in a real home rather than a studio backdrop. "
        "Avoid flat uniform paint, avoid plastic-looking smoothness, avoid "
        "any hint of seamless paper. Both surfaces must stay muted, warm, "
        "and neutral so the product stands out without competing for "
        "attention. The wall change should blend seamlessly behind the "
        "product silhouette without a hard edge. The overall aesthetic "
        "shifts to warm, residential, lived-in — reconcile decor "
        "accordingly per the SCENE COHERENCE rule above.",
    ),
]


def load_env(name: str) -> str:
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"{name} missing from .env.local")


def _post(model: str, api_key: str, body: dict) -> dict:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code} {e.reason}: {body_text[:600]}")


def call_gemini(model: str, api_key: str, image_bytes: bytes, prompt: str) -> dict:
    """Image-generation call: one reference image, returns inline image data."""
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }
                    },
                ],
            }
        ],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    return _post(model, api_key, body)


def extract_images(resp: dict) -> list[bytes]:
    out: list[bytes] = []
    for cand in resp.get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            inline = part.get("inline_data") or part.get("inlineData")
            if inline and inline.get("data"):
                out.append(base64.b64decode(inline["data"]))
    return out


def product_slug(input_path: Path) -> str:
    """Derive a stable per-product output dir name from the source path."""
    parts = input_path.resolve().parts
    if "catalog" in parts:
        i = parts.index("catalog")
        tail = parts[i + 1 : -1] if input_path.is_file() else parts[i + 1 :]
        return "_".join(tail) if tail else input_path.parent.name
    return input_path.parent.name if input_path.is_file() else input_path.name


def product_dir_for(input_path: Path) -> Path:
    return OUT_ROOT / product_slug(input_path)


def collect_images(src: Path) -> list[Path]:
    """If src is a file, return [src]. If src is a directory, return all
    image files sorted by name (so 01 < 02 < 03)."""
    if src.is_file():
        return [src]
    if src.is_dir():
        files = sorted(
            p
            for p in src.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"}
            and not p.name.startswith(("00-original", "result-", "response-"))
        )
        if not files:
            sys.exit(f"No images found in directory: {src}")
        return files
    sys.exit(f"Input does not exist or is not a file/dir: {src}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate lifestyle scenes for product images.")
    p.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Source image path or directory (defaults to Elanor 01.jpg). "
        "Pass a directory to process every jpg/png inside it (one output per source).",
    )
    p.add_argument(
        "--label",
        default="",
        help="Optional label appended to output filenames (e.g. --label last-test).",
    )
    p.add_argument(
        "scenes",
        nargs="*",
        help="Optional scene slugs to run (default: all). e.g. oak-and-realistic-wall",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    api_key = load_env("GOOGLE_API_KEY")

    src: Path = args.input
    if not src.exists():
        sys.exit(f"Input does not exist: {src}")

    image_paths = collect_images(src)
    images = [p.read_bytes() for p in image_paths]

    requested = set(args.scenes)
    if requested:
        unknown = requested - {slug for slug, _ in SCENES}
        if unknown:
            sys.exit(f"Unknown scene slug(s): {', '.join(sorted(unknown))}")
        run_scenes = [(s, p) for s, p in SCENES if s in requested]
    else:
        run_scenes = SCENES

    product_dir = product_dir_for(src)
    scene_dir = product_dir / "scene"
    source_dir = product_dir / "source"
    responses_dir = scene_dir / "responses"
    for d in (source_dir, scene_dir, responses_dir):
        d.mkdir(parents=True, exist_ok=True)

    n_calls = len(image_paths) * len(run_scenes)
    print(f"Input:  {len(image_paths)} image(s)")
    for i, p in enumerate(image_paths, 1):
        try:
            rel = p.relative_to(REPO)
        except ValueError:
            rel = p
        print(f"   {i}. {rel}  ({len(images[i-1])/1024:.0f} KB)")
    print(f"Output: {scene_dir.relative_to(REPO)}")
    print(f"Scenes: {len(run_scenes)}; total generations: {n_calls} → ~${PRO_COST_PER_IMAGE * n_calls:.2f}")
    if args.label:
        print(f"Label:  {args.label}")

    # Save originals into source/ (idempotent overwrite).
    for p, b in zip(image_paths, images):
        (source_dir / p.name).write_bytes(b)

    label_suffix = f".{args.label}" if args.label else ""

    successes = 0
    failures: list[str] = []

    for slug, instruction in run_scenes:
        prompt = SCENE_TEMPLATE.format(scene=instruction)
        for img_path, img_bytes in zip(image_paths, images):
            job_id = f"{slug}/{img_path.stem}"
            out_stem = f"result-scene-{slug}-{img_path.stem}"

            used_model = None
            resp = None
            last_err: Exception | None = None
            elapsed = 0.0
            for model in IMAGE_MODELS:
                print(f"\n[{job_id}] POST  {model}")
                t0 = time.time()
                try:
                    resp = call_gemini(model, api_key, img_bytes, prompt)
                    used_model = model
                    elapsed = time.time() - t0
                    break
                except RuntimeError as e:
                    print(f"  ✗ {e}")
                    last_err = e

            if resp is None:
                print(f"  [{job_id}] all models failed: {last_err}")
                failures.append(job_id)
                continue

            (responses_dir / f"{out_stem}{label_suffix}.json").write_text(json.dumps(resp, indent=2))
            out_images = extract_images(resp)
            print(f"  ✓ {used_model}  {elapsed:.1f}s  → {len(out_images)} image(s)")

            if not out_images:
                text = ""
                for cand in resp.get("candidates") or []:
                    for part in (cand.get("content") or {}).get("parts") or []:
                        if part.get("text"):
                            text += part["text"] + "\n"
                print(f"  (no image bytes — see responses/{out_stem}{label_suffix}.json){' / text: ' + text[:300] if text else ''}")
                failures.append(job_id)
                continue

            for i, img in enumerate(out_images, 1):
                suffix = "" if len(out_images) == 1 else f"-{i}"
                out = scene_dir / f"{out_stem}{label_suffix}{suffix}.png"
                out.write_bytes(img)
                print(f"    ↓ {out.name}  ({len(img)/1024:.0f} KB)")
            successes += 1

    print(f"\nDone. {successes}/{n_calls} jobs produced images.")
    if failures:
        print(f"Failed: {', '.join(failures)}")
    return 0 if successes > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
