#!/usr/bin/env node
/**
 * Extract base64-embedded images from docs/qa-feedback.md into /tmp
 * so they can be viewed individually. Read-only; non-destructive.
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const SRC = resolve('docs/qa-feedback.md');
const OUT = resolve('data/qa-images');
if (!existsSync(OUT)) mkdirSync(OUT, {recursive: true});

const txt = readFileSync(SRC, 'utf8');
const re = /^\[image(\d+)\]:\s*<data:image\/(png|jpe?g|gif|webp);base64,([^>]+)>/gmi;
let m;
let count = 0;
while ((m = re.exec(txt)) !== null) {
  const [, n, ext, b64] = m;
  const path = resolve(OUT, `image${n}.${ext}`);
  writeFileSync(path, Buffer.from(b64, 'base64'));
  count++;
}
console.log(`Extracted ${count} images to ${OUT}`);
