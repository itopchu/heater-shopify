/**
 * /[locale]/blog → /[locale]/news redirect.
 *
 * The editorial index lives at /news (single source of truth). /blog is
 * kept as a redirect so historical / external links (and the verification
 * curl spec) resolve cleanly.
 */
import { redirect } from "next/navigation";
import { localeHref } from "@/lib/href";

export default async function BlogIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(localeHref(locale, "/news"));
}
