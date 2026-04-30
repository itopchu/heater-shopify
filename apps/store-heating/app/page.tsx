import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * Root index — redirects to the default locale segment.
 *
 * NL is the primary launch locale per master brief 01 / 07 §12. The
 * env override (NEXT_PUBLIC_DEFAULT_LOCALE) is kept as an escape hatch
 * for local QA — it must NEVER be used in production to flip the default
 * away from NL without a brief update.
 */
export default function RootIndex() {
  const defaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? DEFAULT_LOCALE;
  redirect(`/${defaultLocale}`);
}
