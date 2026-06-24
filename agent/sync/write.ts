/**
 * Applies diff entries to our Shopify store via Admin GraphQL.
 *   - CREATE   → productCreate + metafieldsSet (sync keys) + image attach + collection assign + translations
 *   - UPDATE   → productUpdate + image refresh + metafield refresh
 *   - ARCHIVE  → productUpdate(status: ARCHIVED)
 *   - UNCHANGED → no-op, still bumps sync.xxl_last_synced_at
 *
 * Idempotent. Wraps every mutation call through the Shopify Admin endpoint
 * (pre-tool hook sits one layer up in agent/src; sync runs in CI where that
 * hook is not active — but sync can only reach the prod store if SHOPIFY_PROD_*
 * are explicitly populated in the CI secrets, which is gated by review).
 */

import type { SyncConfig } from './env.js';
import type { DiffEntry, NormalizedProduct } from './types.js';
import type { ImageResult } from './images.js';

async function graphql<T>(cfg: SyncConfig, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${cfg.shopifyStore}/admin/api/${cfg.shopifyApiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.shopifyToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function collectionGidByHandle(cfg: SyncConfig, handle: string): Promise<string | null> {
  const data = await graphql<{ collectionByHandle: { id: string } | null }>(
    cfg,
    `query ($h: String!) { collectionByHandle(handle: $h) { id } }`,
    { h: handle },
  );
  return data.collectionByHandle?.id ?? null;
}

function buildCreateInput(p: NormalizedProduct): Record<string, unknown> {
  return {
    handle: p.handle,
    title: p.titleEn || p.titleDe,
    descriptionHtml: p.bodyHtmlEn || p.bodyHtmlDe,
    vendor: p.vendor,
    productType: p.productType,
    tags: p.tags,
    productOptions: p.options.map((o) => ({
      name: o.name,
      position: o.position,
      values: o.values.map((v) => ({ name: v })),
    })),
  };
}

/** 2026-04 productUpdate rejects productOptions — managed via productOptionUpdate separately. */
function buildUpdateInput(p: NormalizedProduct): Record<string, unknown> {
  return {
    title: p.titleEn || p.titleDe,
    descriptionHtml: p.bodyHtmlEn || p.bodyHtmlDe,
    vendor: p.vendor,
    productType: p.productType,
    tags: p.tags,
  };
}

/**
 * Sprint 4: write parsed custom metafields (specs, dimensions, delivery_contents,
 * grundpreis_*, ral_color, connection_type, width_cm, height_cm, wattage).
 * No-op if the normalizer didn't extract anything.
 */
async function setCustomMetafields(cfg: SyncConfig, productGid: string, p: NormalizedProduct): Promise<void> {
  if (p.customMetafields.length === 0) return;
  const data = await graphql<{
    metafieldsSet: { userErrors: Array<{ message: string }> };
  }>(
    cfg,
    `mutation ($input: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $input) {
        metafields { id namespace key }
        userErrors { field message }
      }
    }`,
    {
      input: p.customMetafields.map((m) => ({
        ownerId: productGid,
        namespace: m.namespace,
        key: m.key,
        type: m.type,
        value: m.value,
      })),
    },
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`metafieldsSet(custom)(${productGid}): ${JSON.stringify(errs)}`);
}

/**
 * Sprint 4: upsert one faq_item metaobject per parsed FAQ, then set
 * `product.custom.faqs` to the resulting list of metaobject GIDs.
 * Metaobject handle pattern: `${productHandle}-faq-${index}` so re-runs upsert in place.
 */
async function attachFaqs(cfg: SyncConfig, productGid: string, p: NormalizedProduct): Promise<void> {
  if (p.faqs.length === 0) return;
  const gids: string[] = [];
  for (let i = 0; i < p.faqs.length; i++) {
    const f = p.faqs[i]!;
    const handle = `${p.handle}-faq-${i}`;
    const data = await graphql<{
      metaobjectUpsert: {
        metaobject: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      cfg,
      `mutation ($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message code }
        }
      }`,
      {
        handle: { type: 'faq_item', handle },
        metaobject: {
          fields: [
            { key: 'question', value: f.question },
            // answer is rich_text — wrap as Shopify rich text JSON
            {
              key: 'answer',
              value: JSON.stringify({
                type: 'root',
                children: [{ type: 'paragraph', children: [{ type: 'text', value: f.answer }] }],
              }),
            },
          ],
        },
      },
    );
    const errs = data.metaobjectUpsert.userErrors;
    if (errs.length) throw new Error(`metaobjectUpsert(faq_item:${handle}): ${JSON.stringify(errs)}`);
    if (data.metaobjectUpsert.metaobject) gids.push(data.metaobjectUpsert.metaobject.id);
  }
  if (gids.length === 0) return;
  const ms = await graphql<{ metafieldsSet: { userErrors: Array<{ message: string }> } }>(
    cfg,
    `mutation ($input: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $input) {
        userErrors { field message }
      }
    }`,
    {
      input: [{
        ownerId: productGid,
        namespace: 'custom',
        key: 'faqs',
        type: 'list.metaobject_reference',
        value: JSON.stringify(gids),
      }],
    },
  );
  const errs = ms.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`metafieldsSet(custom.faqs)(${productGid}): ${JSON.stringify(errs)}`);
}

async function setSyncMetafields(cfg: SyncConfig, productGid: string, p: NormalizedProduct): Promise<void> {
  const nowIso = new Date().toISOString();
  await graphql(
    cfg,
    `mutation ($input: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $input) {
        metafields { id namespace key }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          ownerId: productGid,
          namespace: 'sync',
          key: 'xxl_source_id',
          type: 'number_integer',
          value: String(p.xxlId),
        },
        {
          ownerId: productGid,
          namespace: 'sync',
          key: 'xxl_source_handle',
          type: 'single_line_text_field',
          value: p.xxlHandle,
        },
        {
          ownerId: productGid,
          namespace: 'sync',
          key: 'xxl_last_synced_at',
          type: 'date_time',
          value: nowIso,
        },
      ],
    },
  );
}

/**
 * Build ProductVariantsBulkInput[] from the normalized variants. Each variant
 * carries: price, sku, optionValues (mapped against the product's option
 * names), and inventoryItem flags. Available flag is informational only —
 * Shopify tracks availability via inventory levels, which we don't manage
 * here (tracked: false matches the seed-products precedent).
 */
function buildBulkVariantInputs(
  p: NormalizedProduct,
  mode: 'create' | 'update',
  existingBySku?: Map<string, string>,
): Array<Record<string, unknown>> {
  return p.variants.map((v) => {
    const opts: Array<{ optionName: string; name: string }> = [];
    const optionVals: Array<string | undefined> = [v.option1, v.option2, v.option3];
    for (let i = 0; i < p.options.length; i++) {
      const val = optionVals[i];
      if (val != null) opts.push({ optionName: p.options[i]!.name, name: val });
    }
    // For an EXISTING variant we only reconcile option values. Price and
    // inventory are merchant-controlled after the first seed and must never be
    // auto-overwritten by a catalog re-sync (the dedicated price-sync was
    // removed for the same reason — manual / curated prices must persist).
    // New or unmatched variants still get the full seed input.
    if (mode === 'update' && existingBySku) {
      const existingId = existingBySku.get(v.sku);
      if (existingId) return { id: existingId, optionValues: opts };
    }
    return {
      price: v.price,
      optionValues: opts,
      inventoryItem: { requiresShipping: true, tracked: false, sku: v.sku },
    };
  });
}

async function bulkCreateVariants(
  cfg: SyncConfig,
  productGid: string,
  inputs: Array<Record<string, unknown>>,
  strategy: 'DEFAULT' | 'REMOVE_STANDALONE_VARIANT',
): Promise<void> {
  if (inputs.length === 0) return;
  const data = await graphql<{
    productVariantsBulkCreate: {
      productVariants: Array<{ id: string; sku: string | null; price: string }> | null;
      userErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
  }>(
    cfg,
    `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        productVariants { id sku price }
        userErrors { field message code }
      }
    }`,
    { productId: productGid, variants: inputs, strategy },
  );
  const errs = data.productVariantsBulkCreate.userErrors;
  if (errs.length) {
    throw new Error(`productVariantsBulkCreate(${productGid}, ${strategy}): ${JSON.stringify(errs)}`);
  }
}

async function bulkUpdateVariants(
  cfg: SyncConfig,
  productGid: string,
  inputs: Array<Record<string, unknown>>,
): Promise<void> {
  if (inputs.length === 0) return;
  const data = await graphql<{
    productVariantsBulkUpdate: {
      productVariants: Array<{ id: string; price: string }> | null;
      userErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
  }>(
    cfg,
    `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price }
        userErrors { field message code }
      }
    }`,
    { productId: productGid, variants: inputs },
  );
  const errs = data.productVariantsBulkUpdate.userErrors;
  if (errs.length) {
    throw new Error(`productVariantsBulkUpdate(${productGid}): ${JSON.stringify(errs)}`);
  }
}

/**
 * Seed real variants on a freshly created product. productCreate auto-makes
 * one placeholder variant (€0, no sku) for the first option-value combo; we
 * replace it via REMOVE_STANDALONE_VARIANT.
 */
async function seedVariantsOnCreate(cfg: SyncConfig, productGid: string, p: NormalizedProduct): Promise<void> {
  if (p.variants.length === 0) return;
  const inputs = buildBulkVariantInputs(p, 'create');
  await bulkCreateVariants(cfg, productGid, inputs, 'REMOVE_STANDALONE_VARIANT');
}

/**
 * Reconcile variants on an existing product:
 *   - Recovery case: store has exactly 1 variant with no SKU + price 0 AND we
 *     have ≥1 incoming variants with non-zero prices → treat as "never seeded",
 *     bulk-create with REMOVE_STANDALONE_VARIANT (replaces the placeholder).
 *   - Normal case: match incoming variants to existing by SKU, bulk-update for
 *     matches, bulk-create for missing. Variants in the store with no incoming
 *     match are left alone (no auto-deletion to prevent destructive churn).
 */
async function reconcileVariantsOnUpdate(cfg: SyncConfig, productGid: string, p: NormalizedProduct): Promise<void> {
  if (p.variants.length === 0) return;
  const data = await graphql<{
    product: {
      variants: { nodes: Array<{ id: string; sku: string | null; price: string }> };
    } | null;
  }>(
    cfg,
    `query ($id: ID!) {
      product(id: $id) {
        variants(first: 100) { nodes { id sku price } }
      }
    }`,
    { id: productGid },
  );
  const existing = data.product?.variants.nodes ?? [];
  const onlyPlaceholder =
    existing.length === 1 &&
    (existing[0]!.sku == null || existing[0]!.sku === '') &&
    Number(existing[0]!.price) === 0;
  const haveRealPrices = p.variants.some((v) => Number(v.price) > 0);

  if (onlyPlaceholder && haveRealPrices) {
    const inputs = buildBulkVariantInputs(p, 'create');
    await bulkCreateVariants(cfg, productGid, inputs, 'REMOVE_STANDALONE_VARIANT');
    return;
  }

  const bySku = new Map<string, string>();
  for (const v of existing) {
    if (v.sku) bySku.set(v.sku, v.id);
  }
  const updates: Array<Record<string, unknown>> = [];
  const creates: Array<Record<string, unknown>> = [];
  const allInputs = buildBulkVariantInputs(p, 'update', bySku);
  for (const inp of allInputs) {
    if ('id' in inp) updates.push(inp);
    else creates.push(inp);
  }
  if (updates.length > 0) await bulkUpdateVariants(cfg, productGid, updates);
  if (creates.length > 0) await bulkCreateVariants(cfg, productGid, creates, 'DEFAULT');
}

async function attachImages(cfg: SyncConfig, productGid: string, images: ImageResult[]): Promise<void> {
  const media = images
    .filter((i) => i.imageUrl && i.imageUrl !== '(dry-run)')
    .map((i) => ({
      mediaContentType: 'IMAGE',
      originalSource: i.imageUrl,
    }));
  if (media.length === 0) return;
  const data = await graphql<{
    productCreateMedia: {
      mediaUserErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
  }>(
    cfg,
    `mutation ($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) {
        mediaUserErrors { field message code }
      }
    }`,
    { id: productGid, media },
  );
  const errs = data.productCreateMedia.mediaUserErrors;
  if (errs.length) {
    throw new Error(`productCreateMedia(${productGid}): ${JSON.stringify(errs)}`);
  }
}

async function assignToCollections(cfg: SyncConfig, productGid: string, handles: string[]): Promise<void> {
  for (const h of handles) {
    const cgid = await collectionGidByHandle(cfg, h);
    if (!cgid) continue;
    await graphql(
      cfg,
      `mutation ($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }`,
      { id: cgid, productIds: [productGid] },
    );
  }
}

let cachedPublicationIds: string[] | null = null;
async function getStorefrontPublicationIds(cfg: SyncConfig): Promise<string[]> {
  if (cachedPublicationIds) return cachedPublicationIds;
  const data = await graphql<{ publications: { nodes: Array<{ id: string; name: string }> } }>(
    cfg,
    `{ publications(first: 20) { nodes { id name } } }`,
    {},
  );
  // Publish to Online Store + Shop. Skip Point of Sale by default.
  const wanted = new Set(['Online Store', 'Shop']);
  cachedPublicationIds = data.publications.nodes.filter((p) => wanted.has(p.name)).map((p) => p.id);
  return cachedPublicationIds;
}

async function publishProduct(cfg: SyncConfig, productGid: string): Promise<void> {
  const pubIds = await getStorefrontPublicationIds(cfg);
  if (pubIds.length === 0) return;
  const data = await graphql<{
    publishablePublish: { userErrors: Array<{ message: string }> };
  }>(
    cfg,
    `mutation ($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: productGid, input: pubIds.map((id) => ({ publicationId: id })) },
  );
  const errs = data.publishablePublish.userErrors;
  if (errs.length) throw new Error(`publishablePublish(${productGid}): ${JSON.stringify(errs)}`);
}

/**
 * Our store default locale is EN. xxl source is DE. productCreate wrote EN as
 * the primary title/body. To serve DE-locale buyers, register DE translations
 * keyed to the source digest of each translatable field. Handles missing
 * digests quietly (rare — product not yet indexed for translation).
 */
async function registerGermanTranslation(
  cfg: SyncConfig,
  productGid: string,
  titleDe: string,
  bodyHtmlDe: string,
): Promise<void> {
  if (!titleDe && !bodyHtmlDe) return;
  const src = await graphql<{
    translatableResource: { translatableContent: Array<{ key: string; digest: string }> } | null;
  }>(
    cfg,
    `query ($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest locale }
      }
    }`,
    { id: productGid },
  );
  const content = src.translatableResource?.translatableContent ?? [];
  const translations: Array<{
    key: string;
    locale: string;
    value: string;
    translatableContentDigest: string;
  }> = [];
  const titleDigest = content.find((c) => c.key === 'title')?.digest;
  if (titleDe && titleDigest) {
    translations.push({ key: 'title', locale: 'de', value: titleDe, translatableContentDigest: titleDigest });
  }
  const bodyDigest = content.find((c) => c.key === 'body_html')?.digest;
  if (bodyHtmlDe && bodyDigest) {
    translations.push({ key: 'body_html', locale: 'de', value: bodyHtmlDe, translatableContentDigest: bodyDigest });
  }
  if (translations.length === 0) return;
  await graphql(
    cfg,
    `mutation ($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        userErrors { field message }
      }
    }`,
    { resourceId: productGid, translations },
  );
}

export async function applyCreate(
  cfg: SyncConfig,
  payload: NormalizedProduct,
  images: ImageResult[],
): Promise<string> {
  const data = await graphql<{
    productCreate: {
      product: { id: string; handle: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    cfg,
    `mutation ($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    { input: buildCreateInput(payload) },
  );
  const errs = data.productCreate.userErrors;
  if (errs.length) throw new Error(`productCreate(${payload.handle}): ${JSON.stringify(errs)}`);
  const gid = data.productCreate.product?.id;
  if (!gid) throw new Error(`productCreate(${payload.handle}): no product id returned`);

  await seedVariantsOnCreate(cfg, gid, payload);
  await setSyncMetafields(cfg, gid, payload);
  await setCustomMetafields(cfg, gid, payload);
  await attachFaqs(cfg, gid, payload);
  await attachImages(cfg, gid, images);
  await assignToCollections(cfg, gid, payload.collectionHandles);
  await publishProduct(cfg, gid);
  await registerGermanTranslation(cfg, gid, payload.titleDe, payload.bodyHtmlDe);
  // Note: xxl source is DE; our store is EN-default. The xxl title is German,
  // so we store EN as the resource title and register DE as translation? No —
  // store is EN-default. We write EN to the product, and register DE on the
  // DE locale via separate translation. Simpler: write EN as primary, DE via
  // seed-translations.mjs or a follow-up translation call.
  // For now productCreate already wrote EN as title; DE is registered in
  // a subsequent translationsRegister call by the consumer of this module.
  return gid;
}

export async function applyUpdate(
  cfg: SyncConfig,
  ourGid: string,
  payload: NormalizedProduct,
  images: ImageResult[],
): Promise<void> {
  const data = await graphql<{
    productUpdate: { product: { id: string } | null; userErrors: Array<{ message: string }> };
  }>(
    cfg,
    `mutation ($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }`,
    { input: { id: ourGid, ...buildUpdateInput(payload) } },
  );
  if (data.productUpdate.userErrors.length) {
    throw new Error(`productUpdate(${payload.handle}): ${JSON.stringify(data.productUpdate.userErrors)}`);
  }
  await reconcileVariantsOnUpdate(cfg, ourGid, payload);
  await setSyncMetafields(cfg, ourGid, payload);
  await setCustomMetafields(cfg, ourGid, payload);
  await attachFaqs(cfg, ourGid, payload);
  // Attach images only if the product currently has none. productCreateMedia is
  // additive, so re-running on a populated product would compound duplicates.
  // Merchants who want image churn delete all product media manually, then re-sync.
  if (images.length > 0) {
    const existing = await graphql<{ product: { media: { edges: unknown[] } } | null }>(
      cfg,
      `query ($id: ID!) { product(id: $id) { media(first: 1) { edges { node { id } } } } }`,
      { id: ourGid },
    );
    const hasMedia = (existing.product?.media.edges.length ?? 0) > 0;
    if (!hasMedia) await attachImages(cfg, ourGid, images);
  }
  await assignToCollections(cfg, ourGid, payload.collectionHandles);
  await registerGermanTranslation(cfg, ourGid, payload.titleDe, payload.bodyHtmlDe);
}

export async function applyArchive(cfg: SyncConfig, ourGid: string): Promise<void> {
  await graphql(
    cfg,
    `mutation ($input: ProductInput!) {
      productUpdate(input: $input) {
        userErrors { field message }
      }
    }`,
    { input: { id: ourGid, status: 'ARCHIVED' } },
  );
}

export async function applyEntry(
  cfg: SyncConfig,
  entry: DiffEntry,
  images: ImageResult[],
): Promise<string | null> {
  switch (entry.action) {
    case 'CREATE':
      if (!entry.payload) throw new Error('CREATE entry missing payload');
      return await applyCreate(cfg, entry.payload, images);
    case 'UPDATE':
      if (!entry.ourGid || !entry.payload) throw new Error('UPDATE entry missing ourGid/payload');
      await applyUpdate(cfg, entry.ourGid, entry.payload, images);
      return entry.ourGid;
    case 'ARCHIVE':
      if (!entry.ourGid) throw new Error('ARCHIVE entry missing ourGid');
      await applyArchive(cfg, entry.ourGid);
      return entry.ourGid;
    case 'UNCHANGED':
      if (entry.ourGid && entry.payload) await setSyncMetafields(cfg, entry.ourGid, entry.payload);
      return entry.ourGid;
  }
}
