#!/usr/bin/env node
/**
 * Packages theme/ into a zip, uploads it to Shopify via stagedUploadsCreate,
 * calls themeCreate to spin up an UNPUBLISHED theme ("Havn"), then
 * (optionally) publishes it with themePublish.
 *
 * This exists because the Shopify CLI cannot create a named unpublished theme
 * non-interactively, and DEVELOPMENT themes cannot be promoted to MAIN.
 *
 * Usage:
 *   node agent/scripts/deploy-theme.mjs            # create unpublished "Havn"
 *   node agent/scripts/deploy-theme.mjs --publish  # ...and publish immediately
 */
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const API_VERSION = '2026-04';
const THEME_NAME = process.env.HAVN_THEME_NAME || 'Havn';
const DO_PUBLISH = process.argv.includes('--publish');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const THEME_DIR = resolve(REPO_ROOT, 'theme');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');
const ZIP_OUT = resolve(REPO_ROOT, 'agent', 'scripts', '.havn-theme.zip');

function loadEnvLocal(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal(ENV_PATH);

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing env vars'); process.exit(1); }
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

const THEME_DIRS = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const SKIP_FILES = new Set(['.shopifyignore.bak', 'Thumbs.db', '.DS_Store']);

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_FILES.has(name)) continue;
    if (name.endsWith('.tmp.jpg') || name.endsWith('.tmp')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, base));
    else out.push({ full, rel: relative(base, full).replace(/\\/g, '/') });
  }
  return out;
}

function zipTheme() {
  const zip = new AdmZip();
  let count = 0;
  for (const d of THEME_DIRS) {
    const dirPath = join(THEME_DIR, d);
    try { statSync(dirPath); } catch { continue; }
    for (const { full, rel } of walk(dirPath, THEME_DIR)) {
      zip.addLocalFile(full, dirname(rel));
      count++;
    }
  }
  writeFileSync(ZIP_OUT, zip.toBuffer());
  const sizeKB = Math.round(statSync(ZIP_OUT).size / 1024);
  console.log(`  ✓ Zipped ${count} files → ${ZIP_OUT} (${sizeKB} KB)`);
  return ZIP_OUT;
}

async function stageZip(zipPath) {
  const data = await gql(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          filename: 'havn-theme.zip',
          mimeType: 'application/zip',
          resource: 'FILE',
          httpMethod: 'POST',
        },
      ],
    },
  );
  const errs = data.stagedUploadsCreate.userErrors;
  if (errs.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errs)}`);
  const target = data.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  const zipBuffer = readFileSync(zipPath);
  form.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'havn-theme.zip');

  const upload = await fetch(target.url, { method: 'POST', body: form });
  if (!upload.ok) throw new Error(`Staging upload failed: ${upload.status} ${await upload.text()}`);

  console.log(`  ✓ Uploaded to staging: ${target.resourceUrl.slice(0, 80)}…`);
  return target.resourceUrl;
}

async function createThemeFromUrl(name, sourceUrl) {
  const data = await gql(
    `mutation($name: String!, $source: URL!) {
      themeCreate(name: $name, source: $source) {
        theme { id name role processing processingFailed }
        userErrors { field message }
      }
    }`,
    { name, source: sourceUrl },
  );
  const errs = data.themeCreate.userErrors;
  if (errs.length) throw new Error(`themeCreate: ${JSON.stringify(errs)}`);
  const theme = data.themeCreate.theme;
  console.log(`  ✓ Theme created: ${theme.name} (${theme.id}) role=${theme.role}`);
  return theme;
}

async function waitUntilProcessed(themeId) {
  const MAX_ATTEMPTS = 60;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const data = await gql(
      `query($id: ID!) { theme(id: $id) { id name role processing processingFailed } }`,
      { id: themeId },
    );
    const t = data.theme;
    if (t.processingFailed) throw new Error(`Theme processing failed.`);
    if (!t.processing) {
      console.log(`  ✓ Processing complete. role=${t.role}`);
      return t;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Timed out waiting for theme processing.');
}

async function publishTheme(themeId) {
  const data = await gql(
    `mutation($id: ID!) { themePublish(id: $id) { theme { id name role } userErrors { field message } } }`,
    { id: themeId },
  );
  const errs = data.themePublish.userErrors;
  if (errs.length) throw new Error(`themePublish: ${JSON.stringify(errs)}`);
  console.log(`  ✓ Published "${data.themePublish.theme.name}" as MAIN.`);
}

async function main() {
  console.log(`→ Deploying ${THEME_DIR} as "${THEME_NAME}" on ${STORE}\n`);
  console.log('Step 1/5  Zip theme files');
  const zipPath = zipTheme();

  console.log('\nStep 2/5  Stage upload');
  const sourceUrl = await stageZip(zipPath);

  console.log('\nStep 3/5  themeCreate (UNPUBLISHED)');
  const theme = await createThemeFromUrl(THEME_NAME, sourceUrl);

  console.log('\nStep 4/5  Wait for Shopify to process the ZIP');
  const processed = await waitUntilProcessed(theme.id);

  try { unlinkSync(zipPath); } catch {}

  if (DO_PUBLISH) {
    console.log('\nStep 5/5  Publish as MAIN');
    await publishTheme(processed.id);
  } else {
    console.log(`\nStep 5/5  SKIPPED — pass --publish to promote to MAIN.`);
    console.log(`  Preview: https://${STORE}?preview_theme_id=${processed.id.split('/').pop()}`);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
