/**
 * GET /api/predictive-search?q=…&locale=…
 *
 * Server-side wrapper around the Storefront API `predictiveSearch` query.
 * Lets the client-side header overlay fetch typeahead results without
 * exposing the Storefront access token to the browser. We do not cache —
 * predictive results are user-typed and short-TTL.
 *
 * Returns a JSON envelope: { products, collections, queries }.
 */
import type { NextRequest } from "next/server";
import { fetchPredictiveSearch } from "@/lib/queries";
import { normalizeLocale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const localeParam = url.searchParams.get("locale") ?? "nl";
  const locale = normalizeLocale(localeParam);

  const data = await fetchPredictiveSearch(q, locale, 6);
  return Response.json(data, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
