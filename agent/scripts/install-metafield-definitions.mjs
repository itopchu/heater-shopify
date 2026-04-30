#!/usr/bin/env node
/*
 * install-metafield-definitions.mjs
 *
 * Installs the brief-compliant metafield + metaobject definitions per
 * `for-claude/shop/08_shopify_metafields_metaobjects_definitions.md`.
 *
 * Idempotent: existing definitions (by ownerType+namespace+key for metafields,
 * type for metaobjects) are detected and skipped. Re-run safely.
 *
 * Flags:
 *   --dry-run            Print what would be created/skipped, no mutations.
 *   --store dev|prod     Target store. Default: dev.
 *   --scope shared|heating|all   shared = §2 + §6 + §7 metaobjects;
 *                                heating = §3 (PRODUCT specs/filters/compatibility);
 *                                all = both. Default: all.
 *
 * Env (loaded from .env.local at repo root):
 *   SHOPIFY_DEV_STORE / SHOPIFY_DEV_ADMIN_TOKEN     (when --store dev)
 *   SHOPIFY_PROD_STORE / SHOPIFY_PROD_ADMIN_TOKEN   (when --store prod)
 *   SHOPIFY_API_VERSION                              optional, default 2026-04
 *
 * Run:
 *   node agent/scripts/install-metafield-definitions.mjs --dry-run
 *   node agent/scripts/install-metafield-definitions.mjs --store dev
 *
 * Two-pass execution:
 *   1. Metaobject definitions (§7) — captures their GIDs.
 *   2. Metafield definitions that reference metaobjects use those GIDs.
 *
 * Notes on Shopify type names this script uses:
 *   single_line_text_field, multi_line_text_field, boolean,
 *   number_integer, number_decimal, json,
 *   list.single_line_text_field, list.metaobject_reference,
 *   list.product_reference, list.file_reference, metaobject_reference.
 *
 * https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types
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
const SCOPE = getOpt('--scope', 'all');

if (STORE !== 'dev' && STORE !== 'prod') {
  console.error(`FATAL: --store must be "dev" or "prod" (got ${JSON.stringify(STORE)})`);
  process.exit(1);
}
if (SCOPE !== 'shared' && SCOPE !== 'heating' && SCOPE !== 'all') {
  console.error(`FATAL: --scope must be "shared" | "heating" | "all" (got ${JSON.stringify(SCOPE)})`);
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
// GraphQL transport
// ---------------------------------------------------------------------------

const Q_METAOBJECT_DEFINITION_BY_TYPE = /* GraphQL */ `
  query ($type: String!) {
    metaobjectDefinitionByType(type: $type) { id type name }
  }
`;

const Q_METAFIELD_DEFINITIONS = /* GraphQL */ `
  query ($ownerType: MetafieldOwnerType!, $namespace: String!, $key: String!) {
    metafieldDefinitions(first: 1, ownerType: $ownerType, namespace: $namespace, key: $key) {
      edges { node { id namespace key name type { name } } }
    }
  }
`;

const M_METAOBJECT_DEFINITION_CREATE = /* GraphQL */ `
  mutation ($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id type name }
      userErrors { field message code }
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
// §7 METAOBJECT DEFINITIONS (the in-scope subset for heating)
// ---------------------------------------------------------------------------
// Skipped: size_guide, fit_guide, care_guide, material_guide,
//          assembly_guide, delivery_guide, room_guide
//          (those belong to underwear/furniture verticals).

// IMPORTANT: dependency-ordered. faq_item must precede faq_group because
// faq_group.items is `list.metaobject_reference` constrained to faq_item.
// Likewise, comparison_attribute_definition precedes comparison_group.
const METAOBJECT_DEFS = [
  {
    type: 'faq_item',
    name: 'FAQ item',
    description: 'Reusable FAQ row.',
    displayNameKey: 'question',
    fieldDefinitions: [
      { key: 'question', name: 'Question', type: 'single_line_text_field', required: true },
      { key: 'answer', name: 'Answer', type: 'multi_line_text_field', required: true },
      { key: 'language_code', name: 'Language code', type: 'single_line_text_field' },
      { key: 'audience', name: 'Audience', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'faq_group',
    name: 'FAQ group',
    description: 'A reusable list of FAQ items grouped under a title.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'intro', name: 'Intro', type: 'multi_line_text_field' },
      { key: 'items', name: 'Items', type: 'list.metaobject_reference', refType: 'faq_item' },
    ],
  },
  {
    type: 'buying_guide',
    name: 'Buying guide',
    description: 'Long-form editorial guide referenced by products + collections.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'slug', name: 'Slug', type: 'single_line_text_field' },
      { key: 'summary', name: 'Summary', type: 'multi_line_text_field' },
      { key: 'body_html', name: 'Body HTML', type: 'multi_line_text_field' },
      { key: 'related_categories', name: 'Related categories', type: 'list.single_line_text_field' },
      { key: 'related_products', name: 'Related products', type: 'list.product_reference' },
      { key: 'seo_title', name: 'SEO title', type: 'single_line_text_field' },
      { key: 'seo_description', name: 'SEO description', type: 'multi_line_text_field' },
    ],
  },
  {
    type: 'support_block',
    name: 'Support block',
    description: 'Reusable support / trust block (icon + body) for PDPs and PLPs.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'body', name: 'Body', type: 'multi_line_text_field' },
      { key: 'icon', name: 'Icon', type: 'file_reference' },
      { key: 'variant', name: 'Variant', type: 'single_line_text_field' },
      { key: 'market_visibility', name: 'Market visibility', type: 'list.single_line_text_field' },
    ],
  },
  {
    type: 'document_library',
    name: 'Document library',
    description: 'Reusable downloadable-asset bundle (datasheets, manuals).',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'documents', name: 'Documents', type: 'list.file_reference' },
      { key: 'labels', name: 'Labels', type: 'list.single_line_text_field' },
    ],
  },
  {
    type: 'comparison_attribute_definition',
    name: 'Comparison attribute',
    description: 'Single comparable attribute used inside a comparison_group.',
    displayNameKey: 'attribute_key',
    fieldDefinitions: [
      { key: 'attribute_key', name: 'Attribute key', type: 'single_line_text_field', required: true },
      { key: 'label', name: 'Label', type: 'single_line_text_field' },
      { key: 'display_type', name: 'Display type', type: 'single_line_text_field' },
      { key: 'unit', name: 'Unit', type: 'single_line_text_field' },
      { key: 'sort_order', name: 'Sort order', type: 'number_integer' },
    ],
  },
  {
    type: 'comparison_group',
    name: 'Comparison group',
    description: 'Group of comparable attributes used on PDPs/PLPs.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      {
        key: 'compare_attributes',
        name: 'Compare attributes',
        type: 'list.metaobject_reference',
        refType: 'comparison_attribute_definition',
      },
    ],
  },
  {
    type: 'ai_summary_block',
    name: 'AI summary block',
    description: 'Factual page-level summary for AI-readable rendering.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'summary_text', name: 'Summary text', type: 'multi_line_text_field' },
      { key: 'key_points_json', name: 'Key points JSON', type: 'json' },
      { key: 'audience', name: 'Audience', type: 'single_line_text_field' },
      { key: 'language_code', name: 'Language code', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'image_template_definition',
    name: 'Image template definition',
    description: 'Style-rules template used by AI image regeneration.',
    displayNameKey: 'template_id',
    fieldDefinitions: [
      { key: 'template_id', name: 'Template ID', type: 'single_line_text_field', required: true },
      { key: 'category', name: 'Category', type: 'single_line_text_field' },
      { key: 'asset_type', name: 'Asset type', type: 'single_line_text_field' },
      { key: 'style_rules', name: 'Style rules', type: 'multi_line_text_field' },
      { key: 'forbidden_changes', name: 'Forbidden changes', type: 'multi_line_text_field' },
      { key: 'output_ratios', name: 'Output ratios', type: 'list.single_line_text_field' },
    ],
  },
  {
    type: 'installation_guide',
    name: 'Installation guide',
    description: 'Step-by-step installation guide for heating products.',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'steps_html', name: 'Steps HTML', type: 'multi_line_text_field' },
      { key: 'downloadable_documents', name: 'Downloadable documents', type: 'list.file_reference' },
    ],
  },
  {
    type: 'radiator_compatibility_guide',
    name: 'Radiator compatibility guide',
    description: 'System-compatibility notes for radiators (heat pump, etc.).',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'compatibility_summary', name: 'Compatibility summary', type: 'multi_line_text_field' },
      { key: 'supported_systems', name: 'Supported systems', type: 'list.single_line_text_field' },
      { key: 'excluded_systems', name: 'Excluded systems', type: 'list.single_line_text_field' },
      { key: 'notes', name: 'Notes', type: 'multi_line_text_field' },
    ],
  },
];

// ---------------------------------------------------------------------------
// §2 SHARED PRODUCT METAFIELDS
// ---------------------------------------------------------------------------

function buildSharedProductDefs(gidByType) {
  return [
    // custom — these are the highest-frequency merchant-edited fields, so we
    // pin them. The Shopify hard cap is 20 pinned definitions per ownerType;
    // we curate which ones get pin=true to stay under it.
    { namespace: 'custom', key: 'subtitle', name: 'Subtitle', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'custom', key: 'short_description', name: 'Short description', type: 'multi_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'custom', key: 'usp_1', name: 'USP 1', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'custom', key: 'usp_2', name: 'USP 2', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'custom', key: 'usp_3', name: 'USP 3', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    // copy_status is a sync-pipeline-driven value (scraper_de | manual_stub)
    // — we set it from build-from-scraper.ts; living here keeps it in `custom`
    // alongside other production-content flags.
    { namespace: 'custom', key: 'copy_status', name: 'Copy status', type: 'single_line_text_field', ownerType: 'PRODUCT' },

    // merchandising
    { namespace: 'merchandising', key: 'badges', name: 'Badges', type: 'list.single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'merchandising', key: 'related_products', name: 'Related products', type: 'list.product_reference', ownerType: 'PRODUCT' },
    { namespace: 'merchandising', key: 'cross_sell_products', name: 'Cross-sell products', type: 'list.product_reference', ownerType: 'PRODUCT' },
    { namespace: 'merchandising', key: 'upsell_products', name: 'Upsell products', type: 'list.product_reference', ownerType: 'PRODUCT' },
    { namespace: 'merchandising', key: 'compare_group', name: 'Compare group', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'merchandising', key: 'manual_sort_score', name: 'Manual sort score', type: 'number_integer', ownerType: 'PRODUCT' },

    // shipping
    { namespace: 'shipping', key: 'dispatch_note', name: 'Dispatch note', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'shipping', key: 'delivery_note', name: 'Delivery note', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'shipping', key: 'return_summary', name: 'Return summary', type: 'multi_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'shipping', key: 'shipping_profile_label', name: 'Shipping profile label', type: 'single_line_text_field', ownerType: 'PRODUCT' },

    // seo
    { namespace: 'seo', key: 'override_title', name: 'SEO override title', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'seo', key: 'override_description', name: 'SEO override description', type: 'multi_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'seo', key: 'override_h1', name: 'SEO override H1', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'seo', key: 'primary_keyword', name: 'Primary keyword', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'seo', key: 'secondary_keywords', name: 'Secondary keywords', type: 'list.single_line_text_field', ownerType: 'PRODUCT' },
    {
      namespace: 'seo',
      key: 'faq_group',
      name: 'FAQ group',
      type: 'metaobject_reference',
      ownerType: 'PRODUCT',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'faq_group') }],
    },
    { namespace: 'seo', key: 'breadcrumb_override', name: 'Breadcrumb override', type: 'list.single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'seo', key: 'schema_product_type', name: 'Schema product type', type: 'single_line_text_field', ownerType: 'PRODUCT' },

    // ai
    // NOTE: brief uses namespace `ai` but Shopify rejects that with TOO_SHORT
    // (3-char minimum). We expand to `aix` ("AI extensions") — same semantic
    // bucket, brief-faithful prefix. Document this divergence in the migration log.
    { namespace: 'aix', key: 'entity_summary', name: 'AI entity summary', type: 'multi_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'aix', key: 'key_facts', name: 'AI key facts', type: 'json', ownerType: 'PRODUCT' },
    { namespace: 'aix', key: 'compatibility_summary', name: 'AI compatibility summary', type: 'multi_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'aix', key: 'customer_question_summary', name: 'AI customer-question summary', type: 'multi_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'aix', key: 'allowed_claims', name: 'AI allowed claims', type: 'list.single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'aix', key: 'restricted_claims', name: 'AI restricted claims', type: 'list.single_line_text_field', ownerType: 'PRODUCT' },

    // media
    { namespace: 'media', key: 'primary_asset_id', name: 'Primary asset ID', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'media', key: 'gallery_asset_ids', name: 'Gallery asset IDs', type: 'list.single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'media', key: 'asset_manifest', name: 'Asset manifest', type: 'json', ownerType: 'PRODUCT' },
    { namespace: 'media', key: 'image_style_template', name: 'Image style template', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    // Project-specific extensions for the existing scraper pipeline.
    // These were previously under gberg.* — moved here to be brief-compliant
    // while retaining the same semantics.
    { namespace: 'media', key: 'local_images', name: 'Local images', type: 'json', ownerType: 'PRODUCT' },
    { namespace: 'media', key: 'primary_pdf_url', name: 'Primary PDF URL', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'media', key: 'image_status', name: 'Image status', type: 'single_line_text_field', ownerType: 'PRODUCT' },

    // localization
    { namespace: 'localization', key: 'market_visibility', name: 'Market visibility', type: 'list.single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'localization', key: 'translation_group', name: 'Translation group', type: 'single_line_text_field', ownerType: 'PRODUCT' },

    // content
    {
      namespace: 'content',
      key: 'buying_guide',
      name: 'Buying guide',
      type: 'metaobject_reference',
      ownerType: 'PRODUCT',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'buying_guide') }],
    },
    {
      namespace: 'content',
      key: 'support_block',
      name: 'Support block',
      type: 'metaobject_reference',
      ownerType: 'PRODUCT',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'support_block') }],
    },
    {
      namespace: 'content',
      key: 'document_library',
      name: 'Document library',
      type: 'metaobject_reference',
      ownerType: 'PRODUCT',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'document_library') }],
    },
    // Project-specific: scraper-source DE sections for traceability + later
    // editorial review. JSON blob, admin-readable only.
    { namespace: 'content', key: 'sections_de', name: 'Source DE sections', type: 'json', ownerType: 'PRODUCT' },
  ];
}

// ---------------------------------------------------------------------------
// §3 HEATING PRODUCT METAFIELDS
// ---------------------------------------------------------------------------

function buildHeatingProductDefs(gidByType) {
  return [
    // specs — pin physical-dimension/orientation/connection: highest-edit frequency.
    { namespace: 'specs', key: 'width_mm', name: 'Width (mm)', type: 'number_integer', ownerType: 'PRODUCT', validations: [{ name: 'min', value: '0' }], pin: true },
    { namespace: 'specs', key: 'height_mm', name: 'Height (mm)', type: 'number_integer', ownerType: 'PRODUCT', validations: [{ name: 'min', value: '0' }], pin: true },
    { namespace: 'specs', key: 'depth_mm', name: 'Depth (mm)', type: 'number_integer', ownerType: 'PRODUCT', validations: [{ name: 'min', value: '0' }], pin: true },
    { namespace: 'specs', key: 'orientation', name: 'Orientation', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'specs', key: 'connection_type', name: 'Connection type', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'specs', key: 'pipe_spacing_mm', name: 'Pipe spacing (mm)', type: 'number_integer', ownerType: 'PRODUCT', validations: [{ name: 'min', value: '0' }] },
    { namespace: 'specs', key: 'heating_medium', name: 'Heating medium', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'specs', key: 'heat_output_75_65_20', name: 'Heat output 75/65/20', type: 'number_decimal', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'heat_output_70_55_20', name: 'Heat output 70/55/20', type: 'number_decimal', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'heat_output_55_45_20', name: 'Heat output 55/45/20', type: 'number_decimal', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'color', name: 'Color', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'specs', key: 'finish', name: 'Finish', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'material', name: 'Material', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'voltage', name: 'Voltage', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'mounting_kit_included', name: 'Mounting kit included', type: 'boolean', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'valve_included', name: 'Valve included', type: 'boolean', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'thermostat_included', name: 'Thermostat included', type: 'boolean', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'heat_pump_compatible', name: 'Heat pump compatible', type: 'boolean', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'bathroom_suitable', name: 'Bathroom suitable', type: 'boolean', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'max_pressure_bar', name: 'Max pressure (bar)', type: 'number_decimal', ownerType: 'PRODUCT' },
    { namespace: 'specs', key: 'max_temp_c', name: 'Max temperature (°C)', type: 'number_decimal', ownerType: 'PRODUCT' },
    // Project-specific: raw scraper specs blob (heating-only since other
    // verticals don't have an upstream catalog scraper at this point).
    { namespace: 'specs', key: 'raw_source', name: 'Raw scraper specs', type: 'json', ownerType: 'PRODUCT' },

    // filters
    { namespace: 'filters', key: 'product_type', name: 'Product type filter', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'filters', key: 'room_type', name: 'Room type', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'filters', key: 'orientation', name: 'Orientation filter', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'filters', key: 'color_family', name: 'Color family', type: 'single_line_text_field', ownerType: 'PRODUCT', pin: true },
    { namespace: 'filters', key: 'connection_type', name: 'Connection type filter', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'filters', key: 'width_bucket', name: 'Width bucket', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'filters', key: 'height_bucket', name: 'Height bucket', type: 'single_line_text_field', ownerType: 'PRODUCT' },
    { namespace: 'filters', key: 'heat_pump_compatible', name: 'Heat pump compatible filter', type: 'boolean', ownerType: 'PRODUCT' },

    // compatibility
    {
      namespace: 'compatibility',
      key: 'installation_guide',
      name: 'Installation guide',
      type: 'metaobject_reference',
      ownerType: 'PRODUCT',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'installation_guide') }],
    },
    {
      namespace: 'compatibility',
      key: 'compatibility_guide',
      name: 'Compatibility guide',
      type: 'metaobject_reference',
      ownerType: 'PRODUCT',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'radiator_compatibility_guide') }],
    },
  ];
}

// ---------------------------------------------------------------------------
// §6 COLLECTION METAFIELDS
// ---------------------------------------------------------------------------

function buildCollectionDefs(gidByType) {
  return [
    // custom
    { namespace: 'custom', key: 'intro_text', name: 'Intro text', type: 'multi_line_text_field', ownerType: 'COLLECTION' },
    { namespace: 'custom', key: 'hero_title', name: 'Hero title', type: 'single_line_text_field', ownerType: 'COLLECTION' },
    { namespace: 'custom', key: 'hero_subtitle', name: 'Hero subtitle', type: 'multi_line_text_field', ownerType: 'COLLECTION' },
    // seo
    { namespace: 'seo', key: 'override_title', name: 'SEO override title', type: 'single_line_text_field', ownerType: 'COLLECTION' },
    { namespace: 'seo', key: 'override_description', name: 'SEO override description', type: 'multi_line_text_field', ownerType: 'COLLECTION' },
    {
      namespace: 'seo',
      key: 'faq_group',
      name: 'FAQ group',
      type: 'metaobject_reference',
      ownerType: 'COLLECTION',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'faq_group') }],
    },
    // content
    {
      namespace: 'content',
      key: 'buying_guide',
      name: 'Buying guide',
      type: 'metaobject_reference',
      ownerType: 'COLLECTION',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'buying_guide') }],
    },
    {
      namespace: 'content',
      key: 'support_block',
      name: 'Support block',
      type: 'metaobject_reference',
      ownerType: 'COLLECTION',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'support_block') }],
    },
    {
      namespace: 'content',
      key: 'ai_summary_block',
      name: 'AI summary block',
      type: 'metaobject_reference',
      ownerType: 'COLLECTION',
      validations: [{ name: 'metaobject_definition_id', value: requireGid(gidByType, 'ai_summary_block') }],
    },
  ];
}

function requireGid(gidByType, type) {
  const gid = gidByType.get(type);
  if (!gid) {
    throw new Error(
      `Expected metaobject definition "${type}" to have a GID by now. ` +
        'Ensure metaobject pass ran before metafield pass.',
    );
  }
  return gid;
}

// ---------------------------------------------------------------------------
// Idempotent ensure helpers
// ---------------------------------------------------------------------------

async function findMetaobjectDefinitionId(type) {
  const data = await gql(Q_METAOBJECT_DEFINITION_BY_TYPE, { type });
  return data.metaobjectDefinitionByType?.id ?? null;
}

async function findMetafieldDefinitionId({ ownerType, namespace, key }) {
  const data = await gql(Q_METAFIELD_DEFINITIONS, { ownerType, namespace, key });
  return data.metafieldDefinitions.edges[0]?.node?.id ?? null;
}

/**
 * Two-phase metaobject creation: first pass creates definitions WITHOUT
 * cross-metaobject `refType` references (Shopify needs the target GID). After
 * all are created, second pass would update them to add references — but for
 * the in-scope set the only intra-metaobject references are
 *   faq_group.items -> faq_item
 *   comparison_group.compare_attributes -> comparison_attribute_definition
 * We still pass them on creation if both already exist (re-runs); on a fresh
 * install we strip them and log a follow-up note. Worst case, faq_group.items
 * remains a generic list.metaobject_reference that the merchant can constrain
 * via the Admin UI later (this is acceptable per the brief — definitions
 * exist; cross-refs can be tightened later).
 */
async function ensureMetaobjectDefinition(def, gidByType) {
  const existing = await findMetaobjectDefinitionId(def.type);
  if (existing) {
    console.log(`[skip]   metaobject:${def.type} → ${existing}`);
    gidByType.set(def.type, existing);
    return { id: existing, status: 'skipped' };
  }

  // Build fieldDefinitions, resolving refType.
  // Shopify rejects list.metaobject_reference fields without a target
  // validation, so we MUST resolve the GID up front. Definitions are ordered
  // so that referenced types are created/discovered first.
  const missingRefs = [];
  const fieldDefinitions = def.fieldDefinitions.map((f) => {
    const out = { key: f.key, name: f.name, type: f.type, required: f.required ?? false };
    if (f.refType) {
      const refGid = gidByType.get(f.refType);
      if (refGid && !refGid.startsWith('gid://dry-run/')) {
        out.validations = [{ name: 'metaobject_definition_id', value: refGid }];
      } else if (refGid && refGid.startsWith('gid://dry-run/')) {
        // dry-run: skip validation since GID is fake.
        missingRefs.push(`${f.refType} (dry-run placeholder)`);
      } else {
        missingRefs.push(f.refType);
      }
    }
    return out;
  });

  if (DRY_RUN) {
    console.log(`[dry]    metaobject:${def.type} (would create${missingRefs.length ? `, refs to resolve at install: ${missingRefs.join(',')}` : ''})`);
    gidByType.set(def.type, `gid://dry-run/${def.type}`);
    return { id: 'dry-run', status: 'created' };
  }

  if (missingRefs.length) {
    throw new Error(
      `Cannot create metaobject:${def.type} — referenced types not found: ${missingRefs.join(',')}. ` +
        'Check METAOBJECT_DEFS ordering (referenced types must come first).',
    );
  }

  const input = {
    name: def.name,
    type: def.type,
    description: def.description,
    displayNameKey: def.displayNameKey,
    fieldDefinitions,
    access: { storefront: 'PUBLIC_READ' },
    capabilities: { translatable: { enabled: true } },
  };
  const data = await gql(M_METAOBJECT_DEFINITION_CREATE, { definition: input });
  const { metaobjectDefinition, userErrors } = data.metaobjectDefinitionCreate;
  if (userErrors.length) {
    // TAKEN means another runner created it between query + mutate; treat as skip.
    if (userErrors.every((e) => (e.code || '').toUpperCase() === 'TAKEN')) {
      const refetched = await findMetaobjectDefinitionId(def.type);
      if (refetched) {
        console.log(`[skip-r] metaobject:${def.type} → ${refetched}`);
        gidByType.set(def.type, refetched);
        return { id: refetched, status: 'skipped' };
      }
    }
    throw new Error(`metaobjectDefinitionCreate(${def.type}) userErrors: ${JSON.stringify(userErrors)}`);
  }
  console.log(`[create] metaobject:${def.type} → ${metaobjectDefinition.id}`);
  if (missingRefs.length) {
    console.log(`         (NOTE: ${def.type} created without cross-refs to ${missingRefs.join(',')} — re-run to tighten)`);
  }
  gidByType.set(def.type, metaobjectDefinition.id);
  return { id: metaobjectDefinition.id, status: 'created' };
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
    console.log(`[dry]    metafield:${label} (type=${def.type})`);
    return { id: 'dry-run', status: 'created' };
  }

  // Default: pin=false. Shopify caps pinned definitions per ownerType at 20,
  // and the brief installs ~50 product definitions. Definitions are still
  // editable in Admin (under "Custom data") and exposed via the storefront
  // even when unpinned. Set `pin: true` explicitly on a curated subset.
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
  console.log(`→ install-metafield-definitions on ${SHOP} (Admin API ${API_VERSION})`);
  console.log(`  store=${STORE} scope=${SCOPE} dry_run=${DRY_RUN}`);

  const counts = { created: 0, skipped: 0 };
  const tally = (s) => { if (s === 'created') counts.created++; else counts.skipped++; };

  // Pass 1: metaobject definitions (always installed when scope includes shared
  // or all — heating-only references some, but it's safe to install the full
  // metaobject set since they're cheap and other scopes will need them).
  const installMetaobjects = SCOPE === 'shared' || SCOPE === 'all' || SCOPE === 'heating';
  const gidByType = new Map();
  if (installMetaobjects) {
    console.log('\n--- §7 METAOBJECT DEFINITIONS ---');
    for (const def of METAOBJECT_DEFS) {
      const { status } = await ensureMetaobjectDefinition(def, gidByType);
      tally(status);
    }
  }

  // Pass 2: metafield definitions.
  if (SCOPE === 'shared' || SCOPE === 'all') {
    console.log('\n--- §2 SHARED PRODUCT METAFIELDS ---');
    for (const def of buildSharedProductDefs(gidByType)) {
      const { status } = await ensureMetafieldDefinition(def);
      tally(status);
    }
    console.log('\n--- §6 COLLECTION METAFIELDS ---');
    for (const def of buildCollectionDefs(gidByType)) {
      const { status } = await ensureMetafieldDefinition(def);
      tally(status);
    }
  }
  if (SCOPE === 'heating' || SCOPE === 'all') {
    console.log('\n--- §3 HEATING PRODUCT METAFIELDS ---');
    for (const def of buildHeatingProductDefs(gidByType)) {
      const { status } = await ensureMetafieldDefinition(def);
      tally(status);
    }
  }

  console.log(`\nDone. created: ${counts.created}, skipped: ${counts.skipped}${DRY_RUN ? ' (DRY RUN — no mutations)' : ''}`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
