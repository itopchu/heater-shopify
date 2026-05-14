/**
 * "Who is this for?" — a one-line, server-rendered suitability statement
 * for the PDP, derived from the product's `filters.room_type` and
 * `specs.room_coverage_m2` metafields.
 *
 * Pitched at AI answer engines and skim-readers: it answers the "is this
 * the right radiator for my room?" question in plain prose, mirroring data
 * that's also in <QuickFacts> / the spec table (parity rule — see
 * jsonld.ts). Renders nothing when neither field is set, so sparsely-tagged
 * products don't get an empty heading (≈half the catalog lacks full specs).
 */
import {Eyebrow} from '@gberg/ui';
import type {HeatingProduct} from '@gberg/product-schema';
import {useT} from '~/lib/gberg/i18n';

function humanizeRoom(raw: string): string {
  const s = raw.trim().replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function WhoItsFor({product}: {product: HeatingProduct}) {
  const t = useT();
  const room = product.filters?.room_type?.trim();
  const m2 = product.specs?.room_coverage_m2;
  if (!room && m2 == null) return null;

  let body: string;
  if (room && m2 != null) {
    body = t('pdp.who_its_for_room_and_area', {room: humanizeRoom(room), m2: String(m2)});
  } else if (room) {
    body = t('pdp.who_its_for_room_only', {room: humanizeRoom(room)});
  } else {
    body = t('pdp.who_its_for_area_only', {m2: String(m2)});
  }

  return (
    <section
      aria-label={t('pdp.who_its_for')}
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <Eyebrow>{t('pdp.who_its_for')}</Eyebrow>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text)]">{body}</p>
    </section>
  );
}
