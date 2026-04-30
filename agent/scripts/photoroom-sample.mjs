#!/usr/bin/env node
// PhotoRoom v2 Edit API sample test.
//
// Picks a small set of catalog images, sends each through PhotoRoom with a few
// candidate background prompts, and saves the results to tmp/photoroom-samples/
// for human eyeballing. Uses the SANDBOX key by default (free, watermarked).
//
// Usage:
//   node agent/scripts/photoroom-sample.mjs                  # sandbox, default samples
//   node agent/scripts/photoroom-sample.mjs --live           # uses live key (BILLABLE)
//   node agent/scripts/photoroom-sample.mjs --only=astoria   # filter samples by series
//
// Docs: https://www.photoroom.com/api/docs/reference/9d149d05a7d36-edit-an-image

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
loadEnv({ path: resolve(repoRoot, '.env.local') });

const args = new Set(process.argv.slice(2));
const useLive = args.has('--live');
const onlyArg = [...args].find((a) => a.startsWith('--only='));
const onlySeries = onlyArg ? onlyArg.split('=')[1].toLowerCase() : null;

const apiKey = useLive ? process.env.PHOTOROOM_LIVE_KEY : process.env.PHOTOROOM_SANDBOX_KEY;
if (!apiKey) {
  console.error(`Missing ${useLive ? 'PHOTOROOM_LIVE_KEY' : 'PHOTOROOM_SANDBOX_KEY'} in .env.local`);
  process.exit(1);
}

const ENDPOINT = 'https://image-api.photoroom.com/v2/edit';

// --- Sample products: one per color, picked to cover the typical product look.
const SAMPLES = [
  {
    label: 'astoria-weiss',
    series: 'astoria',
    image: 'catalog/astoria/weiss/badheizkorper-alpha-weiss-handtuchtrockner/01.jpg',
  },
  {
    label: 'astoria-anthrazit',
    series: 'astoria',
    image: 'catalog/astoria/anthrazit/austauschheizkorper-badheizkorper-anthrazit-alpha/01.jpg',
  },
  {
    label: 'elanor-schwarz',
    series: 'elanor',
    image: 'catalog/elanor/schwarz/austausch-badheizkorper-handtuchheizkorper-schwarz-elanor-seitlich-offen-kopie/01.jpg',
  },
];

// --- Candidate background prompts.
// Constraint: the radiator is the only object in frame. No furniture, no decor,
// no competing textures. Plain matte walls, calm even light, neutral floor.
const PROMPTS = [
  {
    slug: 'studio-minimal',
    text: 'empty minimalist interior, smooth matte off-white plaster wall, no furniture, no decor, no windows, no objects, polished light grey concrete floor, soft even diffused studio lighting, photorealistic architectural rendering, the only object in the room is the towel radiator',
  },
  {
    slug: 'showroom-warm',
    text: 'clean modern product showroom, plain matte warm beige painted wall, no furniture, no plants, no artwork, no other objects, light oak wood floor with no reflection, soft directional daylight from off-frame, photorealistic, calm and minimal, the radiator is the single focal subject',
  },
  {
    slug: 'gallery-grey',
    text: 'minimalist gallery interior, plain matte light grey wall with subtle micro-texture but no patterns, no windows, no furniture, no art, no other objects, smooth pale concrete floor, soft uniform overhead lighting, photorealistic, hero product photography composition, only the radiator is visible',
  },
];

async function callPhotoRoom({ imagePath, prompt }) {
  const buf = await readFile(imagePath);
  const blob = new Blob([buf], { type: 'image/jpeg' });

  const form = new FormData();
  form.append('imageFile', blob, 'input.jpg');
  form.append('background.prompt', prompt);
  form.append('outputSize', 'originalImage');
  // Keep the heater proportional with a little breathing room around it.
  form.append('padding', '0.1');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, accept: 'image/png, application/json' },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PhotoRoom ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) {
    const body = await res.text();
    throw new Error(`Unexpected content-type ${ct}: ${body.slice(0, 400)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const samples = onlySeries ? SAMPLES.filter((s) => s.series === onlySeries) : SAMPLES;
  if (!samples.length) {
    console.error(`No samples matched --only=${onlySeries}`);
    process.exit(1);
  }

  const outRoot = resolve(repoRoot, 'tmp', 'photoroom-samples');
  await mkdir(outRoot, { recursive: true });

  console.log(`PhotoRoom v2 Edit — ${samples.length} sample(s) × ${PROMPTS.length} prompt(s) = ${samples.length * PROMPTS.length} call(s)`);
  console.log(`Mode: ${useLive ? 'LIVE (billable)' : 'SANDBOX (free, watermarked)'}\n`);

  let ok = 0;
  let fail = 0;
  const t0 = Date.now();

  for (const sample of samples) {
    const inPath = resolve(repoRoot, sample.image);
    if (!existsSync(inPath)) {
      console.log(`  [skip] ${sample.label}: missing ${sample.image}`);
      continue;
    }
    const outDir = resolve(outRoot, sample.label);
    await mkdir(outDir, { recursive: true });
    // Copy the original alongside the variants so the comparison is one folder.
    await writeFile(resolve(outDir, '00-original.jpg'), await readFile(inPath));

    for (const p of PROMPTS) {
      const outPath = resolve(outDir, `${p.slug}.png`);
      const t = Date.now();
      try {
        const png = await callPhotoRoom({ imagePath: inPath, prompt: p.text });
        await writeFile(outPath, png);
        const ms = Date.now() - t;
        const kb = (png.length / 1024).toFixed(0);
        console.log(`  ✓ ${sample.label} / ${p.slug}  (${ms} ms, ${kb} KB)`);
        ok += 1;
      } catch (err) {
        console.log(`  ✗ ${sample.label} / ${p.slug}  — ${err.message}`);
        fail += 1;
      }
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s. ${ok} ok, ${fail} failed.`);
  console.log(`Outputs: tmp/photoroom-samples/<label>/<prompt-slug>.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
