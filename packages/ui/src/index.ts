export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./button";
export { Eyebrow, type EyebrowProps } from "./eyebrow";
export { Chip, type ChipProps, type ChipTone } from "./chip";
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from "./breadcrumb";
export { FaqAccordion, type FaqAccordionProps, type FaqItem } from "./faq-accordion";
// `SpecsTableRow` is the canonical row-shape type for <SpecsTable>.
export { SpecsTable, type SpecsTableProps, type SpecsTableRow } from "./specs-table";
export {
  BadgePill,
  badgeLabel,
  badgeTone,
  type BadgePillProps,
  type BadgeTone,
} from "./badge-pill";
export { cn } from "./cn";

/* New atoms — Track A design refresh. */
export {
  Hairline,
  type HairlineProps,
  type HairlineOrientation,
  type HairlineTone,
} from "./hairline";
// New <SpecRow> component (editorial spec row used inside the PDP).
// Component value lives in the value namespace; the `SpecRow` *type* alias
// declared further down lives in the type namespace, so the two share the
// bare name without collision.
export { SpecRow as SpecRowComponent, type SpecRowProps } from "./spec-row";

import { SpecRow as _SpecRowImpl } from "./spec-row";
import type { SpecsTableRow as _SpecsTableRowImpl } from "./specs-table";

/**
 * Bare `SpecRow` export. Value namespace = the new <SpecRow> component.
 * Type namespace = the legacy `SpecsTableRow` shape used by older route
 * code. Declaring them locally (rather than re-exporting) is the only
 * way TypeScript will allow the same identifier in both namespaces from
 * a barrel module.
 */
export const SpecRow = _SpecRowImpl;
export type SpecRow = _SpecsTableRowImpl;

export {
  TrustStrip,
  type TrustStripProps,
  type TrustItem,
} from "./trust-strip";
export {
  SelectField,
  DropdownPanel,
  type SelectFieldProps,
  type DropdownPanelProps,
} from "./select-field";

/* Icon namespace — re-exported barrel. */
export * from "./icons";
