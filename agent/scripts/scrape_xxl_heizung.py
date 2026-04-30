#!/usr/bin/env python3
"""
xxl-heizung.de catalog scraper.

Pulls the full G-Berg-relevant catalog from xxl-heizung.de via Shopify's
public JSON endpoints + per-PDP HTML (for breadcrumb + JSON-LD), and writes
a clean per-product record alongside the raw responses.

Why both raw + normalized:
  - raw/  is byte-perfect. Lets us re-derive normalized records offline
          and catch upstream changes via diffs without re-hitting the site.
  - products/{handle}.json is the consumable record for the build pipeline.

Stdlib-only. No dependencies. Tested against Python 3.10+.

Targeted collections (caller can override with --collections):
    badheizkorper, austauschheizkorper, badheizkorper-elektrisch,
    wohnraumheizkorper, bad, fussbodenheizungsrohre, zubehor

Usage:
    python agent/scripts/scrape_xxl_heizung.py                  # full run
    python agent/scripts/scrape_xxl_heizung.py --limit 3        # smoke test
    python agent/scripts/scrape_xxl_heizung.py --skip-existing  # resume
    python agent/scripts/scrape_xxl_heizung.py --force          # re-fetch all
    python agent/scripts/scrape_xxl_heizung.py --collections badheizkorper zubehor

Output tree (under --output-dir, default product-catalog/.cache/):
    index.json
    products/{handle}.json
    raw/products/{handle}.json
    raw/products/{handle}.html
    raw/collections/{coll}.json
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import gzip
import hashlib
import html as html_mod
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


SITE = "https://xxl-heizung.de"
DEFAULT_COLLECTIONS = [
    "badheizkorper",
    "austauschheizkorper",
    "badheizkorper-elektrisch",
    "wohnraumheizkorper",
    "bad",
    "fussbodenheizungsrohre",
    "zubehor",
]
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 "
    "(+gberg-heizung scraper; contact: i.topcu1234567890@gmail.com)"
)

# Known German color tokens we may see in handles/titles. Lowercase keys, canonical
# (TitleCase) values. Order matters: more specific tokens first.
COLOR_TOKENS: list[tuple[str, str]] = [
    ("anthrazit", "Anthrazit"),
    ("schwarz",   "Schwarz"),
    ("weiss",     "Weiß"),
    ("weiß",      "Weiß"),
    ("chrom",     "Chrom"),
    ("bronze",    "Bronze"),
    ("messing",   "Messing"),
    ("kupfer",    "Kupfer"),
    ("gold",      "Gold"),
    ("silber",    "Silber"),
    ("grau",      "Grau"),
    ("beige",     "Beige"),
    ("rot",       "Rot"),
    ("blau",      "Blau"),
    ("gruen",     "Grün"),
    ("grün",      "Grün"),
]


# -------------------------------- HTTP layer --------------------------------

class RateLimited(Exception):
    pass


def http_get(url: str, *, timeout: float = 30.0, retries: int = 5,
             base_delay: float = 0.6) -> bytes:
    """GET a URL with exponential backoff on 429/5xx and gzip handling."""
    last_err: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "*/*",
                "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                if resp.headers.get("Content-Encoding", "").lower() == "gzip":
                    data = gzip.decompress(data)
                return data
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 500, 502, 503, 504):
                # honor Retry-After when present
                retry_after = e.headers.get("Retry-After") if e.headers else None
                wait = float(retry_after) if (retry_after and retry_after.isdigit()) \
                       else base_delay * (2 ** attempt)
                print(f"  ! {e.code} on {url}; backing off {wait:.1f}s "
                      f"(attempt {attempt+1}/{retries})", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = base_delay * (2 ** attempt)
            print(f"  ! {type(e).__name__}: {e}; retrying in {wait:.1f}s",
                  file=sys.stderr)
            time.sleep(wait)
    raise RateLimited(f"GET {url} failed after {retries} attempts: {last_err}")


def fetch_json(url: str) -> Any:
    return json.loads(http_get(url).decode("utf-8"))


def fetch_text(url: str) -> str:
    return http_get(url).decode("utf-8", errors="replace")


# ----------------------------- Collection paging ----------------------------

def fetch_collection(handle: str, *, page_size: int = 250) -> list[dict]:
    """Page through /collections/{h}/products.json until exhausted."""
    out: list[dict] = []
    page = 1
    while True:
        url = f"{SITE}/collections/{handle}/products.json?limit={page_size}&page={page}"
        data = fetch_json(url)
        chunk = data.get("products") or []
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < page_size:
            break
        page += 1
        time.sleep(0.4)
    return out


# ------------------------------ HTML extraction -----------------------------

JSONLD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)


def extract_jsonld_blocks(html: str) -> list[dict]:
    blocks: list[dict] = []
    for m in JSONLD_RE.finditer(html):
        raw = m.group(1).strip()
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, list):
            blocks.extend(o for o in obj if isinstance(o, dict))
        elif isinstance(obj, dict):
            blocks.append(obj)
    return blocks


def jsonld_of_type(html: str, want_type: str) -> dict | None:
    for blk in extract_jsonld_blocks(html):
        t = blk.get("@type")
        if isinstance(t, list):
            if want_type in t:
                return blk
        elif t == want_type:
            return blk
    return None


class _BreadcrumbExtractor(HTMLParser):
    """Pull text from the first <nav class="...breadcrumb..."> in the page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.in_nav = False
        self.parts: list[str] = []
        self._buf: list[str] = []
        self.done = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.done:
            return
        if tag == "nav":
            cls = dict(attrs).get("class", "") or ""
            if "breadcrumb" in cls.lower():
                self.in_nav = True
                self.depth = 1
                return
        if self.in_nav:
            self.depth += 1
            if tag in ("a", "span"):
                self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if not self.in_nav or self.done:
            return
        self.depth -= 1
        if tag in ("a", "span") and self._buf:
            piece = "".join(self._buf).strip()
            if piece and piece not in self.parts:
                self.parts.append(piece)
            self._buf = []
        if tag == "nav" and self.depth <= 0:
            self.done = True
            self.in_nav = False

    def handle_data(self, data: str) -> None:
        if self.in_nav and not self.done:
            self._buf.append(data)


def extract_breadcrumb(html: str) -> list[str]:
    p = _BreadcrumbExtractor()
    try:
        p.feed(html)
    except Exception:
        return []
    # de-dupe consecutive duplicates and filter junk
    cleaned: list[str] = []
    for x in p.parts:
        x = re.sub(r"\s+", " ", x).strip(" >»·")
        if x and (not cleaned or cleaned[-1] != x):
            cleaned.append(x)
    return cleaned


# ----------------------------- body_html parsing ----------------------------

class _HtmlToText(HTMLParser):
    """Quick HTML→text. Preserves rough line breaks at block boundaries."""

    BLOCK_TAGS = {
        "p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "table", "tr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        if tag == "br":
            self.out.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._skip > 0:
            self._skip -= 1
        if tag in self.BLOCK_TAGS:
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        self.out.append(data)


def html_to_text(html: str) -> str:
    p = _HtmlToText()
    try:
        p.feed(html)
    except Exception:
        # Fall back to a cruder strip if the HTML is malformed.
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()
    text = "".join(p.out)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


UL_RE = re.compile(r"<ul\b[^>]*>(.*?)</ul>", re.DOTALL | re.IGNORECASE)
LI_RE = re.compile(r"<li\b[^>]*>(.*?)</li>", re.DOTALL | re.IGNORECASE)


def parse_specs_from_body_html(body_html: str) -> tuple[dict[str, Any], list[str], str]:
    """Parse the spec UL bullets out of body_html.

    Returns (specs_dict, raw_bullet_lines, body_html_with_spec_uls_stripped).

    Spec bullets follow the pattern "Key: Value". Lines without a colon
    are kept under the special "_extras" key as a list (typically certifications,
    PDF links, etc.).
    """
    specs: dict[str, Any] = {}
    raw_lines: list[str] = []
    extras: list[str] = []
    stripped = body_html
    for ul_match in UL_RE.finditer(body_html):
        ul_html = ul_match.group(0)
        items = []
        for li in LI_RE.finditer(ul_match.group(1)):
            text = html_to_text(li.group(1)).strip()
            if not text:
                continue
            text = re.sub(r"\s+", " ", text)
            items.append(text)
        if not items:
            continue
        # Treat as a spec block only if at least one item has a "Key: Value" shape.
        has_kv = any(":" in it and len(it.split(":", 1)[0]) <= 50 for it in items)
        if not has_kv:
            continue
        for line in items:
            raw_lines.append(line)
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip()
                value = value.strip()
                if not key:
                    extras.append(line)
                    continue
                if key in specs:
                    # collide: promote to list
                    if not isinstance(specs[key], list):
                        specs[key] = [specs[key]]
                    specs[key].append(value)
                else:
                    specs[key] = value
            else:
                extras.append(line)
        stripped = stripped.replace(ul_html, "", 1)
    if extras:
        specs["_extras"] = extras
    return specs, raw_lines, stripped


# ------------------------------- inference ----------------------------------

def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def infer_color(handle: str, title: str) -> str | None:
    pool = (handle + " " + title).lower()
    pool = pool.replace("ß", "ss")
    for token, label in COLOR_TOKENS:
        tok = token.replace("ß", "ss")
        if re.search(rf"\b{re.escape(tok)}\b", pool):
            return label
    return None


def infer_model(title: str) -> str | None:
    """Best-effort: longest contiguous ALL-CAPS or Capitalized token in title.

    Radiator product titles consistently include a model name (often in
    UPPERCASE, e.g., 'ASTORIA', 'MIRA', 'PLATON', 'ELANOR'). When that
    pattern is missing, we fall back to None — downstream catalog-merge
    logic should be the source of truth, not the scraper.
    """
    # Prefer all-caps tokens of length >= 3
    caps = re.findall(r"\b[A-ZÄÖÜ]{3,}\b", title)
    if caps:
        # Filter common shouted nouns we don't want as model names.
        ignore = {"XXL", "PDF", "DIN", "EN", "RAL", "TÜV", "ISO"}
        for c in caps:
            if c not in ignore:
                return c
    return None


def _coerce_top_available(js_payload: dict | None, in_stock: int, out_of_stock: int) -> bool | None:
    """Top-level 'is the product available at all?' signal.

    Prefer the .js payload's top-level `available` flag (Shopify computes it
    server-side: True iff at least one variant is in stock). Fall back to the
    per-variant tally if .js wasn't reachable. Return None if we have no
    signal at all.
    """
    if js_payload is not None and "available" in js_payload:
        return js_payload.get("available")
    if in_stock or out_of_stock:
        return in_stock > 0
    return None


def normalize_axis_name(name: str) -> str:
    n = name.strip().lower().replace("×", "x")
    n = n.replace(":", "").strip()
    if "breite" in n and ("höhe" in n or "hoehe" in n):
        return "size_breite_x_hoehe_cm"
    if "höhe" in n and "breite" in n:
        return "size_hoehe_x_breite_cm"
    if "nabenab" in n:
        return "nabenabstand_cm"
    if "auslieferungs" in n:
        return "auslieferungszustand"
    if "anschluss" in n:
        return "anschluss"
    if n.startswith("farbe"):
        return "farbe"
    if "watt" in n:
        return "watt"
    if "form" == n:
        return "form"
    if "liter" in n:
        return "liter"
    if "quetsch" in n:
        return "quetschen"
    if "title" == n:
        return "title"
    return slugify(name).replace("-", "_") or "axis"


# ----------------------------- normalization --------------------------------

def normalize_product(
    raw: dict,
    *,
    pdp_html: str,
    collections_in: list[str],
    primary_collection: str | None,
    js_payload: dict | None = None,
) -> dict:
    handle = raw["handle"]

    images_sorted = sorted(raw.get("images") or [], key=lambda i: i.get("position") or 0)
    images_clean = [
        {
            "position": img.get("position"),
            "src": img.get("src"),
            "width": img.get("width"),
            "height": img.get("height"),
            "alt": img.get("alt"),
            "variant_ids": img.get("variant_ids") or [],
        }
        for img in images_sorted
    ]
    primary_image_src = images_clean[0]["src"] if images_clean else None

    options_clean = []
    for o in raw.get("options") or []:
        options_clean.append(
            {
                "name": o.get("name"),
                "name_normalized": normalize_axis_name(o.get("name") or ""),
                "position": o.get("position"),
                "values": list(o.get("values") or []),
            }
        )

    # Build a stock lookup from the .js payload (more reliable than .json
    # for per-variant `available`; also exposes inventory_management + barcode).
    # Public endpoints never expose exact `inventory_quantity` — that requires
    # Admin API auth, which we don't have on xxl-heizung.
    js_variants_by_id: dict[int, dict] = {}
    if js_payload and isinstance(js_payload.get("variants"), list):
        for jv in js_payload["variants"]:
            if isinstance(jv, dict) and jv.get("id") is not None:
                js_variants_by_id[jv["id"]] = jv

    variants_clean = []
    prices: list[float] = []
    compares: list[float] = []
    in_stock = 0
    out_of_stock = 0
    for v in raw.get("variants") or []:
        fimg = v.get("featured_image") or {}
        try:
            price_f = float(v["price"])
            prices.append(price_f)
        except (KeyError, TypeError, ValueError):
            pass
        cap = v.get("compare_at_price")
        if cap:
            try:
                cap_f = float(cap)
                if cap_f > 0:  # "0.00" means "no compare-at" upstream
                    compares.append(cap_f)
            except (TypeError, ValueError):
                pass

        # Stock signals: prefer .js if present (it's authoritative), fall back
        # to whatever `.json` returned. Both can legitimately be None.
        jv = js_variants_by_id.get(v.get("id")) or {}
        available = jv.get("available")
        if available is None:
            available = v.get("available")
        if available is True:
            in_stock += 1
        elif available is False:
            out_of_stock += 1

        variants_clean.append(
            {
                "id": v.get("id"),
                "sku": v.get("sku"),
                "title": v.get("title"),
                "option1": v.get("option1"),
                "option2": v.get("option2"),
                "option3": v.get("option3"),
                "price": v.get("price"),
                "compare_at_price": v.get("compare_at_price"),
                "available": available,
                "inventory_management": jv.get("inventory_management"),
                "barcode": jv.get("barcode"),
                "grams": v.get("grams") if v.get("grams") is not None else jv.get("weight"),
                "requires_shipping": v.get("requires_shipping"),
                "taxable": v.get("taxable"),
                "featured_image_position": fimg.get("position"),
                "featured_image_src": fimg.get("src"),
            }
        )

    body_html = raw.get("body_html") or ""
    specs, raw_spec_lines, body_html_no_specs = parse_specs_from_body_html(body_html)
    description_text = html_to_text(body_html_no_specs)

    breadcrumb = extract_breadcrumb(pdp_html) if pdp_html else []
    jsonld = jsonld_of_type(pdp_html, "Product") if pdp_html else None

    # Prefer breadcrumb-derived primary collection over first-seen iteration order.
    # E.g., breadcrumb "Heim > Austauschheizkörper > ..." -> "austauschheizkorper"
    # if and only if that collection is one we actually scraped this product from.
    if breadcrumb and len(breadcrumb) >= 2:
        bc_slug = slugify(breadcrumb[1])
        if bc_slug in collections_in:
            primary_collection = bc_slug

    # Detect tags (raw is sometimes a string, sometimes a list)
    tags = raw.get("tags")
    if isinstance(tags, str):
        tags_list = [t.strip() for t in tags.split(",") if t.strip()]
    elif isinstance(tags, list):
        tags_list = list(tags)
    else:
        tags_list = []

    # Stable signature of the upstream data so callers can detect drift.
    sig_payload = json.dumps(
        {"variants": raw.get("variants"), "images": raw.get("images"),
         "body_html": raw.get("body_html"), "options": raw.get("options"),
         "title": raw.get("title")},
        sort_keys=True,
        ensure_ascii=False,
    )
    source_signature = hashlib.md5(sig_payload.encode("utf-8")).hexdigest()

    return {
        "handle": handle,
        "url": f"{SITE}/products/{handle}",
        "title": raw.get("title"),
        "title_clean": unicodedata.normalize("NFC", raw.get("title") or ""),
        "vendor": raw.get("vendor"),
        "product_type": raw.get("product_type") or None,
        "tags": tags_list,
        "collections": collections_in,
        "primary_collection": primary_collection,
        "breadcrumb": breadcrumb,
        "model_inferred": infer_model(raw.get("title") or ""),
        "color_inferred": infer_color(handle, raw.get("title") or ""),
        "options": options_clean,
        "variants": variants_clean,
        "images": images_clean,
        "primary_image_src": primary_image_src,
        "image_count": len(images_clean),
        "variant_count": len(variants_clean),
        "available": _coerce_top_available(js_payload, in_stock, out_of_stock),
        "in_stock_variants": in_stock,
        "out_of_stock_variants": out_of_stock,
        "stock_unknown_variants": len(variants_clean) - in_stock - out_of_stock,
        "specs": specs,
        "specs_raw_lines": raw_spec_lines,
        "description_html": body_html_no_specs.strip(),
        "description_text": description_text,
        "body_html_raw": body_html,
        "jsonld_product": jsonld,
        "price_min": min(prices) if prices else None,
        "price_max": max(prices) if prices else None,
        "compare_at_min": min(compares) if compares else None,
        "compare_at_max": max(compares) if compares else None,
        "currency": "EUR",
        "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source_url": f"{SITE}/products/{handle}",
        "source_signature": source_signature,
    }


# --------------------------------- main -------------------------------------

def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--output-dir", type=Path,
                        default=Path("product-catalog") / ".cache",
                        help="Where to write output (default product-catalog/.cache/)")
    parser.add_argument("--collections", nargs="+", default=DEFAULT_COLLECTIONS,
                        help="Shopify collection handles to scrape")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after N unique products (0 = no limit). "
                             "Useful for smoke testing.")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip handles that already have a normalized record.")
    parser.add_argument("--force", action="store_true",
                        help="Re-fetch and overwrite even if record exists.")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds between PDP/HTML requests (politeness).")
    parser.add_argument("--only-handles", nargs="+", default=None,
                        help="Only scrape these specific product handles.")
    args = parser.parse_args()

    out = args.output_dir
    raw_p = out / "raw" / "products"
    raw_c = out / "raw" / "collections"
    norm_p = out / "products"
    for d in (raw_p, raw_c, norm_p):
        d.mkdir(parents=True, exist_ok=True)

    print(f"==> Output dir: {out}")
    print(f"==> Collections: {', '.join(args.collections)}")

    # 1. Collection sweep — gives us the (handle -> [collections]) map and raw caches.
    handle_to_collections: dict[str, list[str]] = {}
    handle_to_raw_listing: dict[str, dict] = {}
    handle_first_seen: dict[str, str] = {}
    for coll in args.collections:
        print(f"==> Fetching collection {coll}")
        try:
            products = fetch_collection(coll)
        except Exception as e:
            print(f"  ! collection {coll} failed: {e}", file=sys.stderr)
            continue
        write_json(raw_c / f"{coll}.json", {"products": products})
        print(f"    {len(products)} products in {coll}")
        for p in products:
            h = p["handle"]
            handle_to_collections.setdefault(h, []).append(coll)
            handle_to_raw_listing.setdefault(h, p)
            handle_first_seen.setdefault(h, coll)
        time.sleep(args.delay)

    handles = sorted(handle_to_collections.keys())
    if args.only_handles:
        wanted = set(args.only_handles)
        handles = [h for h in handles if h in wanted]
    if args.limit and args.limit > 0:
        handles = handles[: args.limit]

    print(f"==> {len(handles)} unique products to process")

    # 2. Per-product fetch.
    index: list[dict] = []
    for i, handle in enumerate(handles, 1):
        norm_path = norm_p / f"{handle}.json"
        if norm_path.exists() and args.skip_existing and not args.force:
            print(f"  [{i:>3}/{len(handles)}] skip   {handle}")
            try:
                index.append(json.loads(norm_path.read_text(encoding="utf-8")))
            except Exception:
                pass
            continue

        # Fetch full product JSON (richer than collection listing on some fields).
        prod_url = f"{SITE}/products/{handle}.json"
        prod_js_url = f"{SITE}/products/{handle}.js"
        pdp_url = f"{SITE}/products/{handle}"
        print(f"  [{i:>3}/{len(handles)}] fetch  {handle}")
        try:
            raw_json = fetch_json(prod_url)
        except Exception as e:
            print(f"    ! product JSON failed: {e}", file=sys.stderr)
            # fallback: use the listing entry
            raw_json = {"product": handle_to_raw_listing.get(handle, {})}
        write_json(raw_p / f"{handle}.json", raw_json)
        time.sleep(args.delay)

        # The .js endpoint exposes per-variant `available`, inventory_management,
        # and barcode — none of which are reliably present on .json.
        # Quantities are NOT exposed publicly (Admin API only).
        js_payload: dict | None = None
        try:
            js_payload = fetch_json(prod_js_url)
        except Exception as e:
            print(f"    ! product .js failed: {e}", file=sys.stderr)
        if js_payload is not None:
            write_json(raw_p / f"{handle}.js.json", js_payload)
        time.sleep(args.delay)

        try:
            pdp_html = fetch_text(pdp_url)
        except Exception as e:
            print(f"    ! PDP HTML failed: {e}", file=sys.stderr)
            pdp_html = ""
        if pdp_html:
            (raw_p / f"{handle}.html").write_text(pdp_html, encoding="utf-8")
        time.sleep(args.delay)

        norm = normalize_product(
            raw_json["product"],
            pdp_html=pdp_html,
            collections_in=handle_to_collections.get(handle, []),
            primary_collection=handle_first_seen.get(handle),
            js_payload=js_payload,
        )
        write_json(norm_path, norm)
        index.append(norm)

    # 3. Write a slim index.
    slim = [
        {
            "handle": p["handle"],
            "title": p.get("title"),
            "url": p.get("url"),
            "primary_collection": p.get("primary_collection"),
            "collections": p.get("collections"),
            "model_inferred": p.get("model_inferred"),
            "color_inferred": p.get("color_inferred"),
            "options": [o["name"] for o in p.get("options", [])],
            "variant_count": p.get("variant_count"),
            "image_count": p.get("image_count"),
            "primary_image_src": p.get("primary_image_src"),
            "available": p.get("available"),
            "in_stock_variants": p.get("in_stock_variants"),
            "out_of_stock_variants": p.get("out_of_stock_variants"),
            "stock_unknown_variants": p.get("stock_unknown_variants"),
            "price_min": p.get("price_min"),
            "price_max": p.get("price_max"),
            "compare_at_min": p.get("compare_at_min"),
            "compare_at_max": p.get("compare_at_max"),
            "fetched_at": p.get("fetched_at"),
            "source_signature": p.get("source_signature"),
        }
        for p in index
    ]
    write_json(out / "index.json",
               {"site": SITE, "collections": args.collections,
                "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "total_products": len(slim),
                "products": slim})

    # 4. Summary report.
    print()
    print(f"==> Done. {len(slim)} products in {out}")
    multi_coll = [p for p in slim if len(p.get("collections", [])) > 1]
    print(f"    products in multiple collections: {len(multi_coll)}")
    no_color = [p for p in slim if not p.get("color_inferred")]
    print(f"    products with no inferred color: {len(no_color)}")
    no_img = [p for p in slim if (p.get("image_count") or 0) == 0]
    if no_img:
        print(f"    !! products with zero images: {len(no_img)}")
        for p in no_img[:10]:
            print(f"       - {p['handle']}")
    sold_out = [p for p in slim if p.get("available") is False]
    print(f"    products fully sold-out (no in-stock variants): {len(sold_out)}")
    for p in sold_out[:20]:
        print(f"       - {p['handle']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
