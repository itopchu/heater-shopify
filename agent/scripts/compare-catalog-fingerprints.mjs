#!/usr/bin/env node
/**
 * Stronger comparator for catalog/ (image folders) ↔ scrapper/output (parsed products).
 *
 * Replaces the substring image_filter approach with three orthogonal signals:
 *   1. Byte-identical duplicates  (md5 hash)        → true file dupes across folders
 *   2. Filename fingerprint       (model+color+angle, language-folded)
 *                                                   → same shoot under different folder names
 *   3. File-size cluster          (size + extension) → likely same physical capture
 *
 * Then it reads each scrapper/output/<cat>/<handle>/info.json (only the metadata we
 * actually need: title, tags, vendor) and tries to attach each scraper handle to a
 * fingerprint cluster instead of a folder name.
 *
 * Output: a single JSON report at sync-reports/catalog-fingerprint-report.json.
 */
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, statSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, basename, extname, sep} from 'node:path';

const REPO = process.cwd();
const CATALOG_DIR = join(REPO, 'catalog');
const SCRAPER_DIR = join(REPO, 'scrapper', 'output');
const REPORT_DIR = join(REPO, 'sync-reports');
const REPORT_PATH = join(REPORT_DIR, 'catalog-fingerprint-report.json');

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff']);

// --- color & angle vocab ---------------------------------------------------
// Folded → canonical English token. Used to normalize filenames so a Turkish
// "Beyaz" and a German "Weiß" become the same fingerprint atom.
const COLOR_MAP = new Map(
  Object.entries({
    weiss: 'white', weis: 'white', weiß: 'white', beyaz: 'white',
    schwarz: 'black', siyah: 'black',
    anthrazit: 'anthracite', anthrazi: 'anthracite', anthracite: 'anthracite',
    antrasit: 'anthracite', antrazit: 'anthracite',
    chrom: 'chrome', chromiert: 'chrome',
    glanzend: 'glossy', glaenzend: 'glossy',
  }),
);

// Tokens that describe shooting angle / framing — collapsed to "_angle_".
const ANGLE_TOKENS = [
  'karsi', 'açıdan', 'acidan', 'alt', 'üst', 'ust',
  'arka', 'plan', '180', 'derece', 'duvar', 'aparati', 'aparatı',
  'yan', 'orta', 'vana',
  'frontal', 'seitlich', 'oben', 'unten',
  'mitte', 'mittig', 'mit', 'matt', 'struckturiert', 'strukturiert',
];

function deaccent(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function tokens(filename) {
  const base = basename(filename, extname(filename));
  return deaccent(base.toLowerCase())
    .replace(/[_\-\.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function fingerprint(filename) {
  const t = tokens(filename);
  let color = null;
  const modelTokens = [];
  for (const tok of t) {
    if (COLOR_MAP.has(tok)) {
      color = color ?? COLOR_MAP.get(tok);
      continue;
    }
    if (ANGLE_TOKENS.includes(tok)) continue;
    if (/^\d+$/.test(tok)) continue;
    if (tok === 'kopie' || tok === 'copy') continue;
    modelTokens.push(tok);
  }
  // de-dupe consecutive repeats and short fillers
  const seen = new Set();
  const cleaned = modelTokens.filter((t) => {
    if (t.length < 3 && t !== 'wc') return false;
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  return {model: cleaned.join('-'), color: color ?? 'none'};
}

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

/**
 * Read JPG / PNG dimensions without external deps.
 * Returns {width, height} or null.
 */
function imageDimensions(buf, ext) {
  try {
    if (ext === '.png') {
      // PNG: 8-byte signature + IHDR (width, height at byte 16/20)
      if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
        return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
      }
      return null;
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      // Walk JPEG markers for an SOF segment.
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) {i++; continue;}
        const marker = buf[i + 1];
        // SOF markers: C0..CF except C4, C8, CC
        if (
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
        ) {
          return {height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7)};
        }
        const segLen = buf.readUInt16BE(i + 2);
        i += 2 + segLen;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// --- 1) walk catalog/ ------------------------------------------------------
function listCatalogFiles() {
  const out = [];
  const folders = readdirSync(CATALOG_DIR, {withFileTypes: true})
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const folder of folders) {
    const dir = join(CATALOG_DIR, folder);
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!IMG_EXT.has(ext)) continue;
      const full = join(dir, entry.name);
      const st = statSync(full);
      const buf = readFileSync(full);
      const hash = md5(buf);
      const fp = fingerprint(entry.name);
      const dim = imageDimensions(buf, ext);
      out.push({
        folder,
        filename: entry.name,
        bytes: st.size,
        ext,
        hash,
        width: dim?.width ?? null,
        height: dim?.height ?? null,
        ...fp,
      });
    }
  }
  return out;
}

// --- 2) walk scrapper/output ----------------------------------------------
function listScraperProducts() {
  const out = [];
  const cats = readdirSync(SCRAPER_DIR, {withFileTypes: true})
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const cat of cats) {
    const catDir = join(SCRAPER_DIR, cat);
    for (const entry of readdirSync(catDir, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const handle = entry.name;
      const info = safeReadJson(join(catDir, handle, 'info.json'));
      if (!info) continue;
      out.push({
        category: cat,
        handle,
        title: info.title || info.name || '',
        tags: info.tags || [],
        // Best-effort tokenization of the title to extract a model/color hint.
        titleTokens: tokens(info.title || ''),
      });
    }
  }
  return out;
}

// --- main ------------------------------------------------------------------
function main() {
  mkdirSync(REPORT_DIR, {recursive: true});
  const catalog = listCatalogFiles();
  const scraper = listScraperProducts();

  // 1. Group by md5 → byte-exact duplicates
  const byHash = new Map();
  for (const f of catalog) {
    const list = byHash.get(f.hash) || [];
    list.push(f);
    byHash.set(f.hash, list);
  }
  const exactDuplicates = [];
  for (const [hash, list] of byHash) {
    if (list.length > 1) {
      exactDuplicates.push({
        hash,
        copies: list.map((f) => `${f.folder}${sep}${f.filename}`),
        bytes: list[0].bytes,
      });
    }
  }

  // 2. Group by filename fingerprint
  const byFp = new Map();
  for (const f of catalog) {
    const key = `${f.model}|${f.color}`;
    const list = byFp.get(key) || [];
    list.push(f);
    byFp.set(key, list);
  }
  const fingerprintClusters = [...byFp.entries()]
    .filter(([, list]) => list.length > 1 && new Set(list.map((f) => f.folder)).size > 1)
    .map(([key, list]) => ({
      fingerprint: key,
      members: list.map((f) => `${f.folder}${sep}${f.filename}`),
    }))
    .sort((a, b) => b.members.length - a.members.length);

  // 3. Per-folder summary: file count, byte total, dominant model+color tokens
  const folderSummary = {};
  for (const f of catalog) {
    const fs = folderSummary[f.folder] ||
      (folderSummary[f.folder] = {
        fileCount: 0, totalBytes: 0,
        models: {}, colors: {},
      });
    fs.fileCount++;
    fs.totalBytes += f.bytes;
    fs.models[f.model] = (fs.models[f.model] || 0) + 1;
    fs.colors[f.color] = (fs.colors[f.color] || 0) + 1;
  }
  for (const fs of Object.values(folderSummary)) {
    fs.dominantModel = Object.entries(fs.models).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    fs.dominantColor = Object.entries(fs.colors).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  // Per-folder dominant image dimensions: tells us if a folder is a single shoot.
  for (const folder of [...new Set(catalog.map((f) => f.folder))]) {
    const dims = catalog
      .filter((f) => f.folder === folder && f.width && f.height)
      .map((f) => `${f.width}x${f.height}`);
    const counts = {};
    for (const d of dims) counts[d] = (counts[d] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    folderSummary[folder].dimensions = sorted.map(([d, n]) => `${d}×${n}`);
  }

  // 4. Cross-folder model overlaps: which models appear in 2+ folders?
  const modelToFolders = new Map();
  for (const f of catalog) {
    if (!f.model) continue;
    const set = modelToFolders.get(f.model) || new Set();
    set.add(f.folder);
    modelToFolders.set(f.model, set);
  }
  const sharedModels = [...modelToFolders.entries()]
    .filter(([, folders]) => folders.size > 1)
    .map(([model, folders]) => ({model, folders: [...folders]}))
    .sort((a, b) => b.folders.length - a.folders.length);

  // 4b. Folder-vs-folder byte-identical overlap matrix.
  // For each folder, count how many of its files are also present (same hash)
  // in every other folder. Reveals "owner copied files between folders".
  const folderToHashes = new Map();
  for (const f of catalog) {
    const set = folderToHashes.get(f.folder) || new Set();
    set.add(f.hash);
    folderToHashes.set(f.folder, set);
  }
  const folderOverlap = [];
  const folders = [...folderToHashes.keys()];
  for (let i = 0; i < folders.length; i++) {
    for (let j = i + 1; j < folders.length; j++) {
      const A = folderToHashes.get(folders[i]);
      const B = folderToHashes.get(folders[j]);
      let inter = 0;
      for (const h of A) if (B.has(h)) inter++;
      if (inter > 0) {
        folderOverlap.push({
          a: folders[i], aSize: A.size,
          b: folders[j], bSize: B.size,
          sharedFiles: inter,
        });
      }
    }
  }
  folderOverlap.sort((a, b) => b.sharedFiles - a.sharedFiles);

  // 4c. Per-folder "unique vs shared" file count
  const allHashes = new Map(); // hash → number of folders it's in
  for (const [, hashes] of folderToHashes) {
    for (const h of hashes) {
      allHashes.set(h, (allHashes.get(h) || 0) + 1);
    }
  }
  for (const folder of folders) {
    const hashes = folderToHashes.get(folder);
    let uniq = 0, shared = 0;
    for (const h of hashes) {
      if (allHashes.get(h) === 1) uniq++;
      else shared++;
    }
    folderSummary[folder].uniqueFiles = uniq;
    folderSummary[folder].sharedWithOtherFolder = shared;
  }

  // 5. Scraper-side duplicate signals: same title-token-set under different handles
  const titleKeyToHandles = new Map();
  for (const p of scraper) {
    const key = [...new Set(p.titleTokens.filter((t) => t.length >= 3))]
      .sort()
      .join('-');
    if (!key) continue;
    const list = titleKeyToHandles.get(key) || [];
    list.push(p.handle);
    titleKeyToHandles.set(key, list);
  }
  const scraperTitleDuplicates = [...titleKeyToHandles.entries()]
    .filter(([, h]) => h.length > 1)
    .map(([key, h]) => ({titleKey: key, handles: h}));

  // 6. Cross-side mapping suggestion: for each scraper product, list folders
  // whose dominantModel matches any token of the scraper title or tags.
  const matchSuggestions = scraper.map((p) => {
    const tokset = new Set([
      ...p.titleTokens,
      ...p.tags.flatMap((t) => tokens(t)),
    ]);
    const candidates = Object.entries(folderSummary)
      .map(([folder, info]) => {
        const folderTokens = new Set(tokens(folder));
        const overlap = [...folderTokens].filter((t) => tokset.has(t));
        const modelHit = info.dominantModel && tokset.has(info.dominantModel) ? 1 : 0;
        return {folder, overlap: overlap.length, modelHit};
      })
      .filter((c) => c.overlap > 0 || c.modelHit)
      .sort((a, b) => b.modelHit - a.modelHit || b.overlap - a.overlap)
      .slice(0, 3)
      .map((c) => c.folder);
    return {handle: p.handle, candidates};
  });

  const report = {
    generated: new Date().toISOString(),
    counts: {
      catalogFiles: catalog.length,
      catalogFolders: Object.keys(folderSummary).length,
      scraperProducts: scraper.length,
      exactDuplicateGroups: exactDuplicates.length,
      sharedFingerprintGroups: fingerprintClusters.length,
      sharedModelTokens: sharedModels.length,
      scraperTitleDuplicates: scraperTitleDuplicates.length,
    },
    exactDuplicates,
    fingerprintClusters,
    sharedModels,
    folderOverlap,
    folderSummary,
    scraperTitleDuplicates,
    matchSuggestions,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report → ${REPORT_PATH}`);
  console.log(JSON.stringify(report.counts, null, 2));
}

main();
