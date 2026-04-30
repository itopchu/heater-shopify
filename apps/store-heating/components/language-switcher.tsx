/**
 * Language switcher — disabled. The store is currently English-only.
 *
 * Kept as a no-op component so existing imports (header.tsx, utility-bar.tsx,
 * mobile-drawer.tsx) don't need to be edited. When/if multiple locales return,
 * restore the prior implementation from git history (commit before the EN-only
 * collapse).
 */
export default function LanguageSwitcher(_props: { locale?: string }): null {
  return null;
}

export { LanguageSwitcher };
export function LanguageSwitcherButton(): null {
  return null;
}
