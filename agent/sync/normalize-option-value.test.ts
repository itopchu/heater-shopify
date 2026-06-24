/**
 * Unit tests for normalize-option-value.ts.
 *
 * Run with: `npx tsx --test agent/sync/normalize-option-value.test.ts`
 *
 * Project convention: node:test runner (no Mocha/Vitest). See normalize.test.ts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOptionValue } from './normalize-option-value.js';

test('strips baked-in German availability suffix from a dimension value', () => {
  assert.equal(normalizeOptionValue('50 x 180 nicht Vorrätig'), '50 × 180');
  assert.equal(normalizeOptionValue('50 × 180 nicht Vorrätig'), '50 × 180');
  assert.equal(normalizeOptionValue('50, 180 nicht Vorrätig'), '50 × 180'); // comma separator canonicalized
});

test('strips future-availability notes ("Lieferbar ab KW 21", "available from")', () => {
  assert.equal(normalizeOptionValue('60 × 180 Lieferbar ab KW 21'), '60 × 180');
  assert.equal(normalizeOptionValue('70 x 180 Lieferbar ab KW 21'), '70 × 180');
  assert.equal(normalizeOptionValue('60, 158 Lieferbar ab KW 21'), '60 × 158');
  assert.equal(normalizeOptionValue('50 × 180 available from week 30'), '50 × 180');
});

test('canonicalizes a stray comma dimension separator but never a decimal', () => {
  assert.equal(normalizeOptionValue('60, 180'), '60 × 180');
  assert.equal(normalizeOptionValue('1,5 m'), '1,5 m'); // decimal — untouched
  assert.equal(normalizeOptionValue('1,5'), '1,5'); // single digits — untouched
});

test('strips a range of DE/EN availability phrases', () => {
  assert.equal(normalizeOptionValue('60 x 160 ausverkauft'), '60 × 160');
  assert.equal(normalizeOptionValue('60 x 160 vergriffen'), '60 × 160');
  assert.equal(normalizeOptionValue('60 x 160 nicht verfügbar'), '60 × 160');
  assert.equal(normalizeOptionValue('60 x 160 - out of stock'), '60 × 160');
  assert.equal(normalizeOptionValue('60 x 160 (sold out)'), '60 × 160');
  assert.equal(normalizeOptionValue('60 x 160 auf Anfrage'), '60 × 160');
});

test('canonicalizes the dimension separator (x / × / no-space)', () => {
  assert.equal(normalizeOptionValue('40x160'), '40 × 160');
  assert.equal(normalizeOptionValue('40 X 160'), '40 × 160');
  assert.equal(normalizeOptionValue('40 × 160'), '40 × 160');
});

test('is idempotent on already-clean values', () => {
  for (const v of ['40 × 160', '50 × 180', '60 × 180']) {
    assert.equal(normalizeOptionValue(v), v);
    assert.equal(normalizeOptionValue(normalizeOptionValue(v)), v);
  }
});

test('does not mangle non-dimension option values', () => {
  assert.equal(normalizeOptionValue('Weiß'), 'Weiß');
  assert.equal(normalizeOptionValue('Anthrazit'), 'Anthrazit');
  assert.equal(normalizeOptionValue('Mittelanschluss'), 'Mittelanschluss');
  assert.equal(normalizeOptionValue('1200 W'), '1200 W');
  assert.equal(normalizeOptionValue('Befüllt'), 'Befüllt');
  // A thread code like "2x M22" must not be treated as a dimension separator.
  assert.equal(normalizeOptionValue('2x M22'), '2x M22');
});

test('collapses whitespace and trims', () => {
  assert.equal(normalizeOptionValue('  50   x   180  '), '50 × 180');
});
