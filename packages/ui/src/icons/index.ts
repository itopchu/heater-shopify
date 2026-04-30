/**
 * Tree-shakeable barrel for the @gberg/ui icon set.
 *
 * Each icon is its own module so consumers can deep-import a single icon
 * (`import {TrustWarrantyIcon} from "@gberg/ui/icons/trust-warranty"`)
 * without dragging in the full set, while the namespaced barrel below
 * keeps the ergonomic `import {TrustWarrantyIcon} from "@gberg/ui"`
 * shorthand working.
 *
 * Visual rules (enforced by review, not by code):
 *  - 24×24 viewBox, integer coordinates only.
 *  - stroke="currentColor", strokeWidth={1.5}, fill="none".
 *  - strokeLinecap/strokeLinejoin "round".
 *  - No gradients, no embedded text, no emoji.
 */
export {TrustWarrantyIcon} from "./trust-warranty";
export {TrustReturnIcon} from "./trust-return";
export {TrustDeliveryIcon} from "./trust-delivery";
export {TrustSecureIcon} from "./trust-secure";
export {SpecPowerIcon} from "./spec-power";
export {SpecEnergyIcon} from "./spec-energy";
export {SpecDimensionsIcon} from "./spec-dimensions";
export {SpecInstallIcon} from "./spec-install";
export {ChevronDownIcon} from "./chevron-down";
