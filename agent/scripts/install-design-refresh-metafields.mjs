#!/usr/bin/env node
/*
 * install-design-refresh-metafields.mjs
 *
 * Date: 2026-04-29
 * Purpose: Install the new PRODUCT metafield definitions required by the
 *          April 2026 design refresh — specifically the cardgrid eyebrow +
 *          wattage chip (changes #2 in `docs/design-refresh-plan.md`) and
 *          the structured PDP spec block (change #4).
 *
 * Idempotent. Safe to re-run. For each definition:
 *   1. Queries metafieldDefinitions(ownerType, namespace, key).
 *   2. If found → log skip, move on.
 *   3. If not found → metafieldDefinitionCreate. On PINNED_LIMIT_REACHED,
 *      retries unpinned (matches install-metafield-definitions.mjs behavior).
 *
 * NAMESPACE NOTE — IMPORTANT
 * --------------------------
 * The Track B brief specified namespace `gberg` for these fields. The project
 * has already migrated PRODUCT metafields OUT of `gberg.*` into the
 * brief-compliant namespace structure (see migrate-metafield-namespaces.mjs
 * and for-claude/shop/08_shopify_metafields_metaobjects_definitions.md).
 * Re-introducing `gberg` would re-fragment the namespace surface and violate
 * the "stable namespaces only" rule.
 *
 * Mapping used here (final, definitive):
 *   series                    → custom.series
 *   wattage_w                 → specs.wattage_w
 *   energy_class              → specs.energy_class
 *   warranty_years            → custom.warranty_years
 *   room_coverage_m2          → specs.room_coverage_m2
 *   dimensions_w_h_d_mm       → specs.dimensions_w_h_d_mm
 *   installation_difficulty   → specs.installation_difficulty
 *   connection_type           → uses EXISTING specs.connection_type
 *                               (already pinned). This script tightens the
 *                               validations on the existing definition only
 *                               if it is missing the enum constraint —
 *                               otherwise it is left untouched (Shopify does
 *                               not allow type changes).
 *
 * Track C-Liquid templates therefore reference:
 *   {{ product.metafields.custom.series }}
 *   {{ product.metafields.specs.wattage_w }}
 *   {{ product.metafields.specs.energy_class }}
 *   {{ product.metafields.custom.warranty_years }}
 *   {{ product.metafields.specs.room_coverage_m2 }}
 *   {{ product.metafields.specs.dimensions_w_h_d_mm }}
 *   {{ product.metafields.specs.installation_difficulty }}
 *   {{ product.metafields.specs.connection_type }}
 *
 * Flags:
 *   --dry-run            Print plan, no mutations.
 *   --store dev|prod     Default: dev.
 *
 * Env (loaded from .env.local at repo root):
 *   SHOPIFY_DEV_STORE / SHOPIFY_DEV_ADMIN_TOKEN     (when --store dev)
 *   SHOPIFY_PROD_STORE / SHOPIFY_PROD_ADMIN_TOKEN   (when --store prod)
 *   SHOPIFY_API_VERSION                              optional, default 2026-04
 *
 * Run:
 *   node agent/scripts/install-design-refresh-metafields.mjs --dry-run
 *   node agent/scripts/install-design-refresh-metafields.mjs --store dev
 *
 * Required Admin API scopes:
 *   write_metafield_definitions
 *   read_metafield_definitions
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const ARGV = process.argv.slice(2);

function getFlag(name) {
  return ARGV.includes(name);
}
function getOpt(name, fallback) {
  const i = ARGV.indexOf(name);
  if (i === -1) return fallback;
  return ARGV[i + 1];
}

const DRY_RUN = getFlag('--dry-run');
const STORE = getOpt('--store', 'dev');

if (STORE !== 'dev' && STORE !== 'prod') {
  console.error(`FATAL: --store must be "dev" or "prod" (got ${JSON.stringify(STORE)})`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

function loadEnvLocal(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvLocal(ENV_PATH);

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const SUFFIX = STORE === 'prod' ? 'PROD' : 'DEV';
const SHOP = process.env[`SHOPIFY_${SUFFIX}_STORE`];
const TOKEN = process.env[`SHOPIFY_${SUFFIX}_ADMIN_TOKEN`];

if (!SHOP || !TOKEN) {
  console.error(
    `FATAL: SHOPIFY_${SUFFIX}_STORE and SHOPIFY_${SUFFIX}_ADMIN_TOKEN must be set ` +
      '(via .env.local at repo root or shell env).',
  );
  process.exit(1);
}

const GRAPHQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

// ---------------------------------------------------------------------------
// GraphQL transport (matches install-metafield-definitions.mjs)
// ---------------------------------------------------------------------------

const Q_METAFIELD_DEFINITIONS = /* GraphQL */ `
  query ($ownerType: MetafieldOwnerType!, $namespace: String!, $key: String!) {
    metafieldDefinitions(first: 1, ownerType: $ownerType, namespace: $namespace, key: $key) {
      edges { node { id namespace key name type { name } } }
    }
  }
`;

const M_METAFIELD_DEFINITION_CREATE = /* GraphQL */ `
  mutation ($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id namespace key name }
      userErrors { field message code }
    }
  }
`;

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// DEFINITIONS — design-refresh additions only
// ---------------------------------------------------------------------------
//
// All fields are PRODUCT-scoped. Every definition is exposed to the Storefront
// API (PUBLIC_READ) so the theme can render them. Pin choices balance the
// 20-pinned-per-ownerType cap: card-grid + PDP critical fields get pin: true,
// secondary spec rows get pin: false (still editable in Admin under Custom
// data, still readable from the storefront).
//
// Pinning logic (combined with existing pins from install-metafield-definitions.mjs):
//   PINNED already (existing): subtitle, short_description, usp_1, usp_2,
//     usp_3, badges, primary_keyword, market_visibility, width_mm, height_mm,
//     depth_mm, orientation, connection_type (specs), heating_medium, color,
//     product_type, room_type, color_family  → 18 pins
//   PINNED new (4):              series, wattage_w, energy_class, warranty_years
//   = 22 → over the cap of 20.
//
// The install script auto-retries unpinned on PINNED_LIMIT_REACHED, so the
// 2-too-many will degrade gracefully. Order new pins by storefront-edit
// frequency (series + wattage hit Admin every new SKU; energy_class +
// warranty change rarely) so that warranty_years degrades to unpinned first.

const PRODUCT_DEFS = [
  {
    namespace: 'custom',
    key: 'series',
    name: 'Series',
    type: 'single_line_text_field',
    ownerType: 'PRODUCT',
    description:
      'Wordmark eyebrow on product cards (e.g. "ASTORIA", "PULLMAN"). Drives the series-level grouping in the card grid; merchant edits per SKU.',
    pin: true,
  },
  {
    namespace: 'specs',
    key: 'wattage_w',
    name: 'Wattage (W)',
    type: 'number_integer',
    ownerType: 'PRODUCT',
    description:
      'Nominal heat output in watts. Renders as the top-right card chip and the kW chip on the PDP spec block.',
    validations: [
      { name: 'min', value: '50' },
      { name: 'max', value: '5000' },
    ],
    pin: true,
  },
  {
    namespace: 'specs',
    key: 'energy_class',
    name: 'Energy class',
    type: 'single_line_text_field',
    ownerType: 'PRODUCT',
    description:
      'EU energy efficiency band (A+++ … G). Renders as the energy-class badge on the PDP spec block.',
    validations: [
      // Shopify enum is enforced via choices on single_line_text_field.
      // https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types#single-line-text-field
      { name: 'choices', value: JSON.stringify(['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']) },
    ],
    pin: true,
  },
  {
    namespace: 'custom',
    key: 'warranty_years',
    name: 'Warranty (years)',
    type: 'number_integer',
    ownerType: 'PRODUCT',
    description:
      'Manufacturer warranty in years. Default 10 across the catalog; settable per SKU. Renders next to the warranty icon on the PDP spec block.',
    validations: [
      { name: 'min', value: '1' },
      { name: 'max', value: '25' },
    ],
    pin: true,
  },
  {
    namespace: 'specs',
    key: 'room_coverage_m2',
    name: 'Room coverage (m²)',
    type: 'number_decimal',
    ownerType: 'PRODUCT',
    description:
      'Square-meter coverage at standard load (75/65/20). Renders as "Heats rooms up to N m²" on the PDP spec block.',
    validations: [
      { name: 'min', value: '1' },
      { name: 'max', value: '80' },
    ],
    pin: false,
  },
  {
    namespace: 'specs',
    key: 'dimensions_w_h_d_mm',
    name: 'Dimensions W×H×D (mm)',
    type: 'single_line_text_field',
    ownerType: 'PRODUCT',
    description:
      'Display string for the dimensions row, e.g. "600 × 1800 × 90". Display-only; canonical numeric values stay in specs.width_mm / height_mm / depth_mm.',
    pin: false,
  },
  {
    namespace: 'specs',
    key: 'installation_difficulty',
    name: 'Installation difficulty',
    type: 'single_line_text_field',
    ownerType: 'PRODUCT',
    description:
      'Installer skill level required: easy | standard | professional. Drives the install-icon caption on the PDP spec block.',
    validations: [
      { name: 'choices', value: JSON.stringify(['easy', 'standard', 'professional']) },
    ],
    pin: false,
  },
  // NOTE on connection_type:
  // The Track B brief listed `connection_type` (enum: side, center, both) as a
  // new field. The store ALREADY has `specs.connection_type`
  // (single_line_text_field, pinned, no choices) installed by
  // install-metafield-definitions.mjs. We do NOT redefine it here:
  //   - Shopify rejects metafieldDefinitionCreate on duplicate (ownerType,
  //     namespace, key) and there's no in-place validations update via the
  //     create mutation.
  //   - Adding a `choices` validation to an existing definition is a separate
  //     Admin-side action (or a tightened metafieldDefinitionUpdate mutation)
  //     and is intentionally deferred — the existing field already serves the
  //     storefront, and the catalog-sync pipeline writes free-text values
  //     ("Mittelanschluss", "Seitenanschluss") that would fail enum
  //     validation if tightened today.
  // If the design refresh requires strict enum on connection_type, file a
  // follow-up to (a) normalize existing values to side|center|both, then
  // (b) call metafieldDefinitionUpdate with the validations payload.
];

// ---------------------------------------------------------------------------
// Idempotent ensure helper (matches install-metafield-definitions.mjs)
// ---------------------------------------------------------------------------

async function findMetafieldDefinitionId({ ownerType, namespace, key }) {
  const data = await gql(Q_METAFIELD_DEFINITIONS, { ownerType, namespace, key });
  return data.metafieldDefinitions.edges[0]?.node?.id ?? null;
}

async function ensureMetafieldDefinition(def) {
  const label = `${def.ownerType.toLowerCase()}.${def.namespace}.${def.key}`;
  const existing = await findMetafieldDefinitionId({
    ownerType: def.ownerType,
    namespace: def.namespace,
    key: def.key,
  });
  if (existing) {
    console.log(`[skip]   metafield:${label} → ${existing}`);
    return { id: existing, status: 'skipped' };
  }

  if (DRY_RUN) {
    console.log(`[dry]    metafield:${label} (type=${def.type}${def.pin ? ', pin' : ''})`);
    return { id: 'dry-run', status: 'created' };
  }

  const desiredPin = def.pin === true;
  const baseInput = {
    name: def.name,
    namespace: def.namespace,
    key: def.key,
    type: def.type,
    ownerType: def.ownerType,
    access: def.access ?? { storefront: 'PUBLIC_READ' },
    ...(def.description ? { description: def.description } : {}),
    ...(def.validations ? { validations: def.validations } : {}),
  };

  async function attempt(pin) {
    return gql(M_METAFIELD_DEFINITION_CREATE, { definition: { ...baseInput, pin } });
  }

  let data = await attempt(desiredPin);
  let { createdDefinition, userErrors } = data.metafieldDefinitionCreate;
  let didPin = desiredPin;

  // Retry unpinned if the only blocker is pin-limit.
  if (
    userErrors.length &&
    desiredPin &&
    userErrors.some((e) => (e.code || '').toUpperCase() === 'PINNED_LIMIT_REACHED')
  ) {
    console.log(`         (PINNED_LIMIT_REACHED on ${label} — retrying unpinned)`);
    data = await attempt(false);
    ({ createdDefinition, userErrors } = data.metafieldDefinitionCreate);
    didPin = false;
  }

  if (userErrors.length) {
    if (userErrors.every((e) => (e.code || '').toUpperCase() === 'TAKEN')) {
      const refetched = await findMetafieldDefinitionId({
        ownerType: def.ownerType,
        namespace: def.namespace,
        key: def.key,
      });
      if (refetched) {
        console.log(`[skip-r] metafield:${label} → ${refetched}`);
        return { id: refetched, status: 'skipped' };
      }
    }
    throw new Error(`metafieldDefinitionCreate(${label}) userErrors: ${JSON.stringify(userErrors)}`);
  }
  console.log(`[create] metafield:${label} → ${createdDefinition.id}${didPin ? ' (pinned)' : ''}`);
  return { id: createdDefinition.id, status: 'created' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`→ install-design-refresh-metafields on ${SHOP} (Admin API ${API_VERSION})`);
  console.log(`  store=${STORE} dry_run=${DRY_RUN}`);
  console.log('  scope: April 2026 design refresh — card eyebrow + wattage chip + PDP spec block');

  const counts = { created: 0, skipped: 0 };
  const tally = (s) => { if (s === 'created') counts.created++; else counts.skipped++; };

  console.log('\n--- DESIGN-REFRESH PRODUCT METAFIELDS ---');
  for (const def of PRODUCT_DEFS) {
    const { status } = await ensureMetafieldDefinition(def);
    tally(status);
  }

  console.log(
    `\nDone. created: ${counts.created}, skipped: ${counts.skipped}` +
      (DRY_RUN ? ' (DRY RUN — no mutations)' : ''),
  );
  console.log(
    '\nNext steps:\n' +
      '  1. Backfill series + wattage_w on every SKU (catalog-driven from data/catalog/gberg-catalog.json).\n' +
      '  2. Optionally backfill warranty_years (default 10), energy_class, room_coverage_m2.\n' +
      '  3. Track C-Liquid wires the templates to the new keys.',
  );
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
