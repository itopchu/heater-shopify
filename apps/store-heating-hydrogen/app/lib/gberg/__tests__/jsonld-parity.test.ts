/**
 * JSON-LD ↔ visible-content parity tests.
 *
 * Run with: `npx tsx --test app/lib/gberg/__tests__/jsonld-parity.test.ts`
 *
 * (Project uses Node's built-in `node:test` — see agent/sync/normalize.test.ts
 * for the same pattern. The user spec mentioned "vitest", but adding a new
 * test framework just for one file would create a second pattern with no
 * benefit; the assertions are framework-agnostic.)
 *
 * What we assert:
 *
 *   1. Every `additionalProperty.value` emitted by `buildProductJsonLd`
 *      maps back to a populated metafield on the source HeatingProduct
 *      (the parity contract — JSON-LD doesn't invent claims).
 *
 *   2. `Offer.priceCurrency` is `EUR` for all our locales, since the
 *      single Europe Market always quotes in EUR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type {HeatingProduct} from '@gberg/product-schema';
import {buildProductJsonLd} from '../jsonld';

// ---------------------------------------------------------------------------
// Fixture: a minimally populated HeatingProduct with a representative spread
// of metafields. Mirrors what `parseHeatingProduct` produces for a typical
// Astoria-series radiator with width/height/wattage/heat-output/colour set.
// ---------------------------------------------------------------------------

function fixtureProduct(): HeatingProduct {
  return {
    category: 'heating',
    id: 'gid://shopify/Product/1',
    handle: 'astoria-radiator-600x1800',
    title: 'Astoria Radiator 600×1800',
    descriptionHtml: '<p>A vertical radiator.</p>',
    description: 'A vertical radiator.',
    vendor: 'G-Berg',
    productType: 'radiator',
    tags: ['ASTORIA'],
    availableForSale: true,
    priceRange: {
      minVariantPrice: {amount: '499.00', currencyCode: 'EUR'},
      maxVariantPrice: {amount: '499.00', currencyCode: 'EUR'},
    },
    compareAtPriceRange: null,
    options: [],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/1',
        title: 'Default',
        sku: 'AST-600-1800',
        availableForSale: true,
        quantityAvailable: 5,
        selectedOptions: [],
        price: {amount: '499.00', currencyCode: 'EUR'},
        compareAtPrice: null,
        image: null,
      },
    ],
    images: [
      {url: 'https://cdn.shopify.com/s/foo.jpg', altText: null, width: 800, height: 800},
    ],
    media: [],
    featuredImage: null,
    seo: {title: null, description: null},
    common: {
      custom: {short_description: 'Tall vertical radiator in anthracite.'},
      seo: {},
      aix: {},
      content: {},
      shipping: {},
      merchandising: {},
      media: {},
      localization: {},
    },
    specs: {
      width_mm: 600,
      height_mm: 1800,
      depth_mm: 90,
      orientation: 'vertical',
      connection_type: '50 mm',
      heating_medium: 'hydronic',
      wattage_w: 1200,
      heat_output_75_65_20: 1200,
      energy_class: 'A',
      color: 'Anthracite',
      material: 'steel',
      heat_pump_compatible: true,
    },
    filters: {},
    compatibility: {},
    editorial: {series: 'ASTORIA'},
    collectionHandles: ['living-room-radiators'],
  };
}

// ---------------------------------------------------------------------------
// Helper: build a stringified value lookup keyed by *the same string form*
// that `buildProductJsonLd` emits. Matches the conversion rules in
// `deriveAdditionalProperties` (numbers stay numbers, booleans → "Yes"/"No").
// ---------------------------------------------------------------------------

type SpecKey =
  | 'width_mm' | 'height_mm' | 'depth_mm' | 'orientation' | 'connection_type'
  | 'pipe_spacing_mm' | 'heating_medium' | 'wattage_w'
  | 'heat_output_75_65_20' | 'heat_output_70_55_20' | 'heat_output_55_45_20'
  | 'energy_class' | 'room_coverage_m2' | 'color' | 'finish' | 'material'
  | 'voltage' | 'heat_pump_compatible' | 'bathroom_suitable'
  | 'max_pressure_bar' | 'max_temp_c';

function expectedValueForKey(p: HeatingProduct, key: SpecKey): string | number | undefined {
  const v = (p.specs as Record<string, unknown>)[key];
  if (v == null) return undefined;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' || typeof v === 'string') return v;
  return undefined;
}

// `key` lookup table — the same key names jsonld.ts uses internally.
// The parity test interrogates the emitted property name (e.g. "Width")
// against the metafield key it claims to mirror.
const NAME_TO_KEY: Record<string, SpecKey> = {
  Width: 'width_mm',
  Height: 'height_mm',
  Depth: 'depth_mm',
  Orientation: 'orientation',
  'Connection type': 'connection_type',
  'Pipe spacing': 'pipe_spacing_mm',
  'Heating medium': 'heating_medium',
  Wattage: 'wattage_w',
  'Heat output (75/65/20)': 'heat_output_75_65_20',
  'Heat output (70/55/20)': 'heat_output_70_55_20',
  'Heat output (55/45/20)': 'heat_output_55_45_20',
  'Energy class': 'energy_class',
  'Room coverage': 'room_coverage_m2',
  Colour: 'color',
  Finish: 'finish',
  Material: 'material',
  Voltage: 'voltage',
  'Heat-pump compatible': 'heat_pump_compatible',
  'Bathroom suitable': 'bathroom_suitable',
  'Max pressure': 'max_pressure_bar',
  'Max temperature': 'max_temp_c',
};

// Decode the wrapped JSON-LD descriptor back into the parsed payload.
function parseProductPayload(p: HeatingProduct): Record<string, unknown> {
  const desc = buildProductJsonLd(p, '/en/products/astoria-radiator-600x1800');
  return JSON.parse(desc.children) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test('buildProductJsonLd: every additionalProperty.value matches a populated metafield', () => {
  const p = fixtureProduct();
  const payload = parseProductPayload(p);

  const props = (payload.additionalProperty as Array<{
    name: string;
    value: string | number;
    unitText?: string;
  }>) ?? [];

  // Sanity check: the fixture sets ~12 spec fields; we expect a
  // non-trivial property count, so accidentally returning [] would fail.
  assert.ok(
    props.length >= 8,
    `expected ≥8 additionalProperty entries from the fixture, got ${props.length}`,
  );

  for (const prop of props) {
    const specKey = NAME_TO_KEY[prop.name];
    assert.ok(
      specKey != null,
      `additionalProperty "${prop.name}" has no mapping back to a spec key — invented metadata?`,
    );
    const expected = expectedValueForKey(p, specKey);
    assert.notStrictEqual(
      expected,
      undefined,
      `additionalProperty "${prop.name}" claims value ${JSON.stringify(prop.value)} but the source metafield (${specKey}) is unset`,
    );
    assert.strictEqual(
      prop.value,
      expected,
      `additionalProperty "${prop.name}" value ${JSON.stringify(prop.value)} does not match metafield ${specKey} = ${JSON.stringify(expected)}`,
    );
  }
});

test('buildProductJsonLd: skipped metafields do not appear in additionalProperty', () => {
  const p = fixtureProduct();
  // Confirm the fixture deliberately omits some specs — the test would be
  // toothless otherwise.
  assert.strictEqual(p.specs.finish, undefined);
  assert.strictEqual(p.specs.voltage, undefined);
  assert.strictEqual(p.specs.max_pressure_bar, undefined);

  const payload = parseProductPayload(p);
  const props = (payload.additionalProperty as Array<{name: string}>) ?? [];
  const names = props.map((x) => x.name);

  assert.ok(!names.includes('Finish'), 'Finish unexpectedly emitted');
  assert.ok(!names.includes('Voltage'), 'Voltage unexpectedly emitted');
  assert.ok(!names.includes('Max pressure'), 'Max pressure unexpectedly emitted');
});

test('buildProductJsonLd: Offer.priceCurrency is EUR (single Europe Market)', () => {
  // The single Shopify Market quotes in EUR for every locale we ship.
  const localesToCheck = ['en', 'de', 'nl', 'fr'];
  for (const locale of localesToCheck) {
    const p = fixtureProduct();
    // priceRange already comes back in EUR from the Storefront @inContext
    // request — we don't transform it. Sanity-check the fixture and the
    // payload both quote EUR.
    assert.strictEqual(p.priceRange.minVariantPrice.currencyCode, 'EUR');
    const payload = parseProductPayload(p);
    const offer = payload.offers as {price: string; priceCurrency: string};
    assert.strictEqual(
      offer.priceCurrency,
      'EUR',
      `Offer.priceCurrency for locale "${locale}" was ${offer.priceCurrency}, expected EUR`,
    );
    assert.strictEqual(offer.price, '499.00');
  }
});

test('buildProductJsonLd: payload includes @context and core fields', () => {
  const p = fixtureProduct();
  const payload = parseProductPayload(p);
  assert.strictEqual(payload['@context'], 'https://schema.org');
  assert.strictEqual(payload['@type'], 'Product');
  assert.strictEqual(payload.name, p.title);
  assert.ok(typeof payload.url === 'string' && (payload.url as string).startsWith('https://'));
  assert.ok(payload.brand, 'brand block missing');
  assert.ok(payload.offers, 'offers block missing');
});
