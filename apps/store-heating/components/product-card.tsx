/**
 * Server component. Heating product card.
 * Spec ref: shop/02_wireframes_page_blueprints.md "Heating product card contents".
 *
 * Brand treatment: square corners on the image, hairline border on the card,
 * 2px charcoal underline that animates in on hover (`.card-edit`). On hover,
 * if a secondary image is available, it cross-fades over the primary — this
 * is the "living" detail the user asked for, executed in pure CSS.
 *
 * Renders entirely from `HeatingProduct` (no client state). Filtering for
 * "bestseller" badge happens here so the pill always lands top-right of the
 * image, separate from the lower-left badge stack.
 */
import Link from "next/link";
import Image from "next/image";
import type { HeatingProduct } from "@gberg/product-schema";
import { BadgePill, badgeLabel, badgeTone, Eyebrow } from "@gberg/ui";
import { formatLocaleFromRoute, formatMoney } from "@/lib/format";
import { localeHref } from "@/lib/href";
import {
  colorFamilyHex,
  galleryImages,
  resolveSeries,
  seriesLabel,
} from "@/lib/heating-derived";

export interface ProductCardProps {
  product: HeatingProduct;
  locale: string;
}

function shortSpec(p: HeatingProduct): string {
  const bits: string[] = [];
  if (p.specs.width_mm && p.specs.height_mm) {
    bits.push(`${p.specs.width_mm} × ${p.specs.height_mm} mm`);
  }
  if (p.specs.heat_output_75_65_20) {
    bits.push(`${p.specs.heat_output_75_65_20} W`);
  }
  if (p.specs.color) bits.push(p.specs.color);
  return bits.join(" · ");
}

/**
 * Tiny color-swatch row. Only renders if we can resolve at least one swatch
 * from the product's color/family metafields.
 */
function ColorSwatchRow({ product }: { product: HeatingProduct }) {
  const candidates = [product.specs.color, product.filters.color_family];
  const swatches = Array.from(
    new Set(
      candidates
        .map((c) => colorFamilyHex(c))
        .filter((c): c is string => Boolean(c)),
    ),
  );
  if (swatches.length === 0) return null;
  return (
    <ul aria-label="Available colors" className="flex items-center gap-1.5">
      {swatches.slice(0, 3).map((hex, i) => (
        <li
          key={`${hex}-${i}`}
          aria-hidden
          style={{ backgroundColor: hex }}
          className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/15"
        />
      ))}
    </ul>
  );
}

export function ProductCard({ product, locale }: ProductCardProps) {
  const intl = formatLocaleFromRoute(locale);
  const allImages = galleryImages(product);
  const primary = product.featuredImage ?? allImages[0] ?? null;
  // Pick a secondary image (different URL than primary) for hover cross-fade.
  const secondary = allImages.find((i) => i.url !== primary?.url) ?? null;
  const spec = shortSpec(product);

  const series = resolveSeries(product.tags);
  const eyebrow = series ? seriesLabel(series) : null;

  const badges = product.common.merchandising?.badges ?? [];
  const isBestseller = badges.some((b) => b.toLowerCase() === "bestseller");
  const otherBadges = badges.filter((b) => b.toLowerCase() !== "bestseller");

  return (
    <Link
      href={localeHref(locale, `/products/${product.handle}`)}
      className="card-edit group flex flex-col bg-[var(--color-surface)]"
    >
      {/* Image — square corners, hairline frame, hover cross-fade. */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-surface-muted)]">
        {primary ? (
          <>
            <Image
              src={primary.url}
              alt={primary.altText ?? product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
            {secondary ? (
              <Image
                src={secondary.url}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
            No image
          </div>
        )}

        {/* Bestseller pill — top-right per spec. */}
        {isBestseller ? (
          <div className="absolute right-3 top-3">
            <BadgePill tone="bestseller">Bestseller</BadgePill>
          </div>
        ) : null}

        {/* Other badges (electric, new, sale, eco) top-left. */}
        {otherBadges.length > 0 ? (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
            {otherBadges.slice(0, 2).map((b) => (
              <BadgePill key={b} tone={badgeTone(b)}>
                {badgeLabel(b)}
              </BadgePill>
            ))}
          </div>
        ) : null}
      </div>

      {/* Text block — denser padding, hairline top border. */}
      <div className="flex flex-1 flex-col gap-2 border-t border-[var(--color-border)] px-1 pb-4 pt-4">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h3 className="font-[var(--font-display)] text-[1.05rem] font-medium leading-snug tracking-tight text-[var(--color-text)]">
          {product.title}
        </h3>
        {spec ? (
          <p className="text-xs text-[var(--color-text-muted)]">{spec}</p>
        ) : null}
        <ColorSwatchRow product={product} />
        <div className="mt-auto flex items-baseline justify-between pt-3">
          <span className="text-base font-semibold tabular-nums text-[var(--color-text)]">
            {formatMoney(product.priceRange.minVariantPrice, intl)}
          </span>
          {product.specs.heat_pump_compatible ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-success)]">
              Heat&#8209;pump ready
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
