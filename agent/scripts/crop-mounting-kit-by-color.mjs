/**
 * Crop the multi-color Mounting Kit group shot into three color-specific
 * sub-images so each colorway gets its own clean PDP photo.
 *
 * Source: catalog/befestigungsset/uncolored/befestigungsset-fur-badheizkorper/01.jpg
 *   1024×1024 group composition with three columns of brackets:
 *     - Left:   Chrome     (~x: 230..420)
 *     - Center: Anthracite (~x: 420..600)
 *     - Right:  White      (~x: 600..880)
 *   The bottom of the frame holds the screws bag and chrome cap nuts —
 *   we keep that area in each crop because it's part of the product
 *   contents.
 *
 * Output to data/mounting-kit-crops/<color>.jpg, square 880×880 with
 * the wall + floor context preserved.
 */
import sharp from 'sharp';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SRC = resolve(ROOT, 'catalog/befestigungsset/uncolored/befestigungsset-fur-badheizkorper/01.jpg');
const OUT_DIR = resolve(ROOT, 'data/mounting-kit-crops');
mkdirSync(OUT_DIR, {recursive: true});

const SOURCE = sharp(SRC);
const meta = await SOURCE.metadata();
console.log(`Source: ${meta.width}x${meta.height}`);

// Frame proportions — measured from the 1024×1024 source. Three 4-bracket
// groups arranged left→right (chrome, anthracite, white) plus chrome cap
// nuts in the bottom-right and a screws bag in the bottom-left.
//
// Crops are narrower than equal thirds to avoid color bleed at the edges
// where adjacent groups touch. Each retains enough wall + floor to feel
// like a deliberate composition rather than a hard zoom.
const H = meta.height;
const CROPS = {
  chrome:     {left: 125, top: 0, width: 280, height: H},
  anthracite: {left: 380, top: 0, width: 240, height: H},
  white:      {left: 660, top: 0, width: 280, height: H},
};

for (const [color, region] of Object.entries(CROPS)) {
  const out = resolve(OUT_DIR, `${color}.jpg`);
  await sharp(SRC)
    .extract(region)
    .resize(900, null, {fit: 'cover'})
    .jpeg({quality: 88})
    .toFile(out);
  console.log(`✓ ${out}`);
}

console.log('\nDone — three color-specific crops written.');
