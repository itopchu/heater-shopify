/**
 * Translates xxl-heizung's collection handles to ours.
 *
 * Differences:
 *   - xxl drops umlauts entirely (Heizkörper → heizkorper)
 *   - We use ae/oe/ue substitution (Heizkörper → heizkoerper) for cleaner URLs
 *   - xxl has one typo: `pr-rt-rohre` for PE-RT pipes
 *   - xxl has `bestseller` and `frontpage` merchandising collections we don't mirror
 *
 * Handles not in this map are dropped (collection not mirrored).
 */

const MAP: Record<string, string> = {
  // Radiators family (xxl does not expose a top-level `heizkorper` parent;
  // our `heizkoerper` is an aggregate menu header that stays empty).
  austauschheizkorper: 'austauschheizkoerper',
  badheizkorper: 'badheizkoerper',
  'badheizkorper-elektrisch': 'badheizkoerper-elektrisch',
  wohnraumheizkorper: 'wohnraumheizkoerper',
  // Bathroom
  bad: 'bad',
  toiletten: 'toiletten',
  // Floor heating
  fussbodenheizung: 'fussbodenheizung',
  fussbodenheizungsrohre: 'fussbodenheizungsrohre',
  'pr-rt-rohre': 'pe-rt-rohre',
  // Accessories
  zubehor: 'zubehoer',
};

export function mapXxlCollectionHandle(xxlHandle: string): string | null {
  return MAP[xxlHandle] ?? null;
}
