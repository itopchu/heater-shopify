#!/usr/bin/env node
/**
 * translate-variant-options.mjs
 *
 * Rewrites German variant option NAMES and VALUES on Shopify products
 * into their English equivalents, in place, via Admin GraphQL.
 *
 * Why: the storefront option panel was rendering option2 as "Color" with
 *      values "Befüllt" / "Unbefüllt" because those are the option2 name
 *      and values in Shopify itself. Source code is now English-only;
 *      this script aligns the platform-side data with that.
 *
 * Behaviour:
 *   - Default is DRY RUN. Add `--apply` to push changes.
 *   - Targets dev store unless `--store=prod` is passed.
 *   - Walks all products via paginated `products(first:250)`.
 *   - Skips products whose options/values are already English.
 *   - One `productOptionUpdate` mutation per product per German option.
 *
 * Usage:
 *   node agent/scripts/translate-variant-options.mjs            # dry run
 *   node agent/scripts/translate-variant-options.mjs --apply    # push
 *   node agent/scripts/translate-variant-options.mjs --apply --handles=foo,bar
 */

import { config as dotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
dotenv({ path: join(ROOT, ".env.local") });

// ---- args ----
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const STORE_KIND =
  args.find((a) => a.startsWith("--store="))?.slice("--store=".length) ||
  process.env.AGENT_DEFAULT_STORE ||
  "dev";
const handlesArg = args.find((a) => a.startsWith("--handles="));
const HANDLES_FILTER = handlesArg
  ? new Set(handlesArg.slice("--handles=".length).split(","))
  : null;

// ---- env ----
const STORE =
  STORE_KIND === "prod"
    ? process.env.SHOPIFY_PROD_STORE
    : process.env.SHOPIFY_DEV_STORE;
const TOKEN =
  STORE_KIND === "prod"
    ? process.env.SHOPIFY_PROD_ADMIN_TOKEN
    : process.env.SHOPIFY_DEV_ADMIN_TOKEN;
const API = process.env.SHOPIFY_API_VERSION || "2026-04";
if (!STORE || !TOKEN) {
  console.error(
    `Missing SHOPIFY_${STORE_KIND.toUpperCase()}_STORE or SHOPIFY_${STORE_KIND.toUpperCase()}_ADMIN_TOKEN in .env.local`,
  );
  process.exit(1);
}

// ---- translation maps ----
// Match is case-insensitive, whitespace-trimmed. Add new entries here when
// further German strings surface in catalog data.
const OPTION_NAME_MAP = {
  auslieferungszustand: "Delivery state",
  "breite x höhe in cm": "Width × Height (cm)",
  "breite × höhe in cm": "Width × Height (cm)",
  "höhe x breite in cm": "Height × Width (cm)",
  "höhe × breite in cm": "Height × Width (cm)",
  größe: "Size",
  farbe: "Color",
  höhe: "Height",
  breite: "Width",
  tiefe: "Depth",
  länge: "Length",
  ausführung: "Variant",
  ausfuehrung: "Variant",
};

const OPTION_VALUE_MAP = {
  befüllt: "Pre-filled",
  befuellt: "Pre-filled",
  unbefüllt: "Unfilled",
  unbefuellt: "Unfilled",
  weiß: "White",
  weiss: "White",
  schwarz: "Black",
  anthrazit: "Anthracite",
  chrom: "Chrome",
  silber: "Silver",
  grau: "Grey",
  rot: "Red",
};

const norm = (s) => (s ?? "").trim().toLowerCase();
const translateName = (n) => OPTION_NAME_MAP[norm(n)] ?? null;
const translateValue = (v) => OPTION_VALUE_MAP[norm(v)] ?? null;

/**
 * Semantic-based option-name correction. Some products in the dev store
 * have option2 labelled "Color" (English) but the actual values are
 * Befüllt/Unbefüllt — i.e. the merchant set the wrong option name during
 * import. When option values clearly belong to a different semantic
 * domain, force-rename the option.
 */
const VALUE_SEMANTIC_GROUPS = {
  "Delivery state": new Set([
    "befüllt",
    "befuellt",
    "unbefüllt",
    "unbefuellt",
    "pre-filled",
    "unfilled",
  ]),
};

function semanticOptionName(values) {
  const lc = values.map((v) => norm(v));
  for (const [name, set] of Object.entries(VALUE_SEMANTIC_GROUPS)) {
    if (lc.some((v) => set.has(v))) return name;
  }
  return null;
}

// ---- gql ----
async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.errors) throw new Error(`GraphQL: ${JSON.stringify(j.errors)}`);
  return j.data;
}

const PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          options {
            id
            name
            position
            optionValues {
              id
              name
            }
          }
        }
      }
    }
  }
`;

const OPTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation OptionUpdate(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToUpdate: [OptionValueUpdateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToUpdate: $optionValuesToUpdate
    ) {
      product {
        id
        options {
          name
          optionValues {
            name
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

async function* iterateProducts() {
  let cursor = null;
  while (true) {
    const data = await gql(PRODUCTS_PAGE_QUERY, { cursor });
    for (const edge of data.products.edges) yield edge.node;
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
}

function planForProduct(product) {
  const tasks = [];
  for (const opt of product.options) {
    const valueRenames = [];
    for (const v of opt.optionValues) {
      const t = translateValue(v.name);
      if (t && t !== v.name) valueRenames.push({ id: v.id, name: t });
    }
    // Effective values after our renames (used to drive semantic naming).
    const effectiveValues = opt.optionValues.map((v) => {
      const r = valueRenames.find((x) => x.id === v.id);
      return r ? r.name : v.name;
    });
    const semanticName = semanticOptionName(effectiveValues);
    const mappedName = translateName(opt.name);
    const newName = semanticName ?? mappedName ?? opt.name;
    const renamedTheName = newName !== opt.name;
    if (renamedTheName || valueRenames.length > 0) {
      tasks.push({
        optionId: opt.id,
        oldOptionName: opt.name,
        newOptionName: newName,
        renamedTheName,
        valueRenames,
      });
    }
  }
  return tasks;
}

async function runProduct(product) {
  if (HANDLES_FILTER && !HANDLES_FILTER.has(product.handle)) return null;
  const tasks = planForProduct(product);
  if (tasks.length === 0) return null;

  const summary = {
    handle: product.handle,
    title: product.title,
    changes: tasks.map((t) => ({
      option: t.oldOptionName,
      renameTo: t.renamedTheName ? t.newOptionName : null,
      valueRenames: t.valueRenames.map((v) => v.name),
    })),
  };

  if (!APPLY) return summary;

  for (const t of tasks) {
    const variables = {
      productId: product.id,
      option: { id: t.optionId, name: t.newOptionName },
      optionValuesToUpdate:
        t.valueRenames.length > 0 ? t.valueRenames : undefined,
    };
    const data = await gql(OPTION_UPDATE_MUTATION, variables);
    const errs = data.productOptionUpdate.userErrors;
    if (errs && errs.length > 0) {
      summary.changes = summary.changes.map((c) =>
        c.option === t.oldOptionName ? { ...c, errors: errs } : c,
      );
    }
  }
  return summary;
}

async function main() {
  console.log(
    `[translate-variant-options] store=${STORE_KIND} (${STORE}) apply=${APPLY}${
      HANDLES_FILTER ? ` handles=${[...HANDLES_FILTER].join(",")}` : ""
    }`,
  );
  let scanned = 0;
  let touched = 0;
  let errors = 0;
  for await (const product of iterateProducts()) {
    scanned++;
    let summary;
    try {
      summary = await runProduct(product);
    } catch (e) {
      errors++;
      console.error(`✗ ${product.handle}: ${e.message}`);
      continue;
    }
    if (!summary) continue;
    touched++;
    const tag = APPLY ? "✓ updated" : "→ would update";
    console.log(`${tag} ${summary.handle}`);
    for (const c of summary.changes) {
      const r = c.renameTo ? ` "${c.option}" → "${c.renameTo}"` : ` "${c.option}" (kept)`;
      const v =
        c.valueRenames.length > 0 ? `   values: ${c.valueRenames.join(", ")}` : "";
      const e = c.errors ? `   errors: ${JSON.stringify(c.errors)}` : "";
      console.log(`  -${r}`);
      if (v) console.log(v);
      if (e) console.log(e);
    }
  }
  console.log(
    `\nDone. scanned=${scanned} touched=${touched} errors=${errors} apply=${APPLY}`,
  );
  if (!APPLY && touched > 0) {
    console.log("Run again with --apply to push the changes.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
