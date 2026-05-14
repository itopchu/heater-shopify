import {redirect} from 'react-router';

/**
 * Look up Shopify's URL Redirects table for the request's pathname, and
 * throw a 301 if a redirect exists. Used by route loaders when a product /
 * collection / page lookup misses — the resource may have been renamed
 * (new handle), in which case the rename script registered a redirect
 * record we should honour instead of falling straight through to 404/410.
 *
 * Returns nothing on a real miss; the caller then emits its own status.
 */
export async function maybeShopifyRedirect(
  request: Request,
  storefront: {
    query: <T>(
      q: string,
      opts?: {variables?: Record<string, unknown>; cache?: unknown},
    ) => Promise<T>;
  },
): Promise<void> {
  const url = new URL(request.url);
  const path = url.pathname;
  // Strip a leading locale segment (e.g. /de/products/x → /products/x) — the
  // URL Redirects table is stored without the locale prefix.
  const stripped = path.replace(/^\/(de|nl|fr)(\/|$)/, '/');
  const data = await storefront.query<{
    urlRedirects: {nodes: Array<{path: string; target: string}>};
  }>(
    `#graphql
    query Redirect($q: String!) {
      urlRedirects(first: 1, query: $q) { nodes { path target } }
    }`,
    {variables: {q: `path:${stripped}`}},
  );
  const hit = data?.urlRedirects?.nodes?.[0];
  if (!hit?.target) return;
  // Re-add the locale prefix if we stripped one, so the user stays in the
  // same language after the redirect.
  const localePrefix = path.match(/^\/(de|nl|fr)(?=\/|$)/)?.[0] ?? '';
  const target = hit.target.startsWith('http')
    ? hit.target
    : `${localePrefix}${hit.target}${url.search}`;
  throw redirect(target, 301);
}

export function redirectIfHandleIsLocalized(
  request: Request,
  ...localizedResources: Array<{
    handle: string;
    data: {handle: string} & unknown;
  }>
) {
  const url = new URL(request.url);
  let shouldRedirect = false;

  localizedResources.forEach(({handle, data}) => {
    if (handle !== data.handle) {
      url.pathname = url.pathname.replace(handle, data.handle);
      shouldRedirect = true;
    }
  });

  if (shouldRedirect) {
    throw redirect(url.toString());
  }
}
