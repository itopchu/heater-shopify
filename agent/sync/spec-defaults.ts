/**
 * Per-product-type default spec rows. Used when parseSpecTable(body_html)
 * returns null — i.e. xxl-heizung has no inline spec table for that SKU.
 *
 * Authored once per product_type. EN is the source of truth (store default
 * locale). DE values are emitted in a parallel metafield (custom.specs_de)
 * so the theme can pick the locale-correct rendering at request time without
 * an extra translation-registration round-trip.
 *
 * The keys here are localised as well — German visitors see German labels.
 *
 * Match strategy: case-insensitive substring match on xxl product_type +
 * tags. First matching ruleset wins. Falls back to the 'default' ruleset.
 */

export interface SpecRow {
  label_en: string;
  label_de: string;
  value_en: string;
  value_de: string;
}

interface SpecRuleset {
  /** Matchers (case-insensitive substrings on product_type or any tag). */
  match: string[];
  rows: SpecRow[];
}

const RULES: SpecRuleset[] = [
  {
    match: ['badheizkörper', 'badheizkoerper', 'wohnraumheizkörper', 'wohnraumheizkoerper', 'austauschheizkörper', 'austauschheizkoerper', 'heizkörper'],
    rows: [
      { label_en: 'Material',        label_de: 'Material',         value_en: 'Powder-coated steel (SPCC)',     value_de: 'Pulverbeschichteter Stahl (SPCC)' },
      { label_en: 'Finish',          label_de: 'Oberfläche',       value_en: 'Matte powder coating',            value_de: 'Pulverbeschichtung, seidenmatt' },
      { label_en: 'Connection',      label_de: 'Anschluss',        value_en: 'G ½″ thread, 4 connection ports', value_de: 'G ½″ Gewinde, 4 Anschlussöffnungen' },
      { label_en: 'Standard',        label_de: 'Norm',             value_en: 'DIN EN 442 · TÜV-tested',         value_de: 'DIN EN 442 · TÜV geprüft' },
      { label_en: 'Warranty',        label_de: 'Garantie',         value_en: '10 years on material and workmanship', value_de: '10 Jahre auf Material und Verarbeitung' },
      { label_en: 'Country of origin', label_de: 'Herkunft',       value_en: 'Manufactured to German standards',  value_de: 'Gefertigt nach deutscher Norm' },
    ],
  },
  {
    match: ['toiletten', 'wc', 'hänge-wc', 'haenge-wc'],
    rows: [
      { label_en: 'Type',            label_de: 'Bauart',           value_en: 'Wall-hung',                       value_de: 'Wandhängend' },
      { label_en: 'Flush',           label_de: 'Spülart',          value_en: 'Tornado / Vortex flush',          value_de: 'Wirbelspülung (Tornado)' },
      { label_en: 'Material',        label_de: 'Material',         value_en: 'High-grade glazed ceramic',       value_de: 'Hochwertige glasierte Keramik' },
      { label_en: 'Seat',            label_de: 'Sitz',             value_en: 'Soft-close, take-off compatible', value_de: 'Softclose, abnehmbar' },
      { label_en: 'Mounting',        label_de: 'Befestigung',      value_en: 'Compatible with standard concealed cisterns', value_de: 'Kompatibel mit handelsüblichen Unterputzspülkästen' },
      { label_en: 'Standard',        label_de: 'Norm',             value_en: 'EN 997',                          value_de: 'EN 997' },
    ],
  },
  {
    match: ['fußbodenheizung', 'fussbodenheizung', 'pe-rt', 'rohre'],
    rows: [
      { label_en: 'Material',        label_de: 'Material',         value_en: 'PE-RT 5-layer composite',         value_de: 'PE-RT 5-Schicht-Verbund' },
      { label_en: 'Layer build',     label_de: 'Schichtaufbau',    value_en: 'PE-RT / EVOH oxygen barrier / PE-RT', value_de: 'PE-RT / EVOH-Sauerstoffsperre / PE-RT' },
      { label_en: 'Pressure rating', label_de: 'Druckfest',        value_en: '6 bar @ 70 °C',                   value_de: '6 bar @ 70 °C' },
      { label_en: 'Oxygen barrier',  label_de: 'Sauerstoffdicht',  value_en: 'Yes (EVOH layer)',                value_de: 'Ja (EVOH-Schicht)' },
      { label_en: 'Standard',        label_de: 'Norm',             value_en: 'DIN 4726 · ISO 22391',            value_de: 'DIN 4726 · ISO 22391' },
      { label_en: 'Warranty',        label_de: 'Garantie',         value_en: '10 years',                        value_de: '10 Jahre' },
    ],
  },
  {
    match: ['zubehör', 'zubehoer', 'thermostat', 'ventil', 'heizstab', 'multiblock', 'hahnblock', 'befestigung', 'thermo'],
    rows: [
      { label_en: 'Material',        label_de: 'Material',         value_en: 'Brass / chrome-plated',            value_de: 'Messing / verchromt' },
      { label_en: 'Connection',      label_de: 'Anschluss',        value_en: 'G ½″ standard',                    value_de: 'G ½″ Standard' },
      { label_en: 'Standard',        label_de: 'Norm',             value_en: 'DIN EN 215',                       value_de: 'DIN EN 215' },
      { label_en: 'Warranty',        label_de: 'Garantie',         value_en: '5 years on material and workmanship', value_de: '5 Jahre auf Material und Verarbeitung' },
    ],
  },
];

const DEFAULT_RULES: SpecRow[] = [
  { label_en: 'Standard',  label_de: 'Norm',     value_en: 'DIN EN — manufactured to German standards', value_de: 'DIN EN — Fertigung nach deutscher Norm' },
  { label_en: 'Warranty',  label_de: 'Garantie', value_en: '10 years on material and workmanship',       value_de: '10 Jahre auf Material und Verarbeitung' },
  { label_en: 'Shipping',  label_de: 'Versand',  value_en: 'Free EU delivery, 2–4 business days',        value_de: 'Kostenloser EU-Versand, 2–4 Werktage' },
  { label_en: 'Returns',   label_de: 'Rückgabe', value_en: '14-day right of withdrawal',                 value_de: '14 Tage Widerrufsrecht' },
];

/**
 * Returns the per-type default rows for a product, or DEFAULT_RULES if no
 * ruleset matches. Match logic is case-insensitive substring against
 * product_type, tags, AND handle (xxl strips umlauts in handles, so we also
 * normalise umlauts both ways before matching).
 */
// ---------------------------------------------------------------------------
// width_cm fallback (Sprint 3)
// ---------------------------------------------------------------------------
// 11/55 products had no first-variant width because their option strings don't
// match the "60×140" parser in parse-body.ts (option is e.g. "Anthrazit" or
// "Default Title"). Mine the title and body HTML for explicit width hints.
// Returns null (NOT 0) when nothing parses, so the metafield write skips the
// row cleanly rather than emitting `width_cm: 0` — Shopify number_decimal=0
// would render as a real "0 cm" facet bucket on the PLP.

const WIDTH_PATTERNS: RegExp[] = [
  // "60cm" / "60 cm" / "60-cm"
  /(\d{2,3})\s*[-]?\s*cm\b/i,
  // "B 60" / "B: 60" / "Breite 60" / "Breite: 60 cm"
  /\b(?:B|Breite|Width|W)[\s:]+(\d{2,3})(?:\s*cm)?\b/i,
  // "60 × 140" / "60×140" — width is the first number (Shopify variant convention)
  /(\d{2,3})\s*[x×]\s*\d{2,4}\b/i,
];

/**
 * Mine width-in-cm from product title and/or body HTML when the structured
 * variant-option parser yielded nothing. Returns null when no pattern matches.
 *
 * Range guard: 20–250 cm. Anything outside is treated as a non-width number
 * (e.g. wattage, weight, year) and skipped.
 */
export function deriveWidthCmFallback(title: string, bodyHtml = ''): number | null {
  const candidates = [title || '', bodyHtml || ''];
  for (const src of candidates) {
    if (!src) continue;
    for (const re of WIDTH_PATTERNS) {
      const m = src.match(re);
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isFinite(n)) continue;
      if (n < 20 || n > 250) continue;
      return n;
    }
  }
  return null;
}

export function specDefaultsFor(productType: string, tags: string[], handle = ''): SpecRow[] {
  const raw = [productType, handle, ...tags].join(' ').toLowerCase();
  // Normalise: strip umlauts AND keep the umlaut version, so either matcher form hits
  const stripped = raw
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  const haystack = `${raw} ${stripped}`;
  for (const r of RULES) {
    for (const m of r.match) {
      const ml = m.toLowerCase();
      const ms = ml.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
      if (haystack.includes(ml) || haystack.includes(ms)) return r.rows;
    }
  }
  return DEFAULT_RULES;
}
