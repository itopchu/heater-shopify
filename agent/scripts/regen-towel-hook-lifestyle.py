#!/usr/bin/env python3
"""
Regenerate the secondary "in-use" image for the Towel Hook & Bathrobe
Holder product. The current secondary image renders the hooks as two
tiny dots on an empty wall — the QA reviewer flagged it as
"cuts off the label, makes it unclear what this is."

This script asks Gemini Nano Banana Pro for a NEW image that shows
the same hook installed in its actual use context: clamped onto a
heated bathroom towel-rail with a small hand towel draped over it.
The catalog source 01.webp (white + chrome pair on white background)
is provided as the product reference so the geometry, finish, and
proportions stay faithful.

Output: tmp/towel-hook-regen/<timestamp>/result-<n>.png
Run: python agent/scripts/regen-towel-hook-lifestyle.py
"""
from __future__ import annotations
import base64, json, sys, time, urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

REPO = Path(__file__).resolve().parents[2]
ENV = REPO / ".env.local"
SOURCE = REPO / "catalog" / "zubehor" / "weiss" / \
    "handtuchhaken-bademantelhalter-fur-badheizkorper-in-weiss-oder-chrom" / "01.webp"
OUT_DIR = REPO / "tmp" / "towel-hook-regen" / time.strftime("%Y-%m-%dT%H-%M-%S")
MODELS = ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"]

PROMPT = (
    "Use the reference photograph as the canonical product reference. The "
    "reference shows two small dome-shaped towel hooks (one set in white "
    "powder-coated finish, one set in polished chrome) — each hook is a "
    "knob-and-stem hardware piece that clamps directly onto a horizontal "
    "bar of a heated bathroom towel-rail radiator. Each hook is roughly "
    "5–6 cm in diameter at the dome, with a short cylindrical stem and a "
    "split clamp at the base.\n\n"
    "Render a NEW photorealistic in-use scene, photographed in a calm, "
    "warm, lived-in modern bathroom. The scene must show:\n"
    "• A WHITE powder-coated heated-towel radiator (a tall, slim, vertical "
    "ladder-style bath radiator with thin horizontal rungs) mounted on a "
    "warm off-white plastered wall.\n"
    "• ONE pair of the WHITE hook (matching the reference) clamped onto a "
    "horizontal rung of that radiator, near the upper third of the frame, "
    "clearly readable as a hook with its dome and stem visible.\n"
    "• A small folded HAND TOWEL or face towel in soft natural cotton "
    "draped over the hook so the use case is unmistakable. The towel "
    "must NOT obscure the hook — at least the dome and stem must remain "
    "clearly visible.\n"
    "• Subtle bathroom context in the background: hint of warm honey-oak "
    "floor at the bottom, soft natural daylight from off-frame, perhaps "
    "the edge of a folded towel on a low oak shelf or the corner of a "
    "wall-mounted mirror — but NOTHING that competes with the hook for "
    "attention.\n\n"
    "COMPOSITION RULES:\n"
    "• The hook is the visual subject — at least 25% of the frame's "
    "shorter edge in apparent size. NOT a tiny dot in a wide room.\n"
    "• Tight to medium-tight crop. The radiator fills most of the right "
    "half of the frame; the hook + towel sit at eye level near the rule "
    "of thirds intersection.\n"
    "• Aspect ratio: SQUARE (1:1) to match the reference and the rest of "
    "the catalog gallery.\n\n"
    "ABSOLUTELY PRESERVE — pixel-faithful to the reference:\n"
    "• The hook's exact shape — dome top, short stem, split clamp at base. "
    "No changes to silhouette, no added decoration.\n"
    "• Pure WHITE finish on the rendered hook (this product PDP is for the "
    "white variant). Do not render the chrome variant in the new image.\n"
    "• Realistic plastic/powder-coat surface — slightly satin, not glossy "
    "wet-look, not matte chalky. Same finish as the white pair shown in "
    "the upper right of the reference.\n\n"
    "AVOID:\n"
    "• Text, watermarks, badges, dimensional callouts, arrows, brand "
    "labels.\n"
    "• A wide empty room shot. The previous attempt failed exactly this "
    "way — hook too small, room dominates.\n"
    "• Saturated colors. Keep the palette warm-neutral: off-white wall, "
    "honey oak, soft cotton white. The white hook should read as the "
    "brightest white in the frame.\n"
    "• Product distortions, extra hooks, more than one pair, or hooks "
    "floating without a radiator bar to clamp onto.\n"
    "• A studio cyclorama. This is a real-bathroom in-use scene.\n\n"
    "Photorealistic interior photography, soft natural daylight, shallow "
    "but not extreme depth of field, square 1:1 frame."
)


def load_env(name: str) -> str:
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"{name} missing from .env.local")


def post(model: str, key: str, body: dict) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {msg[:600]}")


def call(model: str, key: str, image_bytes: bytes, prompt: str) -> dict:
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/jpeg",
                             "data": base64.b64encode(image_bytes).decode("ascii")}},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    return post(model, key, body)


def extract_images(resp: dict) -> list[bytes]:
    out: list[bytes] = []
    for cand in resp.get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            inline = part.get("inline_data") or part.get("inlineData")
            if inline and inline.get("data"):
                out.append(base64.b64decode(inline["data"]))
    return out


def main() -> int:
    if not SOURCE.exists():
        sys.exit(f"Source not found: {SOURCE}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    api_key = load_env("GOOGLE_API_KEY")
    img_bytes = SOURCE.read_bytes()
    print(f"→ source: {SOURCE.relative_to(REPO)} ({len(img_bytes)} bytes)")
    print(f"  out: {OUT_DIR.relative_to(REPO)}")
    last_err = None
    for model in MODELS:
        try:
            print(f"\n  model: {model} …", flush=True)
            resp = call(model, api_key, img_bytes, PROMPT)
            (OUT_DIR / f"response-{model}.json").write_text(
                json.dumps(resp, indent=2), encoding="utf-8"
            )
            imgs = extract_images(resp)
            if not imgs:
                print(f"    ✗ {model}: no images in response")
                continue
            for i, b in enumerate(imgs):
                p = OUT_DIR / f"result-{model}-{i+1}.png"
                p.write_bytes(b)
                print(f"    ✓ wrote {p.relative_to(REPO)} ({len(b)} bytes)")
            return 0
        except Exception as e:
            last_err = e
            print(f"    ✗ {model}: {e}")
    sys.exit(f"All models failed. Last: {last_err}")


if __name__ == "__main__":
    main()
