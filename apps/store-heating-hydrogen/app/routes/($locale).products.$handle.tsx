/**
 * Heating PDP. Hydrogen port of
 * apps/store-heating/app/(storefront)/[locale]/products/[handle]/page.tsx.
 */
import {useLoaderData} from 'react-router';
import type {Route} from './+types/products.$handle';
import {
  BadgePill,
  Breadcrumb,
  Eyebrow,
  FaqAccordion,
  SpecsTable,
  badgeLabel,
  badgeTone,
  type FaqItem,
  type SpecRow,
} from '@gberg/ui';
import {Gallery} from '~/components/gberg/pdp/gallery';
import {BuyBox} from '~/components/gberg/pdp/buy-box';
import {QuickFacts} from '~/components/gberg/pdp/quick-facts';
import {SectionsAccordion} from '~/components/gberg/pdp/sections-accordion';
import {AiBlock} from '~/components/gberg/pdp/ai-block';
import {Documents} from '~/components/gberg/pdp/documents';
import {CollapsibleSection} from '~/components/gberg/pdp/collapsible-section';
import {StarBadge} from '~/components/gberg/pdp/star-badge';
import {ReviewsBlock} from '~/components/gberg/pdp/reviews-block';
import {fetchJudgemeData} from '~/lib/gberg/judgeme';
import {SiblingColors} from '~/components/gberg/pdp/sibling-colors';
import {ProductGrid} from '~/components/gberg/plp/product-grid';
import {createGbergClient} from '~/lib/storefront.server';
import {
  fetchAllProducts,
  fetchProductByHandle,
  fetchRelatedProducts,
} from '~/lib/gberg/queries';
import {formatLocaleFromRoute} from '~/lib/gberg/format';
import {normalizeLocale, tFor, useT, type TFunction} from '~/lib/gberg/i18n';
import {BRAND_NAME, buildSeoMeta} from '~/lib/gberg/seo';
import {
  buildBreadcrumb,
  fallbackKeyFacts,
  findSiblingColors,
  galleryImages,
  isFaqShapedSection,
  pickSections,
  resolveSeriesLabel,
} from '~/lib/gberg/heating-derived';
import {
  buildBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  buildProductJsonLd,
  type FaqEntry,
} from '~/lib/gberg/jsonld';
import type {HeatingProduct} from '@gberg/product-schema';

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {product?: HeatingProduct; locale?: ReturnType<typeof normalizeLocale>} | undefined;
  location: {pathname: string};
}) => {
  const t = tFor(data?.locale ?? 'en');
  const product = data?.product;
  if (!product) {
    // 410 case (or genuine miss) — still emit branded title and a
    // canonical so AI crawlers see a structured fallback instead of
    // bare "Product".
    const fallbackTitle = `${t('pdp.product_no_longer_available')} — ${BRAND_NAME}`;
    return [
      {title: fallbackTitle},
      ...buildSeoMeta({
        title: fallbackTitle,
        description: t('pdp.product_no_longer_available_description'),
        pathname: location.pathname,
        type: 'website',
      }),
    ];
  }
  const seo = product.common.seo;
  const baseTitle =
    seo?.override_title ?? product.seo.title ?? product.title ?? 'Product';
  // Append brand suffix when the merchant-provided title doesn't already
  // include it. Brand identity, not editable copy.
  const title = baseTitle.includes(BRAND_NAME)
    ? baseTitle
    : `${baseTitle} — ${BRAND_NAME}`;
  const description =
    seo?.override_description ??
    product.seo.description ??
    product.common.custom?.short_description ??
    product.common.custom?.subtitle ??
    '';
  const ogImage =
    galleryImages(product)[0]?.url ?? undefined;

  // Derive the JSON-LD payloads. Each builder reads from the same
  // product/locale/sections data the React component renders, so the
  // visible-content parity rule holds.
  const locale = data?.locale ?? 'en';
  const crumbs = buildBreadcrumb(product, locale);
  const breadcrumbLd = buildBreadcrumbJsonLd(crumbs);
  const productLd = buildProductJsonLd(product, location.pathname);
  // FAQ JSON-LD mirrors the visible <FaqAccordion> — same Q/A, same order.
  const {sections} = pickSections(product, locale);
  const faqPlain: FaqEntry[] = sections
    .filter(isFaqShapedSection)
    .slice(0, 8)
    .map((s) => ({question: s.title, answer: s.text || s.html || ''}));
  const faqLd = buildFaqPageJsonLd(faqPlain);

  return [
    {title},
    {name: 'description', content: description},
    ...buildSeoMeta({
      title,
      description,
      pathname: location.pathname,
      type: 'product',
      ogImage,
    }),
    productLd,
    ...(breadcrumbLd ? [breadcrumbLd] : []),
    ...(faqLd ? [faqLd] : []),
  ];
};

export async function loader({context, params}: Route.LoaderArgs) {
  const locale = normalizeLocale(params.locale);
  const handle = params.handle;
  if (!handle) throw new Response('Missing handle', {status: 404});

  const client = createGbergClient(context.storefront);
  const product = await fetchProductByHandle(client, handle, locale);
  if (!product) {
    // 410 Gone — explicitly tell crawlers this URL was a real product
    // that no longer exists, so they de-index it. Plain 404 leaves the
    // URL eligible for re-crawl indefinitely. The error boundary still
    // renders a polite "no longer available — browse similar" UI.
    throw new Response('Product no longer available', {status: 410});
  }

  // Sibling-color cross-link (Track B): pull a single page of products
  // and resolve siblings in-memory. The catalog is 55 products today,
  // so a single 60-item fetch covers it without pagination. The
  // metafield-backfilled `editorial.series` is the join key; we fall
  // back to the legacy tag-derived series in `findSiblingColors`.
  const [related, allProducts, reviewsAggregate] = await Promise.all([
    fetchRelatedProducts(client, product, locale, 4).catch(
      () => [] as HeatingProduct[],
    ),
    fetchAllProducts(client, locale, {first: 60}).catch(() => ({
      products: [] as HeatingProduct[],
      pageInfo: {hasNextPage: false, endCursor: null},
    })),
    fetchJudgemeData(handle, context.env as unknown as Record<string, string | undefined>, {perPage: 30}),
  ]);
  const siblings = findSiblingColors(product, allProducts.products);

  return {locale, product, related, siblings, reviews: reviewsAggregate};
}

export default function ProductPage() {
  const {locale, product, related, siblings, reviews} = useLoaderData<typeof loader>();
  const reviewsAggregate = reviews?.aggregate ?? null;
  const t = useT();
  const crumbs = buildBreadcrumb(product, locale);

  const intl = formatLocaleFromRoute(locale);
  const initialVariant = product.variants[0] ?? null;
  const subtitle =
    product.common.custom?.subtitle ??
    product.common.custom?.short_description ??
    '';
  const dispatch =
    product.common.shipping?.dispatch_note ??
    t('pdp.dispatch_default');

  // Eyebrow prefers `custom.series` metafield, falls back to tag-derived,
  // and finally to product type — never blank.
  const eyebrow =
    resolveSeriesLabel(product) ??
    product.productType ??
    t('pdp.fallback_eyebrow_radiator');

  const badges = product.common.merchandising?.badges ?? [];

  const images = galleryImages(product);
  const specRows = buildSpecRows(product, t);

  const {sections, source: sectionsSource} = pickSections(product, locale);
  // Split sections into two disjoint sets so the same Q&A doesn't render
  // twice — once in the long-form "About" accordion AND once in the
  // dedicated FAQ block. FAQ-shaped entries (questions, How/Why/What…)
  // go to FAQ; everything else stays in About.
  const aboutSections = sections.filter((s) => !isFaqShapedSection(s));
  const faqs = buildFaqsFromSections(sections);

  const aix = product.common.aix ?? {};
  const keyFacts = aix.key_facts ?? fallbackKeyFacts(product);

  return (
    <article className="container-x pb-24 pt-6">
      {/*
        Breadcrumb above the gallery, separated from the hero by a hairline
        rule. Track B (April 2026): pulls from `seo.breadcrumb_override`
        metafield when set, otherwise derives from
        `collectionHandles[0]` + product title.
      */}
      <Breadcrumb items={crumbs} className="mb-4" />
      <div
        aria-hidden
        className="mb-6 h-px w-full bg-[var(--color-border)]"
      />
      {/* ABOVE THE FOLD */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr]">
        <Gallery images={images} alt={product.title} />

        <div className="lg:sticky lg:top-24 self-start space-y-6">
          <header>
            {/*
              Hero-scale eyebrow with rule — Complaint #5 fix. Single
              hero context, so the rule earns its place; PLP cards keep
              their plain Eyebrow.
            */}
            <Eyebrow tone="accent" withRule>
              {eyebrow}
            </Eyebrow>
            <h1 className="mt-4 font-[var(--font-display)] text-[length:var(--text-display-lg)] tracking-tight leading-[1.05] text-[var(--color-text)]">
              {product.title}
            </h1>
            {subtitle ? (
              <p className="mt-4 max-w-[var(--lede-max-width,60ch)] text-[var(--color-text-muted)]">
                {subtitle}
              </p>
            ) : null}

            {badges.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {badges.map((b) => (
                  <BadgePill key={b} tone={badgeTone(b)}>
                    {badgeLabel(b)}
                  </BadgePill>
                ))}
              </div>
            ) : null}

            {/*
              Star rating badge from Judge.me. Renders nothing until
              there's at least one published review for this product —
              follows the same empty-section rule used elsewhere.
            */}
            {reviewsAggregate && reviewsAggregate.count > 0 ? (
              <div className="mt-4">
                <StarBadge
                  rating={reviewsAggregate.rating}
                  count={reviewsAggregate.count}
                  href="#reviews"
                />
              </div>
            ) : null}
          </header>

          <BuyBox
            product={product}
            initialVariant={initialVariant}
            locale={intl}
            fallbackPrice={product.priceRange.minVariantPrice}
          />

          {/*
            Sibling-color cross-link (Track B). Renders nothing when the
            product has no other handles in its series — the lookup
            already filters by series + colour difference.
          */}
          <SiblingColors siblings={siblings} locale={locale} />

          {/*
            Structured spec block, promoted above the long-form accordion
            so spec confidence reads upfront (Complaint #3).
          */}
          <QuickFacts product={product} />

          <p className="text-xs text-[var(--color-text-muted)]">{dispatch}</p>
        </div>
      </div>

      {/* BELOW THE FOLD */}
      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          {/*
            Single unified Overview — the AiBlock (entity summary, key
            facts, compatibility, customer-Q summary, AI summary) and
            the editorial DescriptionSection (short_description +
            body_html + structured "At a glance" facts) used to stack
            as TWO sections both labelled "Product overview". Folded
            into one CollapsibleSection here. The AI block's structured
            content sits at the top (best for crawlers + at-a-glance
            scan), the editorial body sits below it.
          */}
          <CollapsibleSection
            id="overview"
            eyebrow={t('pdp.section_overview_eyebrow')}
            title={t('pdp.section_overview')}
            defaultOpen={false}
          >
            <div className="space-y-6">
              <AiBlock
                entitySummary={aix.entity_summary}
                keyFacts={keyFacts}
                compatibilitySummary={aix.compatibility_summary}
                customerQuestionSummary={aix.customer_question_summary}
                summaryBlock={aix.summary_block}
              />
              <DescriptionSection product={product} />
            </div>
          </CollapsibleSection>

          {/*
            Long-form technical detail. The headline editorial spec block
            (kW, energy class, dimensions, install, warranty) lives above
            the fold inside <QuickFacts>; this table holds the deep-dive
            rows merchants only browse on demand.
          */}
          {specRows.length > 0 ? (
            <CollapsibleSection
              id="specifications"
              eyebrow={t('pdp.section_specs_eyebrow')}
              title={t('pdp.section_specs_title')}
              defaultOpen={false}
            >
              <SpecsTable rows={specRows} />
            </CollapsibleSection>
          ) : null}

          {aboutSections.length > 0 ? (
            <CollapsibleSection
              id="about"
              eyebrow={t('pdp.section_about_eyebrow')}
              title={t('pdp.section_about_title')}
              defaultOpen={false}
            >
              <SectionsAccordion sections={aboutSections} source={sectionsSource} />
            </CollapsibleSection>
          ) : null}

          {product.common.media?.primary_pdf_url ? (
            <CollapsibleSection
              id="documents"
              eyebrow={t('pdp.documents_label')}
              title={t('pdp.documents_title')}
              defaultOpen={false}
            >
              <Documents primaryPdfUrl={product.common.media?.primary_pdf_url} />
            </CollapsibleSection>
          ) : null}

          {faqs.length > 0 ? (
            <CollapsibleSection
              id="faq"
              eyebrow={t('pdp.section_faq_eyebrow')}
              title={t('pdp.section_faq_title')}
              defaultOpen={false}
            >
              <FaqAccordion items={faqs} />
            </CollapsibleSection>
          ) : null}

          {/*
            Customer reviews block — pulls from Judge.me on the server,
            renders via <ReviewsBlock>. Renders nothing when there are
            zero published reviews. The buy-box StarBadge links to
            #reviews to scroll here.
          */}
          {reviews && reviews.aggregate.count > 0 ? (
            <CollapsibleSection
              id="reviews"
              eyebrow={t('pdp.section_reviews_eyebrow')}
              title={t('pdp.section_reviews_title')}
              defaultOpen={true}
            >
              <ReviewsBlock data={reviews} />
            </CollapsibleSection>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm">
            <p className="font-semibold">{t('pdp.delivery_returns_heading')}</p>
            <p className="mt-2 text-[var(--color-text-muted)]">
              {t('pdp.delivery_returns_body')}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm">
            <p className="font-semibold">{t('pdp.need_help_heading')}</p>
            <p className="mt-2 text-[var(--color-text-muted)]">
              {t('pdp.need_help_body')}
            </p>
            <p className="mt-3 text-[var(--color-primary)]">
              <a href="mailto:info@g-berg-gmbh.de">info@g-berg-gmbh.de</a>
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-20">
          <Eyebrow>{t('pdp.related_eyebrow')}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold">
            {t('pdp.related_title')}
          </h2>
          <div className="mt-6">
            <ProductGrid products={related} locale={locale} />
          </div>
        </section>
      ) : null}
    </article>
  );
}

function buildSpecRows(p: HeatingProduct, t: TFunction): SpecRow[] {
  const rows: SpecRow[] = [];
  const yes = t('common.yes');
  const no = t('common.no');
  if (p.specs.width_mm != null)
    rows.push({label: t('pdp.spec_label_width'), value: p.specs.width_mm, unit: 'mm'});
  if (p.specs.height_mm != null)
    rows.push({label: t('pdp.spec_label_height'), value: p.specs.height_mm, unit: 'mm'});
  if (p.specs.depth_mm != null)
    rows.push({label: t('pdp.spec_label_depth'), value: p.specs.depth_mm, unit: 'mm'});
  if (p.specs.orientation)
    rows.push({label: t('pdp.spec_label_orientation'), value: p.specs.orientation});
  if (p.specs.connection_type)
    rows.push({label: t('pdp.spec_label_connection_type'), value: p.specs.connection_type});
  if (p.specs.pipe_spacing_mm != null)
    rows.push({label: t('pdp.spec_label_pipe_spacing'), value: p.specs.pipe_spacing_mm, unit: 'mm'});
  if (p.specs.heating_medium)
    rows.push({label: t('pdp.spec_label_heating_medium'), value: p.specs.heating_medium});
  if (p.specs.heat_output_75_65_20 != null)
    rows.push({label: t('pdp.spec_label_heat_output_75'), value: p.specs.heat_output_75_65_20, unit: 'W'});
  if (p.specs.heat_output_70_55_20 != null)
    rows.push({label: t('pdp.spec_label_heat_output_70'), value: p.specs.heat_output_70_55_20, unit: 'W'});
  if (p.specs.heat_output_55_45_20 != null)
    rows.push({label: t('pdp.spec_label_heat_output_55'), value: p.specs.heat_output_55_45_20, unit: 'W'});
  if (p.specs.color)
    rows.push({label: t('pdp.spec_label_color'), value: p.specs.color});
  if (p.specs.finish)
    rows.push({label: t('pdp.spec_label_finish'), value: p.specs.finish});
  if (p.specs.material)
    rows.push({label: t('pdp.spec_label_material'), value: p.specs.material});
  if (p.specs.voltage)
    rows.push({label: t('pdp.spec_label_voltage'), value: p.specs.voltage});
  if (p.specs.heat_pump_compatible != null)
    rows.push({
      label: t('pdp.spec_label_heat_pump'),
      value: p.specs.heat_pump_compatible ? yes : no,
    });
  if (p.specs.bathroom_suitable != null)
    rows.push({
      label: t('pdp.spec_label_bathroom'),
      value: p.specs.bathroom_suitable ? yes : no,
    });
  if (p.specs.max_pressure_bar != null)
    rows.push({label: t('pdp.spec_label_max_pressure'), value: p.specs.max_pressure_bar, unit: 'bar'});
  if (p.specs.max_temp_c != null)
    rows.push({label: t('pdp.spec_label_max_temp'), value: p.specs.max_temp_c, unit: '°C'});
  return rows;
}

function buildFaqsFromSections(
  sections: {title: string; text: string; html: string}[],
): FaqItem[] {
  return sections
    .filter(isFaqShapedSection)
    .slice(0, 8)
    .map((s, i) => ({
      id: `faq-${i}`,
      question: s.title,
      answer: s.html ? (
        <div dangerouslySetInnerHTML={{__html: s.html}} />
      ) : (
        s.text
      ),
    }));
}

/**
 * xxl-heizung body_html ships with embedded `<h1 class="m-product-title">`
 * and `<h2>...<h5>` headings from the source storefront. Two consequences:
 *  - duplicate <h1> on every PDP (a11y + SEO regression);
 *  - inner heading sizes fight the editorial scale.
 * Demote every embedded heading by one level (h1→h2, h2→h3, ...) before
 * injecting. Strip class attributes left over from the source theme so
 * stale Minimog classes (`m-product-title`, etc.) don't bleed in.
 */
function demoteEmbeddedHeadings(html: string): string {
  return html
    .replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi, '<h2$1>$2</h2>')
    .replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi, '<h3$1>$2</h3>')
    .replace(/<h3\b([^>]*)>([\s\S]*?)<\/h3>/gi, '<h4$1>$2</h4>')
    .replace(/\sclass="[^"]*"/gi, '');
}

function DescriptionSection({product}: {product: HeatingProduct}) {
  const t = useT();
  const short = product.common.custom?.short_description?.trim();
  const descRaw = product.descriptionHtml?.trim();
  const desc = descRaw ? demoteEmbeddedHeadings(descRaw) : '';

  // Build "At a glance" structured fact rows from the metafields we
  // already populated catalog-wide (series, dimensions, wattage, color,
  // connection type, heat-pump compatibility, warranty, mounting kit).
  // This guarantees the Overview section is never empty even when the
  // body_html source is sparse — every product has at least the
  // structured facts to fall back on.
  const series = resolveSeriesLabel(product);
  const facts: {label: string; value: string}[] = [];
  if (series) facts.push({label: t('pdp.fact_series'), value: series});
  const dim = product.specs.dimensions_w_h_d_mm?.trim();
  if (dim) facts.push({label: t('pdp.fact_dimensions'), value: dim});
  else if (product.specs.width_mm && product.specs.height_mm) {
    facts.push({
      label: t('pdp.fact_dimensions'),
      value: `${product.specs.width_mm} × ${product.specs.height_mm} mm`,
    });
  }
  if (product.specs.wattage_w) {
    facts.push({label: t('pdp.fact_heat_output'), value: `${product.specs.wattage_w} W`});
  } else if (product.specs.heat_output_75_65_20) {
    facts.push({
      label: t('pdp.fact_heat_output'),
      value: `${product.specs.heat_output_75_65_20} W (75/65/20°C)`,
    });
  }
  if (product.specs.color) facts.push({label: t('pdp.fact_color'), value: product.specs.color});
  if (product.specs.connection_type) {
    facts.push({label: t('pdp.fact_connection'), value: product.specs.connection_type});
  }
  if (product.specs.heating_medium) {
    facts.push({
      label: t('pdp.fact_heating_medium'),
      value:
        product.specs.heating_medium === 'electric'
          ? t('plp.heating_medium_electric')
          : t('plp.heating_medium_hydronic'),
    });
  }
  if (product.specs.heat_pump_compatible) {
    facts.push({label: t('pdp.fact_heat_pump'), value: t('common.yes')});
  }
  if (product.specs.mounting_kit_included) {
    facts.push({label: t('pdp.fact_mounting_kit'), value: t('common.yes')});
  }

  if (!short && !desc && facts.length === 0) return null;

  return (
    <div className="space-y-6">
      {short ? (
        <p className="max-w-[var(--lede-max-width,60ch)] whitespace-pre-line font-[var(--font-display)] text-[length:var(--text-body-lg,1.0625rem)] leading-[1.55] text-[var(--color-text)]">
          {short}
        </p>
      ) : null}

      {/* "At a glance" fact list — derived from structured metafields
          so the Overview always has substance even when body_html is
          sparse. Two-column on md+, stacked on mobile. */}
      {facts.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 border-y border-[var(--color-border)] py-4 text-sm sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--color-text-muted)]">{f.label}</dt>
              <dd className="font-medium text-[var(--color-text)]">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {desc ? (
        <div
          className="prose-editorial"
          dangerouslySetInnerHTML={{__html: desc}}
        />
      ) : null}
    </div>
  );
}
