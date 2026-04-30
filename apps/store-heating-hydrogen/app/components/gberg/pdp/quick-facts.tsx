/**
 * PDP "quick facts" — editorial spec block.
 *
 * Design Refresh — April 2026 (Complaint #3: "Description section isn't
 * visually appealing or self-explanatory"):
 *  - Migrated from generic chip-grid to the editorial `<SpecsTable>` with
 *    icon-decorated rows backed by the new specs metafields. Drives spec
 *    confidence above the long-form accordion.
 *  - The deriver (`buildStructuredSpecRows`) is the source of truth for
 *    row order; the icon mapping lives here so this presentation file
 *    stays a thin shell over the data shape.
 */
import {
  SpecsTable,
  SpecPowerIcon,
  SpecEnergyIcon,
  SpecDimensionsIcon,
  SpecInstallIcon,
  TrustWarrantyIcon,
} from '@gberg/ui';
import type {ReactNode} from 'react';
import type {HeatingProduct} from '@gberg/product-schema';
import {
  buildStructuredSpecRows,
  withSpecRowIcons,
  type StructuredSpecRowInput,
} from '~/lib/gberg/heating-derived';
import {useT} from '~/lib/gberg/i18n';

export interface QuickFactsProps {
  product: HeatingProduct;
  className?: string;
}

const SPEC_ICONS: Partial<Record<StructuredSpecRowInput['kind'], ReactNode>> = {
  wattage: <SpecPowerIcon />,
  energy_class: <SpecEnergyIcon />,
  room_coverage: <SpecPowerIcon />,
  dimensions: <SpecDimensionsIcon />,
  installation: <SpecInstallIcon />,
  // Reuse the warranty trust glyph here for visual continuity with the
  // buy-box trust strip — same shield, same brand language.
  warranty: <TrustWarrantyIcon />,
};

export function QuickFacts({product, className}: QuickFactsProps) {
  const t = useT();
  const rows = withSpecRowIcons(buildStructuredSpecRows(product), SPEC_ICONS);
  // Track B (April 2026): 41/55 catalog products have empty `specs{}`. The
  // structured deriver currently falls back to a default warranty row so
  // `rows` is rarely empty, but if it ever is — drop the section entirely
  // rather than render an empty-state shell that reads as broken.
  if (rows.length === 0) return null;
  return (
    <SpecsTable
      rows={rows}
      caption={t('pdp.specs_caption')}
      className={className}
    />
  );
}
