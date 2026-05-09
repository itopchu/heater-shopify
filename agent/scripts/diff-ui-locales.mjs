#!/usr/bin/env node
/**
 * Compare app/locales/en.json against de/nl/fr siblings in the Hydrogen
 * storefront and emit:
 *   - data/translations/ui-strings-<stamp>/missing-<locale>.csv
 *       rows for every dotted-key whose value differs only because the
 *       target locale is absent or empty
 *   - data/translations/ui-strings-<stamp>/all.csv
 *       full table: key, EN, DE, NL, FR — pasteable into a translator's
 *       sheet
 *
 * Read-only on the locale files. Run any time the EN keys change.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const LOCALE_DIR = resolve(
  ROOT,
  'apps',
  'store-heating-hydrogen',
  'app',
  'locales',
);
const TARGETS = ['de', 'nl', 'fr'];

function loadDict(locale) {
  const p = resolve(LOCALE_DIR, `${locale}.json`);
  if (!existsSync(p)) {
    console.warn(`  warn: ${locale}.json missing`);
    return {};
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

function flatten(obj, prefix = '', out = {}) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj === 'string') {
    out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out[prefix] = String(obj);
  return out;
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvLine(cells) {
  return cells.map(csvCell).join(',');
}

const en = flatten(loadDict('en'));
const dicts = Object.fromEntries(
  TARGETS.map((loc) => [loc, flatten(loadDict(loc))]),
);

const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = resolve(ROOT, 'data', 'translations', `ui-strings-${STAMP}`);
mkdirSync(OUT_DIR, {recursive: true});

// "missing" = key present in EN but absent or empty or identical in target
const missingByLocale = Object.fromEntries(TARGETS.map((l) => [l, []]));
const allRows = [['key', 'value_en', ...TARGETS.map((l) => `value_${l}`)]];

for (const [key, enVal] of Object.entries(en)) {
  const row = [key, enVal];
  for (const loc of TARGETS) {
    const v = dicts[loc][key] ?? '';
    row.push(v);
    if (!v || v === enVal) {
      missingByLocale[loc].push([key, enVal]);
    }
  }
  allRows.push(row);
}

writeFileSync(
  resolve(OUT_DIR, 'all.csv'),
  allRows.map(csvLine).join('\n'),
  'utf8',
);

for (const loc of TARGETS) {
  const rows = [['key', 'value_en', `value_${loc}_TODO`]];
  for (const [k, v] of missingByLocale[loc]) {
    rows.push([k, v, '']);
  }
  writeFileSync(
    resolve(OUT_DIR, `missing-${loc}.csv`),
    rows.map(csvLine).join('\n'),
    'utf8',
  );
}

const summary = {
  exportedAt: new Date().toISOString(),
  totalEnKeys: Object.keys(en).length,
  missingPerLocale: Object.fromEntries(
    TARGETS.map((l) => [l, missingByLocale[l].length]),
  ),
};
writeFileSync(
  resolve(OUT_DIR, 'summary.json'),
  JSON.stringify(summary, null, 2),
  'utf8',
);

console.log(`✓ ${Object.keys(en).length} EN keys`);
for (const l of TARGETS) {
  const m = missingByLocale[l].length;
  console.log(`  ${l}: ${m} missing/identical`);
}
console.log(`\n✓ written to ${OUT_DIR}`);
