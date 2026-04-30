#!/usr/bin/env python3
"""
Test badge removal on a single xxl-heizung lifestyle shot.

Pipeline:
  1. Build a mask covering the oval "Mischbetrieb" badge + the two connector lines.
  2. POST image + mask to Replicate (zylim0702/remove-object — LaMa-based).
  3. Poll for result, download cleaned PNG to tmp/inpaint-test/.

Cost: ~$0.005 per call. One test call total.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
ENV_FILE = REPO / ".env.local"
INPUT = REPO / "tmp" / "discarded-views" / "elanor-schwarz-6.jpg"
OUT_DIR = REPO / "tmp" / "inpaint-test-flux"
# black-forest-labs/flux-fill-pro — structure-aware inpainting, ~$0.04/call.
# Far better than LaMa for reconstructing structured geometry (radiator slats).
MODEL = "black-forest-labs/flux-fill-pro"
MODEL_VERSION = "41c767bcbfffe54ef8f05eb4d0100f9314790f7fc43a7b88d73ec06839deddb9"
PROMPT = (
    "empty wall, clean photographic background, no text, no logo, "
    "no badge, no watermark, no overlay, no symbol"
)


def load_token() -> str:
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("REPLICATE_API_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("REPLICATE_API_TOKEN missing from .env.local")


def build_mask(img: Image.Image) -> Image.Image:
    """Mask the badge oval + the two diagonal connector lines underneath it.

    Geometry tuned by eye for the 2400x2400 elanor-schwarz-6 sample. It's
    deliberately a few percent more generous than the visible badge so that
    the white outer stroke and any soft edges are fully covered.
    """
    w, h = img.size
    mask = Image.new("L", (w, h), 0)  # black = keep, white = inpaint
    d = ImageDraw.Draw(mask)

    # Oval bounding box — covers the full badge with extra padding so the
    # white outer stroke and any soft edges are inside the mask.
    ox0, oy0 = int(w * 0.08), int(h * 0.03)
    ox1, oy1 = int(w * 0.90), int(h * 0.52)
    d.ellipse([ox0, oy0, ox1, oy1], fill=255)

    # Two connector lines from the bottom of the oval down to two points on
    # the radiator. Drawn fat (~5% of width) to cover the line + halo.
    line_w = int(w * 0.05)
    d.line([(int(w * 0.30), int(h * 0.47)), (int(w * 0.22), int(h * 0.78))], fill=255, width=line_w)
    d.line([(int(w * 0.70), int(h * 0.47)), (int(w * 0.78), int(h * 0.80))], fill=255, width=line_w)

    return mask


def to_data_uri(img_bytes: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(img_bytes).decode('ascii')}"


def http_post_json(url: str, token: str, body: dict, prefer_wait: int = 60) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", f"wait={prefer_wait}")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def http_get_json(url: str, token: str) -> dict:
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main() -> int:
    token = load_token()
    if not INPUT.exists():
        sys.exit(f"Test image missing: {INPUT}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    img = Image.open(INPUT).convert("RGB")
    print(f"Input:  {INPUT.relative_to(REPO)}  {img.size[0]}x{img.size[1]}")

    mask = build_mask(img)
    mask_path = OUT_DIR / "mask.png"
    mask.save(mask_path)
    print(f"Mask:   {mask_path.relative_to(REPO)}")

    # Encode for the API.
    img_buf = BytesIO()
    img.save(img_buf, format="JPEG", quality=92)
    img_uri = to_data_uri(img_buf.getvalue(), "image/jpeg")

    mask_buf = BytesIO()
    mask.save(mask_buf, format="PNG")
    mask_uri = to_data_uri(mask_buf.getvalue(), "image/png")

    print(f"\nPOST  {MODEL}  ({MODEL_VERSION[:12]}...)")
    t0 = time.time()
    pred = http_post_json(
        "https://api.replicate.com/v1/predictions",
        token,
        {
            "version": MODEL_VERSION,
            "input": {
                "image": img_uri,
                "mask": mask_uri,
                "prompt": PROMPT,
                "steps": 50,
                "guidance": 30,
                "output_format": "png",
                "safety_tolerance": 5,
            },
        },
        prefer_wait=60,
    )
    print(f"  prediction id: {pred['id']}  status={pred['status']}")

    # Poll if not finished inline.
    while pred["status"] not in ("succeeded", "failed", "canceled"):
        time.sleep(3)
        pred = http_get_json(pred["urls"]["get"], token)
        print(f"  status={pred['status']}", end="\r", flush=True)

    if pred["status"] != "succeeded":
        print(f"\n  ✗ {pred['status']}: {pred.get('error')}")
        (OUT_DIR / "prediction.json").write_text(json.dumps(pred, indent=2))
        return 1

    print(f"  ✓ done in {time.time() - t0:.1f}s")

    out_url = pred.get("output")
    if isinstance(out_url, list):
        out_url = out_url[0] if out_url else None
    if not out_url:
        print(f"  no output URL — see prediction.json")
        (OUT_DIR / "prediction.json").write_text(json.dumps(pred, indent=2))
        return 1

    out_path = OUT_DIR / "result.png"
    urllib.request.urlretrieve(out_url, out_path)
    size_kb = out_path.stat().st_size / 1024
    print(f"\nResult: {out_path.relative_to(REPO)}  ({size_kb:.0f} KB)")

    # Save originals next to the result for easy comparison.
    img.save(OUT_DIR / "00-original.jpg", quality=92)
    print(f"\nCompare:")
    print(f"  {OUT_DIR / '00-original.jpg'}")
    print(f"  {mask_path}")
    print(f"  {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
