import {
  inContextDirective,
  type QueryContext,
  type StorefrontClient,
} from "../client";

export interface MenuItem {
  id: string;
  title: string;
  url: string | null;
  type: string;
  resourceId: string | null;
  items: MenuItem[];
}

interface RawMenuItem {
  id: string;
  title: string;
  url: string | null;
  type: string;
  resourceId: string | null;
  items?: RawMenuItem[];
}

interface RawResponse {
  menu: {
    id: string;
    handle: string;
    title: string;
    items: RawMenuItem[];
  } | null;
}

const MENU_QUERY = /* GraphQL */ `
  query Menu($handle: String!) __CTX__ {
    menu(handle: $handle) {
      id
      handle
      title
      items {
        id
        title
        url
        type
        resourceId
        items {
          id
          title
          url
          type
          resourceId
          items {
            id
            title
            url
            type
            resourceId
          }
        }
      }
    }
  }
`;

function normalize(item: RawMenuItem): MenuItem {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    type: item.type,
    resourceId: item.resourceId,
    items: (item.items ?? []).map(normalize),
  };
}

/**
 * Fetch a Shopify menu by handle (e.g. "main-menu", "footer").
 * Returns null if the menu doesn't exist.
 */
export async function getMenu(
  client: StorefrontClient,
  handle: string,
  context?: QueryContext,
): Promise<{ id: string; handle: string; title: string; items: MenuItem[] } | null> {
  const gql = MENU_QUERY.replace("__CTX__", inContextDirective(context));
  const data = await client.query<RawResponse>(gql, { handle }, context);
  if (!data.menu) return null;
  return {
    id: data.menu.id,
    handle: data.menu.handle,
    title: data.menu.title,
    items: data.menu.items.map(normalize),
  };
}
