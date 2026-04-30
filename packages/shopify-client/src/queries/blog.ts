/**
 * Storefront API blog + articles. Used by the `/blog` (or `/news`) route.
 *
 * Shopify exposes Online Store blogs by handle. We default to "news" but
 * fall back to listing all blogs and picking the first when "news" doesn't
 * exist — keeps the route resilient to merchant naming.
 *
 * Returns null when no blog/articles exist; the route then renders the
 * "Editorial coming soon" placeholder.
 */
import {
  inContextDirective,
  type QueryContext,
  type StorefrontClient,
} from "../client";

export interface BlogArticle {
  id: string;
  handle: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  authorName: string | null;
  image: { url: string; altText: string | null } | null;
  blogHandle: string;
}

interface RawArticle {
  id: string;
  handle: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  authorV2: { name: string } | null;
  image: { url: string; altText: string | null } | null;
}

interface RawBlog {
  blog: {
    handle: string;
    title: string;
    articles: { nodes: RawArticle[] };
  } | null;
}

const BLOG_QUERY = /* GraphQL */ `
  query BlogByHandle($handle: String!, $first: Int!) __CTX__ {
    blog(handle: $handle) {
      handle
      title
      articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
        nodes {
          id
          handle
          title
          excerpt
          publishedAt
          authorV2 { name }
          image { url altText }
        }
      }
    }
  }
`;

const BLOGS_LIST_QUERY = /* GraphQL */ `
  query BlogsList($first: Int!) __CTX__ {
    blogs(first: $first) {
      nodes {
        handle
        title
      }
    }
  }
`;

interface BlogsListRaw {
  blogs: { nodes: Array<{ handle: string; title: string }> };
}

function normalizeArticles(raw: RawArticle[], blogHandle: string): BlogArticle[] {
  return raw.map((a) => ({
    id: a.id,
    handle: a.handle,
    title: a.title,
    excerpt: a.excerpt ?? "",
    publishedAt: a.publishedAt,
    authorName: a.authorV2?.name ?? null,
    image: a.image,
    blogHandle,
  }));
}

export interface BlogResult {
  blogHandle: string;
  blogTitle: string;
  articles: BlogArticle[];
}

export async function getBlogByHandle(
  client: StorefrontClient,
  handle: string,
  options: { first?: number } = {},
  context?: QueryContext,
): Promise<BlogResult | null> {
  const first = options.first ?? 12;
  const gql = BLOG_QUERY.replace("__CTX__", inContextDirective(context));
  const data = await client.query<RawBlog>(gql, { handle, first }, context);
  if (!data.blog) return null;
  return {
    blogHandle: data.blog.handle,
    blogTitle: data.blog.title,
    articles: normalizeArticles(data.blog.articles.nodes, data.blog.handle),
  };
}

/**
 * Resilient "any blog" lookup — tries `news`, then falls back to whatever
 * blog handles the store actually has, picking the first.
 */
export async function getAnyBlog(
  client: StorefrontClient,
  options: { first?: number; preferredHandles?: string[] } = {},
  context?: QueryContext,
): Promise<BlogResult | null> {
  const preferred = options.preferredHandles ?? ["news", "blog", "journal", "editorial"];
  for (const h of preferred) {
    const result = await getBlogByHandle(client, h, options, context).catch(() => null);
    if (result && result.articles.length > 0) return result;
  }
  // Last resort: ask Shopify what blogs exist and try each.
  try {
    const list = await client.query<BlogsListRaw>(
      BLOGS_LIST_QUERY.replace("__CTX__", inContextDirective(context)),
      { first: 5 },
      context,
    );
    for (const b of list.blogs.nodes) {
      const result = await getBlogByHandle(client, b.handle, options, context).catch(
        () => null,
      );
      if (result && result.articles.length > 0) return result;
    }
  } catch {
    /* swallow — we'll just return null */
  }
  return null;
}
