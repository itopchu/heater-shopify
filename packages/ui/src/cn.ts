/**
 * Lightweight class-name joiner. No deps. Falsy values are dropped.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
