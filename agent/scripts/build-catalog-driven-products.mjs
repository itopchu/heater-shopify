#!/usr/bin/env node
/**
 * Catalog-as-source-of-truth product manifest builder.
 *
 * Flips the data flow: each catalog/ folder = ONE product. Scraper data is
 * filtered & merged into that folder, supplying:
 *   - size variants (Höhe x Breite + price + SKU)
 *   - description (German)
 *   - tags / feature highlights
 *
 * Color variants come from filenames inside the catalog folder. So a folder
 * like catalog/Twister/ that contains "1 Anthrazit ...", "13 Schwarz ...",
 * "7 Weiß ..." files becomes one product with Farbe ∈ {Anthrazit, Schwarz,
 * Weiß} and Größe ∈ {all sizes from any matched scraper handle}.
 *
 * Naming convention: folder name is the canonical German product name. We
 * skip "Fotos 11.8.25" (Turkish lifestyle imagery, not a product).
 *
 * Output:
 *   data/catalog/catalog-driven-products.json   (the manifest)
 *   sync-reports/catalog-driven-build.json      (per-product diagnostics)
 */
import {existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, basename, extname, relative, sep} from 'node:path';

const REPO = process.cwd();
const CATALOG_DIR = join(REPO, 'catalog');
const SCRAPER_DIR = join(REPO, 'scrapper', 'output');
const JOIN_PATH = join(REPO, 'data', 'catalog-scraper-join.json');
const OUT_DIR = join(REPO, 'data', 'catalog');
const REPORT_DIR = join(REPO, 'sync-reports');
const OUT_PATH = join(OUT_DIR, 'catalog-driven-products.json');
const REPORT_PATH = join(REPORT_DIR, 'catalog-driven-build.json');

const IGNORED_FOLDERS = new Set(['Fotos 11.8.25']);
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// ----- color taxonomy: canonical German label -----
// Single source of truth. We always emit the German variant name (user
// instruction: "stick to the german version which makes it easier for us to
// parse"). Tokens that appear in filenames map to the canonical token.
const COLOR_TOKENS = [
  // anthracite
  {match: /anthrazit|anthrazi|antrasit/i, label: 'Anthrazit'},
  // black
  {match: /schwarz|siyah/i, label: 'Schwarz'},
  // white-glossy → keep distinct from plain white because Shopify variants
  // need disambiguation (Pullman has both Weiß and Weiß glänzend etc.)
  {match: /weiß glänzend|weiss glänzend|weiß glanzend|weiss glanzend|beyaz parlak/i, label: 'Weiß glänzend'},
  // white
  {match: /weiß|weiss|beyaz/i, label: 'Weiß'},
  // chrome
  {match: /chrom/i, label: 'Chrom'},
];

// natural-numeric sort
function natSort(a, b) {
  return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
}

/**
 * Canonical size string. Folds ASCII "x" to Unicode "×", collapses whitespace,
 * trims, and lowercases units (mm). Stops "50 × 160" and "50 x 160" from
 * appearing as two separate Shopify option values.
 */
function normalizeSize(s) {
  if (!s) return s;
  return String(s)
    // Strip baked-in availability text (e.g. "50 × 180 nicht Vorrätig") — stock
    // state is carried by availableForSale, not the value label. Mirrors
    // agent/sync/normalize-option-value.ts; keep the two in sync.
    .replace(
      /\s*[-–—,(/]*\s*(?:nicht\s*vorr(?:ä|ae)tig|nicht\s*verf(?:ü|ue)gbar|nicht\s*lieferbar|ausverkauft|vergriffen|auf\s*anfrage|lieferzeit[^,;)]*|out\s*of\s*stock|sold\s*out|not\s*in\s*stock)\s*\)?\s*$/i,
      '',
    )
    .replace(/\s*[xX×]\s*/g, ' × ')
    .replace(/\s+/g, ' ')
    .replace(/\bMM\b/g, 'mm')
    .trim();
}

function detectColor(filename) {
  for (const c of COLOR_TOKENS) {
    if (c.match.test(filename)) return c.label;
  }
  return null;
}

function listImagesIn(folder) {
  const dir = join(CATALOG_DIR, folder);
  return readdirSync(dir, {withFileTypes: true})
    .filter((e) => e.isFile() && IMG_EXT.has(extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort(natSort);
}

function relImagePath(folder, filename) {
  return `catalog/${folder}/${filename}`.split(sep).join('/');
}

function slugify(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function readScraperInfo(handle) {
  // handle could be in scrapper/output/<Cat>/<handle>/info.json — search all categories
  if (!existsSync(SCRAPER_DIR)) return null;
  for (const cat of readdirSync(SCRAPER_DIR)) {
    const full = join(SCRAPER_DIR, cat, handle, 'info.json');
    if (existsSync(full)) {
      try {return JSON.parse(readFileSync(full, 'utf8'));} catch {return null;}
    }
  }
  return null;
}

// ----- category mapping -----
// Folder name → Shopify-style category tag (German, single source of truth).
// Used to drive collection membership when we re-build for Shopify.
function categoryForFolder(folder) {
  const f = folder.toLowerCase();
  if (f.includes('elektrisch')) {
    if (f.includes('astoria') || f.includes('elanor') || f.includes('flora bad') || f.includes('twister') || f.includes('pullman') || f.includes('premium')) {
      return 'Badheizkörper Elektrisch';
    }
    return 'Heizkörper Elektrisch';
  }
  if (f.includes('austausch')) return 'Austauschheizkörper';
  if (f.includes('flora horizontal') || f.includes('flora vertikal') || f.includes('typ ') || f.includes('skyline')) {
    return 'Wohnraumheizkörper';
  }
  if (f.includes('astoria') || f.includes('elanor') || f.includes('flora bad') || f.includes('twister') || f.includes('pullman') || f.includes('premium')) {
    return 'Badheizkörper';
  }
  if (f.includes('multiblock') || f.includes('heizstab')) return 'Zubehör';
  if (f.includes('hänge')) return 'Bad';
  return 'Sonstiges';
}

function main() {
  mkdirSync(OUT_DIR, {recursive: true});
  mkdirSync(REPORT_DIR, {recursive: true});

  const join_data = JSON.parse(readFileSync(JOIN_PATH, 'utf8'));
  const joinByFolder = new Map();
  for (const p of join_data.products ?? []) {
    if (!p.catalog_folder) continue;
    const list = joinByFolder.get(p.catalog_folder) || [];
    list.push(p);
    joinByFolder.set(p.catalog_folder, list);
  }

  const folders = readdirSync(CATALOG_DIR, {withFileTypes: true})
    .filter((e) => e.isDirectory() && !IGNORED_FOLDERS.has(e.name))
    .map((e) => e.name)
    .sort(natSort);

  const products = [];
  const report = {generated: new Date().toISOString(), perFolder: []};

  for (const folder of folders) {
    const files = listImagesIn(folder);
    if (files.length === 0) continue;

    // 1. Detect colors present in this folder (from filenames)
    const colorsFound = new Set();
    const filesByColor = {};
    for (const fn of files) {
      const color = detectColor(fn) ?? 'Unbekannt';
      colorsFound.add(color);
      (filesByColor[color] ||= []).push(fn);
    }

    // 2. Find scraper handles mapped to this folder
    const matched = (joinByFolder.get(folder) ?? []).filter((p) => p.image_filter !== undefined);
    const scraperByColor = {};
    const colorFromJoinForHandle = (m) => {
      switch ((m.color ?? '').toLowerCase()) {
        case 'weiss': case 'weiß': return 'Weiß';
        case 'anthrazit': return 'Anthrazit';
        case 'schwarz': return 'Schwarz';
        case 'chrom': return 'Chrom';
        default: return m.color ? m.color.charAt(0).toUpperCase() + m.color.slice(1) : null;
      }
    };
    for (const m of matched) {
      const colorLabel = colorFromJoinForHandle(m);
      const info = readScraperInfo(m.handle);
      if (!info) continue;
      if (colorLabel) scraperByColor[colorLabel] = {join: m, info};
      else scraperByColor['_default'] = {join: m, info};
    }

    // 1b. If filenames carry no colour info (only 'Unbekannt'), promote the
    //     join-file colours into the catalog colour list. A single-color
    //     product (Hänge WC, Typ 22) ends up with one variant axis still.
    if (colorsFound.size === 1 && colorsFound.has('Unbekannt')) {
      const joinColors = matched.map(colorFromJoinForHandle).filter(Boolean);
      if (joinColors.length > 0) {
        const fallbackImages = filesByColor['Unbekannt'] ?? [];
        colorsFound.delete('Unbekannt');
        delete filesByColor['Unbekannt'];
        for (const c of joinColors) {
          colorsFound.add(c);
          // assign all images to every join-color since filenames don't disambiguate
          filesByColor[c] = fallbackImages.slice();
        }
      } else {
        // No join colour either → call it a single-variant product
        const fallback = filesByColor['Unbekannt'] ?? [];
        colorsFound.delete('Unbekannt');
        delete filesByColor['Unbekannt'];
        colorsFound.add('Standard');
        filesByColor['Standard'] = fallback;
        const stand = scraperByColor['_default'] ?? Object.values(scraperByColor).find(Boolean);
        if (stand) scraperByColor['Standard'] = stand;
      }
    }
    const colorList = [...colorsFound].sort(natSort);

    // 3. Pick a "primary" scraper (any) for shared metadata
    const primaryScraper =
      scraperByColor['Weiß'] ?? scraperByColor['Anthrazit'] ?? scraperByColor['Schwarz'] ??
      scraperByColor['_default'] ?? Object.values(scraperByColor)[0];

    // 4. Build size option from union of all matched scraper variants
    const sizeSet = new Set();
    const sizePriceByColor = {};
    for (const [color, entry] of Object.entries(scraperByColor)) {
      if (!entry?.info) continue;
      const info = entry.info;
      sizePriceByColor[color] = {};
      for (const v of info.variants ?? []) {
        const size = normalizeSize(v.option1 ?? v.title);
        if (!size) continue;
        sizeSet.add(size);
        sizePriceByColor[color][size] = {
          price: v.price,
          compareAt: v.compare_at_price,
          sku: v.sku,
          grams: v.grams,
          available: v.available,
        };
      }
    }
    const sizeList = [...sizeSet].sort(natSort);

    // 5. Build variants: cartesian color × size, dropping cells where the
    //    matched scraper for that color doesn't include that size (means
    //    the manufacturer doesn't offer that size in that color).
    const variants = [];
    for (const color of colorList) {
      const colorScraper = scraperByColor[color] ?? primaryScraper;
      for (const size of sizeList) {
        const cell = sizePriceByColor[color]?.[size]
          ?? sizePriceByColor['_default']?.[size]
          ?? null;
        if (!cell) {
          // size only offered in other colors — skip rather than invent a price
          continue;
        }
        variants.push({
          color, size,
          sku: cell.sku,
          price: cell.price,
          compareAtPrice: cell.compareAt && cell.compareAt !== '0.00' ? cell.compareAt : null,
          grams: cell.grams ?? null,
          available: !!cell.available,
        });
      }
    }

    // 6. Build images: per-color ordered lists for the storefront
    const imagesByColor = {};
    for (const c of colorList) {
      imagesByColor[c] = (filesByColor[c] ?? []).map((fn) => relImagePath(folder, fn));
    }
    // Default flat order: white first if present, then the rest in natural sort.
    const imageOrder = [];
    const colorOrderForImages = colorList.slice().sort((a, b) => {
      const rank = (c) => (c === 'Weiß' ? 0 : c === 'Anthrazit' ? 1 : c === 'Schwarz' ? 2 : 3);
      return rank(a) - rank(b);
    });
    for (const c of colorOrderForImages) imageOrder.push(...imagesByColor[c]);

    const handle = slugify(folder);
    const titleDe = folder.replace(/\s+/g, ' ').trim();

    const product = {
      handle,
      title_de: titleDe,
      catalog_folder: folder,
      category: categoryForFolder(folder),
      vendor: 'G-Berg',
      colors: colorList,
      sizes: sizeList,
      options: [
        ...(colorList.length > 1 ? [{name: 'Farbe', values: colorList}] : []),
        ...(sizeList.length > 1 ? [{name: 'Größe', values: sizeList}] : []),
      ],
      variants,
      images: imageOrder,
      images_by_color: imagesByColor,
      image_status: matched.length > 0 ? 'owner_licensed' : 'manual_entry_needed',
      // Carry over any scraper metadata if we have a primary
      description_html_de: primaryScraper?.info?.description_html ?? null,
      description_de: primaryScraper?.info?.description ?? null,
      tags: primaryScraper?.info?.tags ?? [],
      feature_highlights: primaryScraper?.info?.feature_highlights ?? [],
      // Source mapping for traceability
      _source: {
        scraper_handles: matched.map((m) => m.handle),
        primary_scraper_handle: primaryScraper?.join?.handle ?? null,
      },
    };
    products.push(product);

    report.perFolder.push({
      folder,
      files: files.length,
      colorsDetected: colorList,
      scraperHandlesMatched: matched.map((m) => m.handle),
      sizeCount: sizeList.length,
      variantCount: variants.length,
      hasPrimaryScraper: !!primaryScraper,
      imageStatus: product.image_status,
    });
  }

  // Summary
  const summary = {
    catalog_folders_used: products.length,
    total_variants: products.reduce((s, p) => s + p.variants.length, 0),
    products_with_owner_images: products.filter((p) => p.image_status === 'owner_licensed').length,
    products_needing_manual_entry: products.filter((p) => p.image_status === 'manual_entry_needed').length,
    ignored_folders: [...IGNORED_FOLDERS],
    scraper_orphans_dropped: (join_data.products ?? [])
      .filter((p) => !p.catalog_folder)
      .map((p) => p.handle),
  };

  writeFileSync(
    OUT_PATH,
    JSON.stringify({
      _doc: 'Catalog-driven product manifest. catalog/ folder = 1 product. Scraper feeds sizes/prices/copy. Source of truth: this file.',
      _generated: new Date().toISOString(),
      _summary: summary,
      products,
    }, null, 2),
  );
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('Manifest →', relative(REPO, OUT_PATH));
  console.log('Report   →', relative(REPO, REPORT_PATH));
  console.log(JSON.stringify(summary, null, 2));
}

main();
