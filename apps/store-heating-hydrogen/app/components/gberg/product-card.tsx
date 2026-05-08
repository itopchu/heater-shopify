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
  /**
   * When true, the primary image is fetched eagerly with high priority.
   * Set on the first 2 cards in a PLP grid so the LCP image isn't
   * deprioritised by the default `loading="lazy"`.
   */
  priority?: boolean;
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

export function ProductCard({product, locale, priority = false}: ProductCardProps) {
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
              // 3-up mobile / 3-up sm-md / 4-up lg / 5-up xl. Cards are
              // ~125px CSS on a 375px phone, ~280px on a 1280px desktop.
              sizes="(max-width: 1023px) 33vw, (min-width: 1024px) and (max-width: 1439px) 25vw, 22vw"
              // Span 300–1700w in 200px steps. Browser picks the variant
              // that best matches `sizes × DPR`, so a 33vw mobile @ DPR 3
              // (≈375 device px) pulls 500w and a 4-up desktop @ DPR 2
              // (≈640 device px) pulls 700w — instead of fetching one
              // oversized 800w file for every viewport.
              srcSetOptions={{
                intervals: 8,
                startingWidth: 300,
                incrementSize: 200,
                placeholderWidth: 100,
              }}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              className="card-img absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
            {secondary ? (
              <Image
                data={secondary}
                alt=""
                aria-hidden
                aspectRatio="3/4"
                sizes="(max-width: 1023px) 33vw, (min-width: 1024px) and (max-width: 1439px) 25vw, 22vw"
                srcSetOptions={{
                  intervals: 8,
                  startingWidth: 300,
                  incrementSize: 200,
                  placeholderWidth: 100,
                }}
                loading="lazy"
                className="card-img absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
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
      <div className="flex flex-1 flex-col gap-1 px-1 pb-2.5 pt-2 sm:gap-1.5 sm:pb-3 sm:pt-3 md:gap-2 md:pb-4 md:pt-4">
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
        {/*
          Title block grows to fill remaining card height (`flex-1`),
          absorbing the slack that previously sat above the price row
          on short-name cards. With grid rows already at 1fr, this
          means each card's title area "clamps" to the same height as
          the longest title in its row — long names render in full,
          short names leave a small flex slack at the top of the
          title box, and prices sit right under the spec instead of
          floating in empty space.
        */}
        <h2
          className="flex-1 font-[var(--font-display)] text-[12px] font-medium leading-[1.2] tracking-tight text-[var(--color-text)] sm:text-[13px] md:text-[1.05rem] md:leading-snug"
        >
          {product.title}
        </h2>

        {/*
          Spec slot — also always rendered with a min-height so cards
          without a chip OR a fallback line don't collapse this band.
          Empty slot is invisible but still occupies one chip-row of
          vertical space.
        */}
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

        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5 border-t border-[var(--color-border-strong)] pt-2 md:pt-3">
          <PriceLine product={product} intl={intl} />
          {product.specs.heat_pump_compatible ? (
            <span className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-success)] md:inline md:text-[10px]">
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
  const pctOff = hasDiscount
    ? Math.round(((compareNum - priceNum) / compareNum) * 100)
    : 0;

  // Compact stacked layout: compare-at sits on its own line above the
  // live price. On a 3-up mobile card (~115px) a single-row flex of
  // price + strikethrough overflows the card. Stacked + whitespace-nowrap
  // on each money value keeps every number on a single line within its
  // row, regardless of card width or locale-formatted currency length.
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      {hasDiscount ? (
        <span className="flex items-baseline gap-1.5 text-[10px] leading-tight text-[var(--color-text-muted)] sm:text-[11px]">
          <span className="line-through tabular-nums whitespace-nowrap">
            {formatMoney(compareAt, intl)}
          </span>
          <span className="font-semibold uppercase tracking-[0.06em] text-[var(--color-primary)]">
            −{pctOff}%
          </span>
        </span>
      ) : null}
      <span
        className={`tabular-nums whitespace-nowrap font-semibold leading-tight ${
          hasDiscount
            ? 'text-[13px] text-[var(--color-primary)] sm:text-[14px] md:text-base'
            : 'text-[13px] text-[var(--color-text)] sm:text-[14px] md:text-base'
        }`}
      >
        {formatMoney(price, intl)}
      </span>
    </span>
  );
}
