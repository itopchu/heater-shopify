/**
 * Pure parser tests for the catalog-sync pipeline.
 *
 * Run with: `npx tsx --test agent/sync/normalize.test.ts`
 *
 * (Project has no Mocha/Vitest dep — uses Node's built-in `node:test`. The
 * `.ts` source is loaded via `tsx` so we don't need a build step.)
 *
 * Scope: pure-string parsers only. Does NOT exercise Shopify writes, Gemini,
 * fetchers, or any I/O. Inputs are inline HTML snippets that mirror the
 * shapes seen in agent/sync/__fixtures__/xxl-products.json.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeliveryContents } from './parse-body.js';
import { deriveWidthCmFallback } from './spec-defaults.js';

// ---------------------------------------------------------------------------
// parseDeliveryContents — German label variants
// ---------------------------------------------------------------------------

const LIEFER_VARIANTS: Array<{ name: string; html: string; expected: string[] }> = [
  {
    name: 'Lieferumfang heading + ul',
    html: '<h3>Lieferumfang</h3><ul><li>Heizkörper</li><li>Halterungen</li><li>Schrauben</li></ul>',
    expected: ['Heizkörper', 'Halterungen', 'Schrauben'],
  },
  {
    name: 'Im Lieferumfang enthalten heading + ul',
    html: '<h2>Im Lieferumfang enthalten</h2><ul><li>Thermostatventil</li><li>Thermostatkopf</li></ul>',
    expected: ['Thermostatventil', 'Thermostatkopf'],
  },
  {
    name: 'Inklusive bold-prefixed inline list',
    html: '<p><strong>Inklusive:</strong> 1x Heizstab, 1x Adapter, 1x Bedienungsanleitung</p>',
    expected: ['1x Heizstab', '1x Adapter', '1x Bedienungsanleitung'],
  },
  {
    name: 'Mitgeliefert bold + ul',
    html: '<p><b>Mitgeliefert</b></p><ul><li>Wandhalterung</li><li>Dübel-Set</li></ul>',
    expected: ['Wandhalterung', 'Dübel-Set'],
  },
  {
    name: 'Im Karton bold-prefixed inline list',
    html: '<p><strong>Im Karton:</strong> 1x Thermostatkopf, 2x Adapter, Bedienungsanleitung</p>',
    expected: ['1x Thermostatkopf', '2x Adapter', 'Bedienungsanleitung'],
  },
];

for (const v of LIEFER_VARIANTS) {
  test(`parseDeliveryContents: ${v.name}`, () => {
    const got = parseDeliveryContents(v.html);
    assert.deepEqual(got, v.expected, `expected ${JSON.stringify(v.expected)}, got ${JSON.stringify(got)}`);
  });
}

test('parseDeliveryContents: ignores non-matching headings', () => {
  const html = '<h3>Vorteile</h3><ul><li>Hygienisch</li><li>Leise</li></ul>';
  assert.deepEqual(parseDeliveryContents(html), []);
});

test('parseDeliveryContents: empty input returns []', () => {
  assert.deepEqual(parseDeliveryContents(''), []);
});

test('parseDeliveryContents: heading wrapped in deeply nested Elementor markup', () => {
  // Shape mirrors xxl-products.json `accessory` fixture — heading is wrapped
  // in many divs before the <ul> arrives.
  const html =
    '<div class="elementor-element"><div class="elementor-widget-container">' +
    '<h3 class="elementor-heading-title">Lieferumfang</h3></div></div>' +
    '<div class="elementor-element"><div><div><div><div><div>' +
    '<ul><li><span>Thermostatventil</span></li><li>Thermostatkopf</li><li>2 x Adapter 16 x 2,0</li></ul>' +
    '</div></div></div></div></div></div>';
  assert.deepEqual(parseDeliveryContents(html), ['Thermostatventil', 'Thermostatkopf', '2 x Adapter 16 x 2,0']);
});

// ---------------------------------------------------------------------------
// deriveWidthCmFallback — width regex
// ---------------------------------------------------------------------------

test('deriveWidthCmFallback: returns null on no-match', () => {
  assert.equal(deriveWidthCmFallback('Thermostatventil Set Chrom', '<p>Anschluss G 1/2</p>'), null);
});

test('deriveWidthCmFallback: empty inputs return null', () => {
  assert.equal(deriveWidthCmFallback('', ''), null);
});

test('deriveWidthCmFallback: matches "60cm"', () => {
  assert.equal(deriveWidthCmFallback('Badheizkörper 60cm Anthrazit'), 60);
});

test('deriveWidthCmFallback: matches "60 cm"', () => {
  assert.equal(deriveWidthCmFallback('Wohnraumheizkörper 60 cm seitlich'), 60);
});

test('deriveWidthCmFallback: matches "B 60"', () => {
  assert.equal(deriveWidthCmFallback('ELANOR Heizkörper B 60 H 140'), 60);
});

test('deriveWidthCmFallback: matches "Breite 60"', () => {
  assert.equal(deriveWidthCmFallback('Konrad Ventilheizkörper', '<p>Breite 60 cm, Höhe 140 cm</p>'), 60);
});

test('deriveWidthCmFallback: matches "Breite: 60 cm"', () => {
  assert.equal(deriveWidthCmFallback('', '<table><tr><td>Breite: 60 cm</td></tr></table>'), 60);
});

test('deriveWidthCmFallback: matches "60 × 140" picks first number', () => {
  assert.equal(deriveWidthCmFallback('ELANOR 60 × 140 Anthrazit'), 60);
});

test('deriveWidthCmFallback: rejects out-of-range numbers (10 cm)', () => {
  assert.equal(deriveWidthCmFallback('Mini accessory 10cm long'), null);
});

test('deriveWidthCmFallback: rejects out-of-range numbers (300 cm)', () => {
  assert.equal(deriveWidthCmFallback('Industrial heater 300cm wide'), null);
});

test('deriveWidthCmFallback: title takes precedence over body', () => {
  // Both contain a width — title wins because it's checked first.
  assert.equal(
    deriveWidthCmFallback('ELANOR 50cm Anthrazit', '<p>Breite 60 cm</p>'),
    50,
  );
});
