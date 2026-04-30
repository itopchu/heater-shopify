#!/usr/bin/env node
/**
 * Apply user renames in catalog/<series>/<color>/<handle>/ back into the
 * product-catalog source-of-truth JSONs.
 *
 * For each product:
 *   1. Walk catalog/<series>/<color>/<handle>/ and list files alphabetically.
 *   2. SHA-256 each file → look up its source URL in catalog/manifest.json.
 *   3. Rebuild photos.cdn_in_canonical_order in that order.
 *   4. Set primary_cdn = first URL, refresh image_count.
 *   5. Mirror to product-catalog/.cache/products/.
 *   6. Update product-catalog/index.json entries (primary_cdn, image_count).
 *
 * No network calls. Fully reversible (git checkout).
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const PRODUCTS_DIR = join(ROOT, "product-catalog", "products");
const CACHE_DIR = join(ROOT, "product-catalog", ".cache", "products");
const CATALOG_DIR = join(ROOT, "catalog");
const MANIFEST_PATH = join(CATALOG_DIR, "manifest.json");
const INDEX_PATH = join(ROOT, "product-catalog", "index.json");

function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }
async function exists(p) { try { await stat(p); return true; } catch { return false; } }
function slug(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const bySha = new Map();
  for (const f of manifest.files) if (f.sha256) bySha.set(f.sha256, f);
  console.log(`Manifest: ${bySha.size} entries indexed by sha256.`);

  const productFiles = (await readdir(PRODUCTS_DIR)).filter((f) => f.endsWith(".json")).sort();

  const summary = { updated: 0, unchanged: 0, no_local_dir: 0, missing_files: 0, total_urls: 0 };
  const indexByHandle = new Map();
  const idx = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  for (const e of idx.entries) indexByHandle.set(e.handle, e);

  for (const f of productFiles) {
    const path = join(PRODUCTS_DIR, f);
    const j = JSON.parse(await readFile(path, "utf8"));
    const handle = j.handle || f.replace(/\.json$/, "");
    const series = slug(j.series || "_uncategorized");
    const color = slug(j.color || "_uncolored");
    const dir = join(CATALOG_DIR, series, color, slug(handle));

    if (!(await exists(dir))) { summary.no_local_dir++; continue; }

    const localFiles = (await readdir(dir))
      .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
    if (localFiles.length === 0) { summary.no_local_dir++; continue; }

    const newUrls = [];
    let missingHere = 0;
    for (const name of localFiles) {
      const buf = await readFile(join(dir, name));
      const sh = sha256(buf);
      const rec = bySha.get(sh);
      if (!rec) { missingHere++; continue; }
      newUrls.push(rec.source_url);
    }
    summary.missing_files += missingHere;
    summary.total_urls += newUrls.length;

    if (newUrls.length === 0) { summary.no_local_dir++; continue; }

    const oldUrls = j.photos?.cdn_in_canonical_order || [];
    const same = oldUrls.length === newUrls.length && oldUrls.every((u, i) => u === newUrls[i]);
    if (same) { summary.unchanged++; continue; }

    j.photos = j.photos || {};
    j.photos.cdn_in_canonical_order = newUrls;
    j.photos.primary_cdn = newUrls[0];
    await writeFile(path, JSON.stringify(j, null, 2) + "\n");

    const cachePath = join(CACHE_DIR, f);
    if (await exists(cachePath)) {
      const c = JSON.parse(await readFile(cachePath, "utf8"));
      c.photos = c.photos || {};
      c.photos.cdn_in_canonical_order = newUrls;
      c.photos.primary_cdn = newUrls[0];
      await writeFile(cachePath, JSON.stringify(c, null, 2) + "\n");
    }

    const e = indexByHandle.get(handle);
    if (e) {
      e.primary_cdn = newUrls[0];
      e.image_count = newUrls.length;
    }

    summary.updated++;
    if (summary.updated <= 5) {
      console.log(`  ${handle}: ${oldUrls.length} → ${newUrls.length} URLs, lead = ${newUrls[0].split("/").pop().split("?")[0]}`);
    }
  }

  await writeFile(INDEX_PATH, JSON.stringify(idx, null, 2) + "\n");
  console.log("\nSummary:", summary);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
