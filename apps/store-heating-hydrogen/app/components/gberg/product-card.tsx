/**
 * Heating product card. Hydrogen port of
 * apps/store-heating/components/product-card.tsx.
 *
 * Design Refresh — April 2026 (Complaint #1: "Product separation isn't
 * instinctive — don't use immediate lines"):
 *  - Removed the literal `border-t border-[var(--color-border)]` divider
 *    under the image. Default state has no visible line — separation is
 *    pure whitespace.
 *  - Added a hover-revealed hairline frame via `--shadow-hairline-hover`
 *    on the outer `<Link>`. Pure box-shadow (no layout shift), 200ms
 *    transition, applied at hover only.
 *
 * Design Refresh — April 2026 (Complaint #5: "Design character is weak"):
 *  - Eyebrow now reads from the merchant-controlled `custom.series`
 *    metafield, with fallback to the legacy tag-derived series.
 *  - Short-spec line replaced with `<Chip tone="spec">{wattage}W</Chip>`
 *    when wattage_w / dimensions_w_h_d_mm metafields are present.
 *  - 3:4 aspect ratio preserved.
 */
import {Link} from 'react-router';
import {Image} from '@shopify/hydrogen';
import type {HeatingProduct} from '@gberg/product-schema';
import {BadgePill, badgeLabel, badgeTone, Chip, Eyebrow} from '@gberg/ui';
import {formatLocaleFromRoute, formatMoney} from '~/lib/gberg/format';
import {localeHref} from '~/lib/gberg/href';
import {useT} from '~/lib/gberg/i18n';
import {
  colorFamilyHex,
  galleryImages,
  resolveSeriesLabel,
} from '~/lib/gberg/heating-derived';

export interface ProductCardProps {
  product: HeatingProduct;
  locale: string;
}

/**
 * Legacy fallback short-spec line — used only when none of the new
 * design-refresh metafields are populated. Once backfill completes this
 * branch is rare.
 */
function legacyShortSpec(p: HeatingProduct): string {
  // specs.color used to be appended here, but the colour already lives
  // in the product title (e.g. "Twister — Towel Warmer, White") so the
  // suffix duplicated the same word visually under the title.
  const bits: string[] = [];
  if (p.specs.width_mm && p.specs.height_mm) {
    bits.push(`${p.specs.width_mm} × ${p.specs.height_mm} mm`);
  }
  if (p.specs.heat_output_75_65_20) {
    bits.push(`${p.specs.heat_output_75_65_20} W`);
  }
  return bits.join(' · ');
}

/**
 * Decorative variant-color preview row. Variant pick happens on the PDP,
 * so swatches are inert — `aria-hidden` and `inert` keep them out of the
 * tab order and the assistive-tech tree.
 */
function ColorSwatchRow({product}: {product: HeatingProduct}) {
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
    <ul
      aria-hidden
      // @ts-expect-error — `inert` is a valid HTML5 attribute, React types
      // catch up across versions; suppress without runtime impact.
      inert=""
      // React 18 hydration check sees `inert=""` as an unknown attribute
      // and surfaces #418 mismatches even though the SSR/CSR string is
      // identical. Suppress to silence the false positive — once we move
      // to React 19 this entire block can use the typed boolean prop.
      suppressHydrationWarning
      className="flex items-center gap-1.5"
    >
      {swatches.slice(0, 3).map((hex, i) => (
        <li
          key={`${hex}-${i}`}
          style={{backgroundColor: hex}}
          className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/15"
        />
      ))}
    </ul>
  );
}

export function ProductCard({product, locale}: ProductCardProps) {
  const t = useT();
  const intl = formatLocaleFromRoute(locale);
  const allImages = galleryImages(product);
  // Canonical-order first image wins over Shopify's `featuredImage`. Some
  // products on the dev store were duplicated in Shopify Admin (the white
  // ELANOR variants are copies of the black ones) and the duplicates
  // inherited the source's `featuredImage` even after gallery images were
  // swapped. The PDP gallery iterates `media` directly so it shows the
  // correct image; the PLP card was the only consumer of `featuredImage`
  // and rendered a wrong-color preview. galleryImages() walks the same
  // ordered media array as the PDP, so the card preview now matches.
  const primary = allImages[0] ?? product.featuredImage ?? null;
  const secondary = allImages.find((i) => i.url !== primary?.url) ?? null;

  // Eyebrow prefers `custom.series` metafield, falls back to tag-derived.
  // No `withRule` here — too busy at PLP grid scale.
  const eyebrow = resolveSeriesLabel(product);

  const badges = product.common.merchandising?.badges ?? [];
  const isBestseller = badges.some((b) => b.toLowerCase() === 'bestseller');
  const otherBadges = badges.filter((b) => b.toLowerCase() !== 'bestseller');

  // Spec chips replace the old plain-text short-spec paragraph. Each chip
  // is gated on a populated metafield — fall back to the legacy text only
  // when neither chip can render.
  const wattage = product.specs.wattage_w;
  const dimensions = product.specs.dimensions_w_h_d_mm?.trim();
  const hasSpecChip = (wattage != null && wattage > 0) || Boolean(dimensions);
  const fallbackSpec = hasSpecChip ? '' : legacyShortSpec(product);

  return (
    <Link
      to={localeHref(locale, `/products/${product.handle}`)}
      className="card-edit group flex h-full flex-col bg-[var(--color-surface)] transition-[box-shadow] duration-200 hover:[box-shadow:var(--shadow-hairline-hover)]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[var(--color-surface-muted)]">
        {primary ? (
          <>
            <Image
              data={primary}
              alt={primary.altText ?? product.title}
              aspectRatio="3/4"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
            {secondary ? (
              <Image
                data={secondary}
                alt=""
                aria-hidden
                aspectRatio="3/4"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
            {t('common.no_image')}
          </div>
        )}

        {isBestseller ? (
          <div className="absolute right-3 top-3">
            <BadgePill tone="bestseller">{t('pdp.bestseller_badge')}</BadgePill>
          </div>
        ) : null}

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

      {/*
        No top border — Complaint #1 fix. Separation is whitespace + the
        hover-revealed hairline shadow on the outer link.
      */}
      <div className="flex flex-1 flex-col gap-2 px-1 pb-4 pt-4">
        {/*
          Eyebrow slot is ALWAYS rendered — even on accessory products
          that have no series. This keeps the title's vertical position
          identical across cards, so price rows line up. We just print
          a non-breaking space when there's no series to display.
        */}
        <Eyebrow>{eyebrow ?? ' '}</Eyebrow>

        {/*
          Title is NOT clamped — full product name shows. Cards in the
          same row stretch to the tallest one (grid-auto-rows: 1fr +
          h-full on the link), and `mt-auto` on the price row pins
          the price to the bottom regardless of how many lines the
          title wraps to.
        */}
        <h3
          className="font-[var(--font-display)] text-[1.05rem] font-medium leading-snug tracking-tight text-[var(--color-text)]"
        >
          {product.title}
        </h3>

        {/*
          Spec slot — also always rendered with a min-height so cards
          without a chip OR a fallback line don't collapse this band.
          Empty slot is invisible but still occupies one chip-row of
          vertical space.
        */}
        <div className="min-h-[1.5rem]">
          {hasSpecChip ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {wattage != null && wattage > 0 ? (
                <Chip tone="spec">{wattage}W</Chip>
              ) : null}
              {dimensions ? <Chip tone="spec">{dimensions}</Chip> : null}
            </div>
          ) : fallbackSpec ? (
            <p className="text-xs text-[var(--color-text-muted)]">{fallbackSpec}</p>
          ) : null}
        </div>

        <div className="mt-auto flex items-baseline justify-between pt-3">
          <PriceLine product={product} intl={intl} />
          {product.specs.heat_pump_compatible ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-success)]">
              {t('pdp.heat_pump_ready')}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/**
 * Card price line with strict compare-at gating (Track B — April 2026).
 *
 * Storefront API surfaces `compareAtPriceRange.minVariantPrice` as "0.00"
 * for products without a sale (only 21/55 catalog products are on sale).
 * Render the strike-through ONLY when the compare-at value is real:
 *   - non-null
 *   - numeric > 0
 *   - strictly greater than the live min variant price
 */
function PriceLine({product, intl}: {product: HeatingProduct; intl: string}) {
  const price = product.priceRange.minVariantPrice;
  const compareAt = product.compareAtPriceRange?.minVariantPrice;
  const priceNum = Number(price.amount);
  const compareNum = compareAt ? Number(compareAt.amount) : 0;
  const hasDiscount =
    compareAt != null &&
    Number.isFinite(compareNum) &&
    compareNum > 0 &&
    Number.isFinite(priceNum) &&
    compareNum > priceNum;
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-base font-semibold tabular-nums text-[var(--color-text)]">
        {formatMoney(price, intl)}
      </span>
      {hasDiscount ? (
        <span className="text-xs text-[var(--color-text-muted)] line-through tabular-nums">
          {formatMoney(compareAt, intl)}
        </span>
      ) : null}
    </span>
  );
}
