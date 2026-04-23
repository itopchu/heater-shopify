import type { StoreConfig } from '../store-config.js';

export type GraphQLCall = {
  query: string;
  variables?: Record<string, unknown>;
};

export type RestCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

export async function shopifyGraphQL(store: StoreConfig, call: GraphQLCall): Promise<unknown> {
  const url = `https://${store.handle}/admin/api/${store.apiVersion}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': store.token,
    },
    body: JSON.stringify(call),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { errors?: unknown; data?: unknown };
  if (data.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

export async function shopifyRest(store: StoreConfig, call: RestCall): Promise<unknown> {
  const path = call.path.startsWith('/') ? call.path : `/${call.path}`;
  const url = `https://${store.handle}/admin/api/${store.apiVersion}${path}`;
  const init: RequestInit = {
    method: call.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': store.token,
    },
  };
  if (call.body !== undefined) {
    init.body = JSON.stringify(call.body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify REST ${call.method} ${path} → ${res.status}: ${text}`);
  }
  try {
    return text === '' ? null : JSON.parse(text);
  } catch {
    return text;
  }
}
