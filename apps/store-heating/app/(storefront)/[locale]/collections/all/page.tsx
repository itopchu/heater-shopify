/**
 * /[locale]/collections/all → /[locale]/products redirect.
 *
 * `all` is not a real Shopify collection — Shopify does not auto-create it.
 * The shop-all catalogue lives at `/products`; this redirect keeps the
 * familiar `/collections/all` URL working for inbound links.
 */
import { redirect } from "next/navigation";
import { localeHref } from "@/lib/href";

export default async function CollectionsAll({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(localeHref(locale, "/products"));
}
