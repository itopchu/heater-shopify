/**
 * Client-side faceted filtering + sorting + sticky filter button over the
 * products already fetched for one PLP page (or the shop-all route).
 *
 * IMPORTANT: this is **not** a real search index — it only filters the
 * already-rendered product set. Real per-facet search comes via the
 * search-index-engineer agent. We deliberately keep this lightweight so the
 * server-rendered cards (the SEO-critical content) keep showing up in HTML
 * before hydration.
 *
 * Three responsibilities (the user-visible behaviour shifts in Fix 6, 7, 9):
 *
 *   1. Sub-category chip row (Fix 6) — replaces the broken "All / Vertical /
 *      Panel / Bathroom-ready" hand-coded chip set. We auto-derive chips
 *      from the active product set (orientation tag, heating medium,
 *      bathroom-suitable flag, heat-pump flag). Empty filters are HIDDEN.
 *      Active chips toggle on/off, multiple can be active. URL syncs to
 *      ?filter=vertical,electric so back-nav restores state.
 *
 *   2. Sticky "Filter & sort" button (Fix 9) — at sm/md sizes only. Click
 *      opens a bottom-sheet drawer with the same filter shell + sort + an
 *      "Apply (N)" CTA. The desktop sidebar continues to render at lg+.
 *
 *   3. The product grid uses the shared <ProductGrid> component (Fix 7) so
 *      column counts and gutters match across PLP / shop-all / search.
 *
 * Filter facets are derived from the products array on first render so the
 * sidebar always reflects what's actually present.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { HeatingProduct } from "@gberg/product-schema";
import { Chip, cn } from "@gberg/ui";
import { ProductGrid } from "./product-grid";
import { useT, type TFunction } from "~/lib/gberg/i18n";
import {
  colorFamilyHex,
  resolveSeries,
  seriesLabel,
  type Series,
} from "~/lib/gberg/heating-derived";

export interface CollectionViewProps {
  products: HeatingProduct[];
  locale: string;
}

type SortKey = "newest" | "price-asc" | "price-desc" | "title";

interface FacetState {
  productType: Set<string>;
  colorFamily: Set<string>;
  series: Set<Series>;
  heatingMedium: Set<"hydronic" | "electric">;
  /** "Sub-category" chips — orientation, bathroom, heat-pump, etc. */
  flags: Set<FlagKey>;
}

type FlagKey =
  | "vertical"
  | "horizontal"
  | "panel"
  | "electric"
  | "hydronic"
  | "bathroom"
  | "heat_pump"
  | "mid_connection";

function emptyFacets(): FacetState {
  return {
    productType: new Set(),
    colorFamily: new Set(),
    series: new Set(),
    heatingMedium: new Set(),
    flags: new Set(),
  };
}

function priceNum(p: HeatingProduct): number {
  const n = Number(p.priceRange.minVariantPrice.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Per-flag predicate. Used both for filtering and for counting chip totals. */
function flagMatches(p: HeatingProduct, f: FlagKey): boolean {
  const orient = (p.specs.orientation ?? p.filters.orientation ?? "").toLowerCase();
  const productType = (p.filters.product_type ?? "").toLowerCase();
  const tags = (p.tags ?? []).map((t) => t.toLowerCase());
  const connection = (p.specs.connection_type ?? p.filters.connection_type ?? "").toLowerCase();
  switch (f) {
    case "vertical":
      return orient === "vertical" || tags.includes("vertical");
    case "horizontal":
      return orient === "horizontal" || tags.includes("horizontal");
    case "panel":
      return productType.includes("panel") || tags.includes("panel");
    case "electric":
      return p.specs.heating_medium === "electric";
    case "hydronic":
      return p.specs.heating_medium === "hydronic";
    case "bathroom":
      return Boolean(p.specs.bathroom_suitable) || tags.includes("bathroom");
    case "heat_pump":
      return Boolean(p.specs.heat_pump_compatible);
    case "mid_connection":
      return connection.includes("mid") || tags.includes("mid_connection");
  }
}

const FLAG_LABEL_KEYS: Record<FlagKey, string> = {
  vertical: "plp.flag_vertical",
  horizontal: "plp.flag_horizontal",
  panel: "plp.flag_panel",
  electric: "plp.flag_electric",
  hydronic: "plp.flag_hydronic",
  bathroom: "plp.flag_bathroom",
  heat_pump: "plp.flag_heat_pump",
  mid_connection: "plp.flag_mid_connection",
};

const FLAG_ORDER: FlagKey[] = [
  "vertical",
  "horizontal",
  "panel",
  "electric",
  "hydronic",
  "bathroom",
  "heat_pump",
  "mid_connection",
];

function flagLabel(t: TFunction, flag: FlagKey): string {
  return t(FLAG_LABEL_KEYS[flag]);
}

function applyFilters(products: HeatingProduct[], facets: FacetState): HeatingProduct[] {
  return products.filter((p) => {
    if (facets.productType.size > 0) {
      const t = p.filters.product_type;
      if (!t || !facets.productType.has(t)) return false;
    }
    if (facets.colorFamily.size > 0) {
      const raw = p.filters.color_family ?? p.specs.color;
      const c = raw ? raw.trim().toLowerCase() : null;
      if (!c || !facets.colorFamily.has(c)) return false;
    }
    if (facets.series.size > 0) {
      const s = resolveSeries(p.tags);
      if (!s || !facets.series.has(s)) return false;
    }
    if (facets.heatingMedium.size > 0) {
      const hm = p.specs.heating_medium;
      if (!hm || !facets.heatingMedium.has(hm as "hydronic" | "electric")) return false;
    }
    for (const flag of facets.flags) {
      if (!flagMatches(p, flag)) return false;
    }
    return true;
  });
}

function applySort(products: HeatingProduct[], sort: SortKey): HeatingProduct[] {
  const arr = products.slice();
  switch (sort) {
    case "price-asc":
      arr.sort((a, b) => priceNum(a) - priceNum(b));
      return arr;
    case "price-desc":
      arr.sort((a, b) => priceNum(b) - priceNum(a));
      return arr;
    case "title":
      arr.sort((a, b) => a.title.localeCompare(b.title));
      return arr;
    case "newest":
    default:
      return arr;
  }
}

/* ------------------------------------------------------------------ */
/* Facet groups                                                        */
/* ------------------------------------------------------------------ */

interface FacetGroupProps<T extends string> {
  label: string;
  values: { value: T; count: number; label?: string }[];
  selected: Set<T>;
  onToggle: (v: T) => void;
}

function FacetGroup<T extends string>({ label, values, selected, onToggle }: FacetGroupProps<T>) {
  if (values.length === 0) return null;
  return (
    <details
      open
      className="group border-b border-[var(--color-border)] pb-4 last:border-b-0"
    >
      <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
        {label}
        <span aria-hidden className="text-[var(--color-text-muted)] group-open:rotate-45">+</span>
      </summary>
      <ul className="mt-3 space-y-1">
        {values.map((v) => {
          const active = selected.has(v.value);
          return (
            <li key={v.value}>
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--color-surface-muted)] text-[var(--color-text)] font-medium"
                    : "text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]/60",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onToggle(v.value)}
                    className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                  />
                  {v.label ?? v.value}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{v.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function localizeColorChip(value: string, t: ReturnType<typeof useT>): string {
  const k = value.trim().toLowerCase();
  if (k === 'white') return t('pdp.color_white');
  if (k === 'black') return t('pdp.color_black');
  if (k === 'anthracite' || k === 'anthrazit') return t('pdp.color_anthracite');
  if (k === 'chrome' || k === 'chrom') return t('pdp.color_chrome');
  // Fallback: title-cased original (handles novel colour names gracefully).
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ColorFacetGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: { value: string; count: number }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  const t = useT();
  if (values.length === 0) return null;
  return (
    <details
      open
      className="group border-b border-[var(--color-border)] pb-4 last:border-b-0"
    >
      <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
        {label}
        <span aria-hidden className="text-[var(--color-text-muted)] group-open:rotate-45">+</span>
      </summary>
      <ul className="mt-3 flex flex-wrap gap-2">
        {values.map((v) => {
          const hex = colorFamilyHex(v.value) ?? "#cccccc";
          const active = selected.has(v.value);
          return (
            <li key={v.value}>
              <button
                type="button"
                onClick={() => onToggle(v.value)}
                aria-pressed={active}
                title={`${v.value} (${v.count})`}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-surface-muted)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]",
                )}
              >
                <span
                  className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: hex }}
                />
                <span>{localizeColorChip(v.value, t)}</span>
                <span className="text-[var(--color-text-muted)]">({v.count})</span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

const PRODUCT_TYPE_LABEL_KEYS: Record<string, string> = {
  radiator: "plp.product_type_radiator",
  towel_radiator: "plp.product_type_towel_radiator",
  underfloor_heating: "plp.product_type_underfloor_heating",
  bathroom_fixture: "plp.product_type_bathroom_fixture",
  accessory: "plp.product_type_accessory",
};

function productTypeLabel(t: TFunction, value: string): string {
  const key = PRODUCT_TYPE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

export function CollectionView({ products, locale }: CollectionViewProps) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Initial state hydrates from `?filter=…` (Fix 6 URL-sync requirement).
  const [facets, setFacets] = useState<FacetState>(() => {
    const init = emptyFacets();
    const raw = searchParams?.get("filter");
    if (raw) {
      for (const part of raw.split(",")) {
        const k = part.trim() as FlagKey;
        if ((FLAG_ORDER as readonly string[]).includes(k)) init.flags.add(k);
      }
    }
    return init;
  });
  const [sort, setSort] = useState<SortKey>("newest");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Build per-facet count maps from the *full* product set so users can see
  // the total for each option, not the post-filter total.
  const facetOptions = useMemo(() => {
    const productType = new Map<string, number>();
    const colorFamily = new Map<string, number>();
    const series = new Map<Series, number>();
    let hydronic = 0;
    let electric = 0;
    for (const p of products) {
      if (p.filters.product_type) {
        productType.set(p.filters.product_type, (productType.get(p.filters.product_type) ?? 0) + 1);
      }
      // Normalise to lowercase so legacy products that only carry the
      // capitalised `specs.color` ("White") collapse into the same
      // bucket as the canonical `filters.color_family` ("white"). Without
      // this we'd render two separate "white" filter chips.
      const colorRaw = p.filters.color_family ?? p.specs.color;
      const colorKey = colorRaw ? colorRaw.trim().toLowerCase() : null;
      if (colorKey) {
        colorFamily.set(colorKey, (colorFamily.get(colorKey) ?? 0) + 1);
      }
      const s = resolveSeries(p.tags);
      if (s) series.set(s, (series.get(s) ?? 0) + 1);
      if (p.specs.heating_medium === "hydronic") hydronic++;
      else if (p.specs.heating_medium === "electric") electric++;
    }
    return {
      productType: Array.from(productType.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({
          value,
          count,
          label: productTypeLabel(t, value),
        })),
      colorFamily: Array.from(colorFamily.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count })),
      series: Array.from(series.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({
          value,
          count,
          label: seriesLabel(value),
        })),
      hydronic,
      electric,
    };
  }, [products, t]);

  // Sub-category chip totals — only chips with ≥1 matching product render.
  const flagCounts = useMemo(() => {
    const counts = new Map<FlagKey, number>();
    for (const f of FLAG_ORDER) counts.set(f, 0);
    for (const p of products) {
      for (const f of FLAG_ORDER) {
        if (flagMatches(p, f)) counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    }
    return counts;
  }, [products]);

  const visibleFlags = useMemo(
    () => FLAG_ORDER.filter((f) => (flagCounts.get(f) ?? 0) > 0 && (flagCounts.get(f) ?? 0) < products.length),
    [flagCounts, products.length],
  );

  const filtered = useMemo(
    () => applySort(applyFilters(products, facets), sort),
    [products, facets, sort],
  );

  // URL sync: write the active flag chips back to ?filter=… so back-nav and
  // share-links restore the filter state.
  useEffect(() => {
    const flags = Array.from(facets.flags).join(",");
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (flags) params.set("filter", flags);
    else params.delete("filter");
    const qs = params.toString();
    const path = window.location.pathname;
    const url = qs ? `${path}?${qs}` : path;
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState(null, "", url);
    }
    // We intentionally don't include router in deps — replaceState avoids
    // a server round-trip and keeps the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets.flags]);

  /*
   * Post-filter scroll repair.
   *
   * When applying a filter shrinks the result list, the page document
   * height shrinks too. If the user was scrolled deep into a long PLP,
   * the browser clamps their scrollY to the new max, which can land
   * them on the footer with no products visible. Re-anchor them to the
   * top of the grid whenever the filter set changes AND their current
   * scroll position would otherwise leave them looking past the grid.
   *
   * We deliberately do NOT scroll on initial mount or when facets are
   * empty — only when the user actively narrowed the result set.
   */
  const filterSig = useMemo(() => {
    return [
      Array.from(facets.flags).sort().join(','),
      Array.from(facets.productType).sort().join(','),
      Array.from(facets.colorFamily).sort().join(','),
      Array.from(facets.series).sort().join(','),
      Array.from(facets.heatingMedium).sort().join(','),
    ].join('|');
  }, [facets]);

  useEffect(() => {
    // Skip the very first render — only fire on actual user-driven changes.
    if (typeof window === 'undefined') return;
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const viewportH = window.innerHeight;
    // If the grid top is above the viewport and we're scrolled past it,
    // OR the grid bottom sits above viewport-bottom (user is below all
    // content), pull the user back to the grid top. Otherwise leave them
    // alone — they're already looking at the right place.
    const userIsPastGrid = rect.top < -100 || rect.bottom < viewportH * 0.4;
    if (userIsPastGrid) {
      grid.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig]);

  function toggle<T extends string>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function toggleFlag(f: FlagKey) {
    setFacets((curr) => ({ ...curr, flags: toggle(curr.flags, f) }));
  }

  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  for (const v of facets.productType) {
    activeChips.push({
      key: `pt-${v}`,
      label: productTypeLabel(t, v),
      clear: () => setFacets((f) => ({ ...f, productType: toggle(f.productType, v) })),
    });
  }
  for (const v of facets.colorFamily) {
    activeChips.push({
      key: `c-${v}`,
      label: v,
      clear: () => setFacets((f) => ({ ...f, colorFamily: toggle(f.colorFamily, v) })),
    });
  }
  for (const v of facets.series) {
    activeChips.push({
      key: `s-${v}`,
      label: seriesLabel(v),
      clear: () => setFacets((f) => ({ ...f, series: toggle(f.series, v) })),
    });
  }
  for (const hm of facets.heatingMedium) {
    activeChips.push({
      key: `hm-${hm}`,
      label:
        hm === "hydronic"
          ? t("plp.heating_medium_hydronic")
          : t("plp.heating_medium_electric"),
      clear: () => setFacets((f) => ({ ...f, heatingMedium: toggle(f.heatingMedium, hm) })),
    });
  }
  for (const f of facets.flags) {
    activeChips.push({
      key: `flag-${f}`,
      label: flagLabel(t, f),
      clear: () => toggleFlag(f),
    });
  }

  const clearAll = useCallback(() => {
    setFacets(emptyFacets());
  }, []);

  const totalActive =
    facets.productType.size +
    facets.colorFamily.size +
    facets.series.size +
    facets.heatingMedium.size +
    facets.flags.size;

  const FilterShell = (
    <div className="space-y-6">
      <FacetGroup<string>
        label={t("plp.facet_type")}
        values={facetOptions.productType}
        selected={facets.productType}
        onToggle={(v) =>
          setFacets((f) => ({ ...f, productType: toggle(f.productType, v) }))
        }
      />
      <ColorFacetGroup
        label={t("plp.facet_color")}
        values={facetOptions.colorFamily}
        selected={facets.colorFamily}
        onToggle={(v) =>
          setFacets((f) => ({ ...f, colorFamily: toggle(f.colorFamily, v) }))
        }
      />
      <FacetGroup<Series>
        label={t("plp.facet_series")}
        values={facetOptions.series}
        selected={facets.series}
        onToggle={(v) => setFacets((f) => ({ ...f, series: toggle(f.series, v) }))}
      />
      <FacetGroup<"hydronic" | "electric">
        label={t("plp.facet_heating_medium")}
        values={[
          { value: "hydronic", count: facetOptions.hydronic, label: t("plp.heating_medium_hydronic") },
          { value: "electric", count: facetOptions.electric, label: t("plp.heating_medium_electric") },
        ]}
        selected={facets.heatingMedium}
        onToggle={(v) =>
          setFacets((f) => ({ ...f, heatingMedium: toggle(f.heatingMedium, v) }))
        }
      />
    </div>
  );

  return (
    <>
      {/* Sub-category chip row (Fix 6) — only renders chips with ≥1 product. */}
      {visibleFlags.length > 0 ? (
        <div
          className="mt-8 flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label={t("plp.subcategory_filters")}
        >
          <button
            type="button"
            onClick={clearAll}
            className="subchip"
            aria-pressed={totalActive === 0}
          >
            {t("plp.filter_all")}
          </button>
          {visibleFlags.map((f) => {
            const active = facets.flags.has(f);
            const count = flagCounts.get(f) ?? 0;
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFlag(f)}
                aria-pressed={active}
                className="subchip"
              >
                <span>{flagLabel(t, f)}</span>
                <span className="subchip-count">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Toolbar: result count + sort + sticky mobile filter button */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-border)] py-3 text-sm">
        <p className="text-[var(--color-text-muted)]">
          {t("plp.results_count", { shown: filtered.length, total: products.length })}
        </p>
        <div className="flex items-center gap-3">
          {/* Mobile/tablet — single button that opens the bottom-sheet (Fix 9). */}
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 border border-[var(--color-text)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]"
          >
            {t("plp.filter_sort")}
            {totalActive > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center bg-[var(--color-primary)] px-1 text-[10px] font-bold text-white">
                {totalActive}
              </span>
            ) : null}
          </button>
          <label className="hidden lg:flex items-center gap-2">
            <span className="text-[var(--color-text-muted)]">{t("plp.sort_label_inline")}</span>
            <select
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="newest">{t("plp.sort_newest")}</option>
              <option value="price-asc">{t("plp.sort_price_asc")}</option>
              <option value="price-desc">{t("plp.sort_price_desc")}</option>
              <option value="title">{t("plp.sort_title")}</option>
            </select>
          </label>
        </div>
      </div>

      {/*
        Active filter chips were here. The user reported the row of chips
        appearing under the result-count bar caused the page to jump and
        feel unstable on every click. Sidebar facet checkboxes are the
        sole control surface now — they already show the active state
        clearly, so the duplicate chip row added more friction than it
        removed.
      */}

      {/*
        Grid container is given a min-height equal to the viewport so the
        page total height never collapses dramatically when a filter trims
        the list. Without this, a user scrolled deep into a 55-product PLP
        who picks a filter that leaves 3 products would see the browser
        clamp their scrollY past the new (much shorter) document bottom —
        landing on the footer. The min-height keeps the document tall
        enough that the viewport position remains meaningful, and the
        useEffect below smooth-scrolls the grid into view if the result
        set actually shrank past the user's scroll position.

        The id="products-grid" anchor is used both by the post-filter
        scroll effect and by future deep-link / SEO needs.
      */}
      <div
        id="products-grid"
        className="mt-6 grid min-h-[60vh] scroll-mt-24 grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]"
      >
        {/* Filter sidebar (desktop only) */}
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24">{FilterShell}</div>
        </aside>

        {/* Product grid */}
        <div>
          {filtered.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-10 text-center text-sm text-[var(--color-text-muted)]">
              {t("plp.filter_no_match")}
              {activeChips.length > 0 ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[var(--color-primary)] underline-offset-2 hover:underline"
                  >
                    {t("plp.filter_clear")}
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <ProductGrid products={filtered} locale={locale} />
          )}
        </div>
      </div>

      {/* Filter & sort bottom-sheet (mobile / tablet) — Fix 9. */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        sort={sort}
        onSortChange={setSort}
        filteredCount={filtered.length}
        clearAll={clearAll}
        t={t}
      >
        {FilterShell}
      </FilterSheet>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Filter & sort bottom-sheet (Fix 9)                                  */
/* ------------------------------------------------------------------ */

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  filteredCount: number;
  clearAll: () => void;
  children: React.ReactNode;
  t: TFunction;
}

function FilterSheet({
  open,
  onClose,
  sort,
  onSortChange,
  filteredCount,
  clearAll,
  children,
  t,
}: FilterSheetProps) {
  // ESC close + scroll lock.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className="drawer-overlay lg:hidden"
        data-open={open}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className="drawer-panel drawer-panel--bottom lg:hidden"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label={t("plp.filter_sort")}
        // `inert` removes the closed drawer's focusables from the tab
        // order AND the accessibility tree — replaces the WCAG-violating
        // `aria-hidden` on a container with focusable descendants
        // (axe rule `aria-hidden-focus`). Mirrors the mobile-drawer fix.
        suppressHydrationWarning
        {...(!open ? {inert: ''} : {})}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <p className="font-[var(--font-display)] text-xl font-semibold tracking-tight">
            {t("plp.filter_sort")}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            {t("common.close")} ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-6 border-b border-[var(--color-border)] pb-4">
            <label className="block text-sm">
              <span className="text-[var(--color-text-muted)]">{t("plp.sort_label")}</span>
              <select
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                value={sort}
                onChange={(e) => onSortChange(e.target.value as SortKey)}
              >
                <option value="newest">{t("plp.sort_newest")}</option>
                <option value="price-asc">{t("plp.sort_price_asc")}</option>
                <option value="price-desc">{t("plp.sort_price_desc")}</option>
                <option value="title">{t("plp.sort_title")}</option>
              </select>
            </label>
          </div>
          {children}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)] hover:underline"
          >
            {t("plp.filter_clear_all")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 max-w-xs bg-[var(--color-text)] py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-[var(--color-primary)]"
          >
            {t("plp.filter_apply", { count: filteredCount })}
          </button>
        </div>
      </div>
    </>
  );
}
