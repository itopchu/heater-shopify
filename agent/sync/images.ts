/**
 * Regenerates product imagery via Google Gemini (Nano Banana by default).
 *
 * Uses `@google/genai` with model `gemini-2.5-flash-image` (Nano Banana —
 * fast, cheap, strong quality) by default, or `gemini-3-pro-image-preview`
 * (Nano Banana Pro — highest fidelity) for premium runs. Selected via env
 * GEMINI_IMAGE_MODEL. The model accepts a source image + text prompt and
 * returns a newly generated image — perfect for pose/shape-preserving
 * re-renders of the radiator in our own lifestyle context.
 *
 * For each source image URL from xxl-heizung, we:
 *   1. Check a disk manifest (.sync-cache/images/manifest.json) keyed by source URL.
 *      If a Shopify File GID already exists, reuse it — no API call, no upload.
 *   2. Download the source bytes (reference input only — never uploaded to our store).
 *   3. Call Gemini generateContent with the image as inlineData + our prompt.
 *   4. Upload the generated PNG to Shopify Files via stagedUploadsCreate + fileCreate.
 *   5. Record {sourceUrl → fileGid} in the manifest.
 *
 * Hard-caps image generation per run at SyncConfig.imageGenCap.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GoogleGenAI } from '@google/genai';

import type { SyncConfig } from './env.js';
import type { NormalizedProduct } from './types.js';

const CACHE_DIR = resolve(process.cwd(), '.sync-cache', 'images');
const MANIFEST_PATH = resolve(CACHE_DIR, 'manifest.json');

interface Manifest {
  [sourceUrl: string]: { fileGid: string; imageUrl?: string; generatedAt: string; model: string };
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch {
    return {};
  }
}

function saveManifest(m: Manifest): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
// Sprint-3 rework (see docs/sprint-2-findings.md §17). Goals:
//   - Lock aspect ratio so PLP rows align (4:5 portrait — works for both
//     tall radiators and shorter accessories without cropping).
//   - Force PRODUCT FIDELITY using the spec metafields (width/height in cm,
//     RAL/colour, mount style) so Gemini doesn't invent dimensions or
//     hallucinate bottles/lamps in place of the radiator.
//   - Pick a room context per product_type (bathroom / living room / catalog
//     backdrop) instead of letting the model guess.
//   - Hard ban on text, logos, watermarks, brand badges, multi-angle composites.

interface PromptInputs {
  productType: string;
  titleEn: string;
  titleDe: string;
  tags: string[];
  /** custom.width_cm metafield string, e.g. "60" */
  widthCm: string | null;
  /** custom.height_cm metafield string, e.g. "140" */
  heightCm: string | null;
  /** custom.ral_color metafield string, e.g. "Anthrazit" */
  color: string | null;
}

type SceneKind = 'bathroom' | 'living-room' | 'catalog' | 'utility';

function classifyScene(p: PromptInputs): SceneKind {
  const hay = [p.productType, p.titleEn, p.titleDe, ...(p.tags || [])].join(' ').toLowerCase();
  // Towel/bathroom radiators
  if (/(badheiz|handtuch|towel|bathroom|hänge.?wc|haenge.?wc|wc\b|toilet)/.test(hay)) return 'bathroom';
  // Wall-mounted panel radiators for living spaces
  if (/(wohnraum|panel|austausch|renovierung|living.?room|ventilheiz|kompakt)/.test(hay)) return 'living-room';
  // Underfloor pipe / hidden infrastructure → flat catalog backdrop
  if (/(fussboden|fußboden|pe-?rt|rohr|pipe|underfloor)/.test(hay)) return 'utility';
  // Accessories (valves, thermostats, brackets) → studio catalog
  if (/(thermostat|ventil|valve|hahnblock|multiblock|heizstab|befestig|adapter|zubeh)/.test(hay)) return 'catalog';
  return 'living-room';
}

function sceneDescription(kind: SceneKind): string {
  switch (kind) {
    case 'bathroom':
      return 'Modern German bathroom interior. Soft neutral wall (matte white or warm grey large-format porcelain tile), one segment of frosted-glass shower divider just visible at the edge, polished chrome floor drain in the lower corner. The radiator is wall-mounted at standard installation height.';
    case 'living-room':
      return 'Modern German living room. Smooth painted wall in warm off-white or muted greige, light oak engineered flooring meeting the wall in a clean baseboard line. The radiator is wall-mounted under a windowsill height. No furniture in front of the radiator.';
    case 'utility':
      return 'Clean catalog backdrop, seamless soft grey paper, even studio lighting. The pipe / underfloor component is laid out flat or coiled neatly on the surface, fully visible.';
    case 'catalog':
      return 'Clean catalog backdrop, seamless soft warm-white paper sweep, even studio softbox lighting from front-left. The accessory is centered, photographed straight-on, no other props.';
  }
}

function buildPrompt(p: PromptInputs): string {
  const scene = classifyScene(p);
  const productLabel = (p.titleEn || p.titleDe || p.productType || 'radiator').trim();
  const dimsParts: string[] = [];
  if (p.widthCm) dimsParts.push(`${p.widthCm} cm wide`);
  if (p.heightCm) dimsParts.push(`${p.heightCm} cm tall`);
  const dims = dimsParts.length > 0 ? `Approximate dimensions: ${dimsParts.join(', ')}.` : '';
  const colour = p.color ? `Exact colour/finish: ${p.color}.` : '';

  return [
    `Photorealistic single hero product photograph of this exact ${productLabel}.`,
    'PRODUCT FIDELITY (highest priority): preserve the exact silhouette, proportions, panel count, fin pattern, valve hardware, mounting brackets, and surface finish shown in the reference image. Do NOT invent extra panels, change the colour, or substitute a different object.',
    dims,
    colour,
    `SCENE: ${sceneDescription(scene)}`,
    'CAMERA: single straight-on hero shot, eye-level, 4:5 portrait aspect ratio. Even soft daylight, neutral palette, no harsh shadows, no colour cast. The product fills roughly 70% of the frame and is fully in focus, centered.',
    'STRICTLY FORBIDDEN: text overlays, watermarks, logos, brand badges, captions, callouts, dimension labels, price tags, before/after splits, multi-angle composites, collage layouts, alternate-view insets, mirror reflections of the product, people, hands, pets, plants in front of the product, glass bottles, lamps, art frames, decorative clutter on or in front of the product, distorted geometry, extra panels, or any object that is not present in the reference image.',
    'NO PEOPLE. NO TEXT. NO LOGOS. ONE IMAGE. ONE ANGLE.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pull width / height / colour from a normalized product's customMetafields. */
function specsFromMetafields(product: NormalizedProduct): {
  widthCm: string | null;
  heightCm: string | null;
  color: string | null;
} {
  const find = (key: string): string | null => {
    const mf = product.customMetafields.find((m) => m.namespace === 'custom' && m.key === key);
    return mf ? mf.value : null;
  };
  return { widthCm: find('width_cm'), heightCm: find('height_cm'), color: find('ral_color') };
}

async function downloadImage(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`source image GET ${url} → ${res.status}`);
  const arr = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { bytes: Buffer.from(arr), mimeType };
}

async function shopifyGraphql<T>(cfg: SyncConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${cfg.shopifyStore}/admin/api/${cfg.shopifyApiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.shopifyToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/** Poll a MediaImage file until fileStatus=READY, then return its CDN URL. */
async function resolveImageUrl(cfg: SyncConfig, fileGid: string, timeoutMs = 30000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await shopifyGraphql<{
      node: { __typename: string; fileStatus?: string; image?: { url?: string } } | null;
    }>(
      cfg,
      `query ($id: ID!) {
        node(id: $id) {
          __typename
          ... on MediaImage { fileStatus image { url } }
        }
      }`,
      { id: fileGid },
    );
    if (data.node?.fileStatus === 'READY' && data.node.image?.url) {
      return data.node.image.url;
    }
    if (data.node?.fileStatus === 'FAILED') {
      throw new Error(`MediaImage ${fileGid} processing FAILED`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`MediaImage ${fileGid} did not reach READY within ${timeoutMs}ms`);
}

/** Upload a PNG buffer to Shopify Files. Returns the File GID. */
async function uploadToShopifyFiles(cfg: SyncConfig, png: Buffer, filename: string, altText: string): Promise<string> {
  const staged = await shopifyGraphql<{
    stagedUploadsCreate: {
      stagedTargets: Array<{
        url: string;
        resourceUrl: string;
        parameters: Array<{ name: string; value: string }>;
      }>;
    };
  }>(
    cfg,
    `mutation ($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
      }
    }`,
    {
      input: [
        {
          filename,
          mimeType: 'image/png',
          httpMethod: 'POST',
          resource: 'IMAGE',
          fileSize: String(png.length),
        },
      ],
    },
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error('stagedUploadsCreate returned no target');

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([png], { type: 'image/png' }), filename);
  const upRes = await fetch(target.url, { method: 'POST', body: form as any });
  if (!upRes.ok) throw new Error(`staged upload POST ${upRes.status}: ${await upRes.text()}`);

  const file = await shopifyGraphql<{
    fileCreate: {
      files: Array<{ id: string; alt?: string; fileStatus?: string }>;
      userErrors: Array<{ message: string }>;
    };
  }>(
    cfg,
    `mutation ($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id alt fileStatus }
        userErrors { field message }
      }
    }`,
    {
      files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', alt: altText }],
    },
  );
  const errs = file.fileCreate.userErrors;
  if (errs.length) throw new Error(`fileCreate: ${JSON.stringify(errs)}`);
  const gid = file.fileCreate.files[0]?.id;
  if (!gid) throw new Error('fileCreate returned no file id');
  return gid;
}

/** Extract the first inline image from a Gemini generateContent response. */
function extractImageFromResponse(response: unknown): { bytes: Buffer; mimeType: string } {
  const resp = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          text?: string;
        }>;
      };
    }>;
  };
  const parts = resp.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return {
        bytes: Buffer.from(p.inlineData.data, 'base64'),
        mimeType: p.inlineData.mimeType || 'image/png',
      };
    }
  }
  throw new Error('Gemini response contained no inline image');
}

export interface ImageResult {
  sourceUrl: string;
  fileGid: string;
  /** Shopify CDN URL (resolved from fileGid once the file is READY) */
  imageUrl: string;
  fromCache: boolean;
}

export interface ImageRunStats {
  generated: number;
  skippedCached: number;
  capHit: boolean;
}

export async function regenerateImagesForProduct(
  cfg: SyncConfig,
  product: NormalizedProduct,
  stats: ImageRunStats,
  dryRun: boolean,
): Promise<ImageResult[]> {
  if (product.sourceImageUrls.length === 0) return [];

  const manifest = loadManifest();
  const out: ImageResult[] = [];

  if (dryRun) {
    for (const url of product.sourceImageUrls) {
      const cached = manifest[url];
      if (cached) {
        stats.skippedCached++;
        out.push({ sourceUrl: url, fileGid: cached.fileGid, imageUrl: cached.imageUrl ?? '', fromCache: true });
      } else {
        out.push({ sourceUrl: url, fileGid: '(dry-run)', imageUrl: '(dry-run)', fromCache: false });
      }
    }
    return out;
  }

  // Global kill-switch — set SYNC_SKIP_IMAGES=1 to pause image regeneration
  // while keeping text/metafield sync active. Existing cached images are still
  // reused so previously-synced products keep their imagery; new products are
  // created without images until the pipeline is re-enabled.
  if (process.env.SYNC_SKIP_IMAGES === '1') {
    for (const url of product.sourceImageUrls) {
      const cached = manifest[url];
      if (cached?.imageUrl) {
        stats.skippedCached++;
        out.push({ sourceUrl: url, fileGid: cached.fileGid, imageUrl: cached.imageUrl, fromCache: true });
      }
    }
    return out;
  }

  if (!cfg.googleApiKey) {
    throw new Error('GOOGLE_API_KEY missing — cannot regenerate images outside dry-run.');
  }

  const genai = new GoogleGenAI({ apiKey: cfg.googleApiKey });
  const specs = specsFromMetafields(product);
  const prompt = buildPrompt({
    productType: product.productType,
    titleEn: product.titleEn,
    titleDe: product.titleDe,
    tags: product.tags,
    widthCm: specs.widthCm,
    heightCm: specs.heightCm,
    color: specs.color,
  });

  for (let i = 0; i < product.sourceImageUrls.length; i++) {
    const srcUrl = product.sourceImageUrls[i]!;
    const cached = manifest[srcUrl];
    if (cached) {
      stats.skippedCached++;
      // Back-fill imageUrl lazily for entries created before this field existed.
      let imageUrl = cached.imageUrl;
      if (!imageUrl) {
        imageUrl = await resolveImageUrl(cfg, cached.fileGid);
        manifest[srcUrl] = { ...cached, imageUrl };
        saveManifest(manifest);
      }
      out.push({ sourceUrl: srcUrl, fileGid: cached.fileGid, imageUrl, fromCache: true });
      continue;
    }

    if (stats.generated >= cfg.imageGenCap) {
      stats.capHit = true;
      break;
    }

    const { bytes: srcBuf, mimeType: srcMime } = await downloadImage(srcUrl);
    const srcB64 = srcBuf.toString('base64');

    const response = await genai.models.generateContent({
      model: cfg.geminiImageModel,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: srcMime, data: srcB64 } },
            { text: prompt },
          ],
        },
      ],
      config: { responseModalities: ['IMAGE'] },
    });

    let gen: { bytes: Buffer; mimeType: string };
    try {
      gen = extractImageFromResponse(response);
    } catch (err) {
      // Gemini occasionally refuses a single frame (safety, hallucination).
      // Skip this image and continue — don't tank the whole product.
      console.warn(`[images] skip ${product.handle}[${i}]: ${(err as Error).message}`);
      continue;
    }
    const filename = `${product.handle}-${i}-gberg.png`;
    const altText = `${product.titleEn || product.titleDe} — image ${i + 1}`;
    const fileGid = await uploadToShopifyFiles(cfg, gen.bytes, filename, altText);
    const imageUrl = await resolveImageUrl(cfg, fileGid);

    manifest[srcUrl] = { fileGid, imageUrl, generatedAt: new Date().toISOString(), model: cfg.geminiImageModel };
    saveManifest(manifest);

    stats.generated++;
    out.push({ sourceUrl: srcUrl, fileGid, imageUrl, fromCache: false });
  }

  return out;
}
