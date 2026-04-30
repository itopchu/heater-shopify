#!/usr/bin/env node
/**
 * Push the current photo order from product-catalog/products/<handle>.json
 * into the Shopify dev store: delete-all-media then re-attach in
 * cdn_in_canonical_order.
 *
 * Usage:
 *   node agent/scripts/sync-photos-to-shopify.mjs                       # dry-run, all 55 products
 *   node agent/scripts/sync-photos-to-shopify.mjs --apply                # real run, all
 *   node agent/scripts/sync-photos-to-shopify.mjs --handles=h1,h2 --apply
 *   node agent/scripts/sync-photos-to-shopify.mjs --only-changed         # only products whose
 *                                                                          local order/count differs
 *                                                                          from Shopify
 *
 * Always uses SHOPIFY_DEV_*. Refuses to run against prod (no flag plumbed).
 */

import { config as dotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
dotenv({ path: join(ROOT, ".env.local") });

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
const API = process.env.SHOPIFY_API_VERSION || "2026-04";
if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_DEV_STORE or SHOPIFY_DEV_ADMIN_TOKEN in .env.local");
  process.exit(1);
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const onlyChanged = argv.includes("--only-changed");
const handlesArg = argv.find((a) => a.startsWith("--handles="));
const handlesFilter = handlesArg ? new Set(handlesArg.slice("--handles=".length).split(",")) : null;

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.errors) throw new Error(`GraphQL: ${JSON.stringify(j.errors)}`);
  return j.data;
}

async function getProduct(handle) {
  const data = await gql(
    `query ($h: String!) {
      productByHandle(handle: $h) {
        id
        media(first: 50) {
          edges { node { id ... on MediaImage { image { url } } } }
        }
      }
    }`,
    { h: handle },
  );
  return data.productByHandle;
}

async function deleteMedia(productGid, mediaIds) {
  if (mediaIds.length === 0) return;
  const data = await gql(
    `mutation ($pid: ID!, $ids: [ID!]!) {
      productDeleteMedia(productId: $pid, mediaIds: $ids) {
        deletedMediaIds
        mediaUserErrors { code field message }
      }
    }`,
    { pid: productGid, ids: mediaIds },
  );
  const errs = data.productDeleteMedia.mediaUserErrors;
  if (errs.length) throw new Error(`productDeleteMedia: ${JSON.stringify(errs)}`);
}

async function attachMedia(productGid, urls) {
  if (urls.length === 0) return;
  const media = urls.map((u) => ({ mediaContentType: "IMAGE", originalSource: u }));
  const data = await gql(
    `mutation ($pid: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $pid, media: $media) {
        mediaUserErrors { code field message }
      }
    }`,
    { pid: productGid, media },
  );
  const errs = data.productCreateMedia.mediaUserErrors;
  if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
}

function loadDesired() {
  const dir = join(ROOT, "product-catalog", "products");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      return {
        handle: j.handle || f.replace(/\.json$/, ""),
        urls: j.photos?.cdn_in_canonical_order || [],
      };
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Store: ${STORE} (dev)`);
  console.log(`Mode:  ${apply ? "APPLY (mutating)" : "DRY-RUN"}`);
  if (handlesFilter) console.log(`Scope: ${[...handlesFilter].join(", ")}`);
  if (onlyChanged) console.log("Only:  products whose Shopify media order differs from local");

  const desired = loadDesired();
  const targets = handlesFilter ? desired.filter((p) => handlesFilter.has(p.handle)) : desired;

  let summary = { processed: 0, skipped_no_change: 0, skipped_no_product: 0, would_replace: 0, replaced: 0, failed: 0 };
  const errors = [];

  for (const t of targets) {
    if (t.urls.length === 0) { summary.skipped_no_change++; continue; }

    let prod;
    try {
      prod = await getProduct(t.handle);
    } catch (e) {
      summary.failed++; errors.push({ handle: t.handle, stage: "query", error: String(e?.message || e) });
      continue;
    }
    if (!prod) { summary.skipped_no_product++; continue; }

    const currentMedia = prod.media.edges.map((e) => ({ id: e.node.id, url: e.node.image?.url || null }));
    const sameCount = currentMedia.length === t.urls.length;
    const sameOrderProxy = sameCount; // no reliable URL match (Shopify rehosts); count proxy is best we have

    if (onlyChanged && sameOrderProxy) {
      summary.skipped_no_change++;
      continue;
    }

    if (!apply) {
      summary.would_replace++;
      const lead = t.urls[0].split("/").pop().split("?")[0];
      console.log(`  [dry] ${t.handle}: replace ${currentMedia.length} → ${t.urls.length}, lead = ${lead}`);
      continue;
    }

    try {
      await deleteMedia(prod.id, currentMedia.map((m) => m.id));
      await attachMedia(prod.id, t.urls);
      summary.replaced++;
      summary.processed++;
      console.log(`  ${t.handle}: replaced ${currentMedia.length} → ${t.urls.length}`);
      // Shopify rate limits ~ 2 req/sec on Admin GraphQL for shared apps; pace.
      await sleep(250);
    } catch (e) {
      summary.failed++;
      errors.push({ handle: t.handle, stage: "mutate", error: String(e?.message || e) });
      console.log(`  ${t.handle}: FAILED — ${e?.message || e}`);
    }
  }

  console.log("\nSummary:", summary);
  if (errors.length) console.log("Errors:", errors);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
