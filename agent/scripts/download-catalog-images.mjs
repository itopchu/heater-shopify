#!/usr/bin/env node
/**
 * Download all product images referenced by product-catalog/products/*.json
 * into a well-organized catalog/ tree at the repo root.
 *
 * Layout:
 *   catalog/
 *     README.md
 *     manifest.json
 *     <series>/<color>/<handle>/NN.<ext>      (NN = position from cdn_in_canonical_order, zero-padded)
 *
 * Properties:
 *   - Idempotent: skips files already on disk (by path).
 *   - Concurrent: CONCURRENCY parallel downloads.
 *   - Polite: 3 retries with exponential backoff per file.
 *   - Manifest tracks sha256 + bytes + source URL so renames on disk are detectable.
 *
 * Usage:
 *   node agent/scripts/download-catalog-images.mjs            # full run
 *   node agent/scripts/download-catalog-images.mjs --limit 3  # smoke test (3 products)
 *   node agent/scripts/download-catalog-images.mjs --force    # re-download even if present
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const PRODUCTS_DIR = join(ROOT, "product-catalog", "products");
const CATALOG_DIR = join(ROOT, "catalog");
const MANIFEST_PATH = join(CATALOG_DIR, "manifest.json");
const README_PATH = join(CATALOG_DIR, "README.md");

const CONCURRENCY = 6;
const MAX_RETRIES = 3;

const args = new Set(process.argv.slice(2));
const limit = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : null;
})();
const force = args.has("--force");

function slug(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

function extOf(url) {
  try {
    const p = new URL(url).pathname;
    const e = extname(p).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp"].includes(e) ? e : ".jpg";
  } catch {
    return ".jpg";
  }
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadOnce(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "heater-shopify catalog mirror (agent/scripts/download-catalog-images.mjs)",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function downloadWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await downloadOnce(url);
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const wait = 400 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function listProductFiles() {
  const all = await readdir(PRODUCTS_DIR);
  return all.filter((f) => f.endsWith(".json")).sort();
}

async function planDownloads() {
  const files = await listProductFiles();
  const tasks = [];
  let products = 0;

  for (const f of files) {
    if (limit !== null && products >= limit) break;
    const path = join(PRODUCTS_DIR, f);
    const j = JSON.parse(await readFile(path, "utf8"));
    const handle = j.handle || f.replace(/\.json$/, "");
    const urls = j.photos?.cdn_in_canonical_order || [];
    if (urls.length === 0) continue;
    products++;

    const seriesSlug = slug(j.series || "_uncategorized");
    const colorSlug = slug(j.color || "_uncolored");
    const handleSlug = slug(handle);
    const dir = join(CATALOG_DIR, seriesSlug, colorSlug, handleSlug);

    const pad = urls.length >= 100 ? 3 : 2;
    urls.forEach((url, idx) => {
      const position = idx + 1;
      const num = String(position).padStart(pad, "0");
      const ext = extOf(url);
      const local = join(dir, `${num}${ext}`);
      tasks.push({
        handle,
        series: j.series || null,
        color: j.color || null,
        position,
        source_url: url,
        local_path: local,
        rel_path: relative(ROOT, local).replace(/\\/g, "/"),
      });
    });
  }

  return tasks;
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  let lastLog = Date.now();

  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { ok: false, error: e?.message || String(e) };
      }
      done++;
      const now = Date.now();
      if (now - lastLog > 750 || done === total) {
        const pct = Math.round((done / total) * 100);
        process.stdout.write(`\r  ${done}/${total} (${pct}%)  `);
        lastLog = now;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, loop));
  process.stdout.write("\n");
  return results;
}

async function main() {
  console.log("Planning downloads…");
  const tasks = await planDownloads();
  if (tasks.length === 0) {
    console.log("Nothing to do. No URLs in product-catalog/products/*.json photos.cdn_in_canonical_order.");
    return;
  }
  console.log(`  ${tasks.length} files across ${new Set(tasks.map((t) => t.handle)).size} products.`);

  await mkdir(CATALOG_DIR, { recursive: true });

  const results = await runWithConcurrency(
    tasks,
    async (t) => {
      await mkdir(dirname(t.local_path), { recursive: true });
      if (!force && (await fileExists(t.local_path))) {
        const buf = await readFile(t.local_path);
        return { ok: true, skipped: true, sha256: sha256(buf), bytes: buf.length };
      }
      const buf = await downloadWithRetry(t.source_url);
      await writeFile(t.local_path, buf);
      return { ok: true, skipped: false, sha256: sha256(buf), bytes: buf.length };
    },
    CONCURRENCY,
  );

  const ok = results.filter((r) => r?.ok).length;
  const skipped = results.filter((r) => r?.ok && r.skipped).length;
  const failed = results.filter((r) => !r?.ok);
  console.log(`Downloaded: ${ok - skipped}, skipped (already on disk): ${skipped}, failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("First failures:");
    for (const [i, r] of results.entries()) {
      if (!r?.ok) {
        console.log(`  ${tasks[i].rel_path}  ←  ${tasks[i].source_url}\n    ${r?.error}`);
        if (i > 5) break;
      }
    }
  }

  // Manifest
  const manifest = {
    _doc: "Local mirror of xxl-heizung product images. Generated by agent/scripts/download-catalog-images.mjs.",
    _generated: new Date().toISOString(),
    _layout: "<series>/<color>/<handle>/NN.<ext>  — NN is the position in cdn_in_canonical_order (1-based, zero-padded).",
    _note: "After eyeballing, you may rename NN.<ext> → NN-hero.<ext>, NN-detail.<ext>, etc. The manifest re-syncs on next run by reading filenames from disk.",
    totals: {
      products: new Set(tasks.map((t) => t.handle)).size,
      images_planned: tasks.length,
      images_on_disk: ok,
      failed: failed.length,
    },
    files: tasks.map((t, i) => ({
      handle: t.handle,
      series: t.series,
      color: t.color,
      position: t.position,
      source_url: t.source_url,
      local_path: t.rel_path,
      sha256: results[i]?.sha256 || null,
      bytes: results[i]?.bytes || null,
      ok: !!results[i]?.ok,
      error: results[i]?.error || null,
    })),
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Manifest: ${relative(ROOT, MANIFEST_PATH).replace(/\\/g, "/")}`);

  // README (only write if missing — don't overwrite user edits)
  if (!(await fileExists(README_PATH))) {
    const readme = `# catalog/

Local mirror of xxl-heizung product images, organized for human review and selection.

## Layout

\`\`\`
catalog/
  <series>/<color>/<handle>/
    01.jpg
    02.jpg
    ...
\`\`\`

- \`<series>\` — lowercase product series slug (e.g. \`elanor\`, \`twister\`, \`pullman\`).
- \`<color>\` — lowercase color slug (e.g. \`schwarz\`, \`weiss\`, \`anthrazit\`).
- \`<handle>\` — Shopify product handle (matches \`product-catalog/products/<handle>.json\`).
- \`NN.<ext>\` — image, numbered by xxl-heizung's \`cdn_in_canonical_order\` position (1-based, zero-padded).

## Renaming convention

Once you've eyeballed a folder, rename to surface the lead shot:

- \`01-hero.jpg\` — primary product shot used for PLP card and PDP hero.
- \`02-detail.jpg\` — close-up / hardware / connector / valve detail.
- \`03-lifestyle.jpg\` — in-room / styled scene.
- \`04-spec.jpg\` — line drawing / dimensions.

Numbers stay sortable; the suffix is human-readable. The manifest re-syncs on next run.

## Regenerate

\`\`\`
node agent/scripts/download-catalog-images.mjs            # incremental, skips files on disk
node agent/scripts/download-catalog-images.mjs --force    # re-download all
node agent/scripts/download-catalog-images.mjs --limit 3  # first 3 products only (smoke test)
\`\`\`

## Source of truth

URLs are read from \`product-catalog/products/<handle>.json\` → \`photos.cdn_in_canonical_order\`.
The order in that array determines the \`NN\` numbering on disk.

## Git policy

\`catalog/<subdirs>/\` are gitignored (binary, ~60 MB regenerable). \`README.md\` and \`manifest.json\` are tracked.
`;
    await writeFile(README_PATH, readme);
    console.log(`README:   ${relative(ROOT, README_PATH).replace(/\\/g, "/")}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
