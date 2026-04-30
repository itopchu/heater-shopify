/**
 * Design tokens — TypeScript exports.
 * The canonical source of truth is the CSS files (tokens.css + brand skins).
 * Use these constants only when CSS variables can't be used (e.g. inline calculations,
 * Tailwind config). Otherwise reference `var(--token-name)` in styles.
 *
 * Spec ref: shop/04_design_system_spec.md
 */

export const space = {
  4: "0.25rem",
  8: "0.5rem",
  12: "0.75rem",
  16: "1rem",
  24: "1.5rem",
  32: "2rem",
  48: "3rem",
  64: "4rem",
  96: "6rem",
} as const;

export const radius = {
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
} as const;

export const shadow = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
  md: "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
  lg: "0 16px 40px -8px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06)",
} as const;

/** Brand skin: heating. Mirrors src/heating.css. */
export const heatingPalette = {
  bg: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceMuted: "#F2F4F5",
  surfaceInverse: "#0F1115",
  text: "#0F1115",
  textMuted: "#5B6470",
  border: "#E3E6EA",
  borderStrong: "#C9CFD6",
  primary: "#3D6E70",
  primaryHover: "#2F5759",
  accent: "#C8102E",
  accentHover: "#8A0B1F",
  success: "#1F7A4A",
  warning: "#B7791F",
  error: "#B3261E",
  info: "#2E5A88",
} as const;

/** Available brand skins. Add new entries when stores are added. */
export type BrandSkin = "heating" | "underwear" | "furniture";

/** CSS custom property names exposed by tokens.css + brand skins. */
export type TokenName =
  | `--space-${4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96}`
  | `--radius-${"sm" | "md" | "lg" | "xl"}`
  | `--shadow-${"sm" | "md" | "lg"}`
  | `--color-${
      | "bg"
      | "surface"
      | "surface-muted"
      | "text"
      | "text-muted"
      | "border"
      | "primary"
      | "primary-hover"
      | "accent"
      | "success"
      | "warning"
      | "error"}`;

/** Helper: produce a CSS var() reference. */
export const token = (name: TokenName): string => `var(${name})`;
