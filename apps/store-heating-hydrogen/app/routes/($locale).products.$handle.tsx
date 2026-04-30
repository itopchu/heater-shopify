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
import {SiblingColors} from '~/components/gberg/pdp/sibling-colors';
import {ProductGrid} from '~/components/gberg/plp/product-grid';
import {createGbergClient} from '~/lib/storefront.server';
import {
  fetchAllProducts,
  fetchProductByHandle,
  fetchRelatedProducts,
} from '~/lib/gberg/queries';
import {formatLocaleFromRoute} from '~/lib/gberg/format';
import {normalizeLocale} from '~/lib/gberg/i18n';
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
import type {HeatingProduct} from '@gberg/product-schema';

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {product?: HeatingProduct} | undefined;
  location: {pathname: string};
}) => {
  const product = data?.product;
  if (!product) {
    // 410 case (or genuine miss) — still emit branded title and a
    // canonical so AI crawlers see a structured fallback instead of
    // bare "Product".
    const fallbackTitle = `Product no longer available — ${BRAND_NAME}`;
    return [
      {title: fallbackTitle},
      ...buildSeoMeta({
        title: fallbackTitle,
        description:
          'This product is no longer available. Browse the full catalogue for similar radiators.',
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
  const [related, allProducts] = await Promise.all([
    fetchRelatedProducts(client, product, locale, 4).catch(
      () => [] as HeatingProduct[],
    ),
    fetchAllProducts(client, locale, {first: 60}).catch(() => ({
      products: [] as HeatingProduct[],
      pageInfo: {hasNextPage: false, endCursor: null},
    })),
  ]);
  const siblings = findSiblingColors(product, allProducts.products);

  return {locale, product, related, siblings};
}

export default function ProductPage() {
  const {locale, product, related, siblings} = useLoaderData<typeof loader>();
  const crumbs = buildBreadcrumb(product, locale);

  const intl = formatLocaleFromRoute(locale);
  const initialVariant = product.variants[0] ?? null;
  const subtitle =
    product.common.custom?.subtitle ??
    product.common.custom?.short_description ??
    '';
  const dispatch =
    product.common.shipping?.dispatch_note ??
    'Usually dispatched within 3 business days';

  // Eyebrow prefers `custom.series` metafield, falls back to tag-derived,
  // and finally to product type — never blank.
  const eyebrow =
    resolveSeriesLabel(product) ?? product.productType ?? 'Radiator';

  const badges = product.common.merchandising?.badges ?? [];

  const images = galleryImages(product);
  const specRows = buildSpecRows(product);

  const {sections, source: sectionsSource} = pickSections(product);
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
      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-12">
          <AiBlock
            entitySummary={aix.entity_summary}
            keyFacts={keyFacts}
            compatibilitySummary={aix.compatibility_summary}
            customerQuestionSummary={aix.customer_question_summary}
          />

          <DescriptionSection product={product} />

          {/*
            Long-form technical detail. The headline editorial spec block
            (kW, energy class, dimensions, install, warranty) lives above
            the fold inside <QuickFacts>; this table holds the deep-dive
            rows merchants only browse on demand.

            Track B (April 2026): 41/55 catalog products today have empty
            `specs{}`. We OMIT the section entirely when there's nothing
            to show, instead of rendering "Specifications coming soon —
            our catalog team is enriching" which reads as broken.
          */}
          {specRows.length > 0 ? (
            <section>
              <Eyebrow>Technical specifications</Eyebrow>
              <h2 className="mt-3 font-[var(--font-display)] text-2xl font-semibold">
                Detailed spec sheet
              </h2>
              <div className="mt-4">
                <SpecsTable rows={specRows} />
              </div>
            </section>
          ) : null}

          {sections.length > 0 ? (
            <section>
              <Eyebrow>About this product</Eyebrow>
              <h2 className="mt-3 text-2xl font-semibold">More detail</h2>
              <div className="mt-4">
                <SectionsAccordion sections={sections} source={sectionsSource} />
              </div>
            </section>
          ) : null}

          <Documents primaryPdfUrl={product.common.media?.primary_pdf_url} />

          {faqs.length > 0 ? (
            <section>
              <Eyebrow>Frequently asked</Eyebrow>
              <h2 className="mt-3 text-2xl font-semibold">Common questions</h2>
              <div className="mt-4">
                <FaqAccordion items={faqs} />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm">
            <p className="font-semibold">Delivery &amp; returns</p>
            <p className="mt-2 text-[var(--color-text-muted)]">
              Free EU delivery over &euro;500. 30-day returns on unused items.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm">
            <p className="font-semibold">Need help?</p>
            <p className="mt-2 text-[var(--color-text-muted)]">
              Our heating engineers can answer compatibility questions before you order.
            </p>
            <p className="mt-3 text-[var(--color-primary)]">
              <a href="mailto:hello@gberg-heizung.de">hello@gberg-heizung.de</a>
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-20">
          <Eyebrow>You may also like</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold">Related products</h2>
          <div className="mt-6">
            <ProductGrid products={related} locale={locale} />
          </div>
        </section>
      ) : null}
    </article>
  );
}

function buildSpecRows(p: HeatingProduct): SpecRow[] {
  const rows: SpecRow[] = [];
  if (p.specs.width_mm != null) rows.push({label: 'Width', value: p.specs.width_mm, unit: 'mm'});
  if (p.specs.height_mm != null) rows.push({label: 'Height', value: p.specs.height_mm, unit: 'mm'});
  if (p.specs.depth_mm != null) rows.push({label: 'Depth', value: p.specs.depth_mm, unit: 'mm'});
  if (p.specs.orientation) rows.push({label: 'Orientation', value: p.specs.orientation});
  if (p.specs.connection_type)
    rows.push({label: 'Connection type', value: p.specs.connection_type});
  if (p.specs.pipe_spacing_mm != null)
    rows.push({label: 'Pipe spacing', value: p.specs.pipe_spacing_mm, unit: 'mm'});
  if (p.specs.heating_medium)
    rows.push({label: 'Heating medium', value: p.specs.heating_medium});
  if (p.specs.heat_output_75_65_20 != null)
    rows.push({label: 'Heat output (75/65/20)', value: p.specs.heat_output_75_65_20, unit: 'W'});
  if (p.specs.heat_output_70_55_20 != null)
    rows.push({label: 'Heat output (70/55/20)', value: p.specs.heat_output_70_55_20, unit: 'W'});
  if (p.specs.heat_output_55_45_20 != null)
    rows.push({label: 'Heat output (55/45/20)', value: p.specs.heat_output_55_45_20, unit: 'W'});
  if (p.specs.color) rows.push({label: 'Color', value: p.specs.color});
  if (p.specs.finish) rows.push({label: 'Finish', value: p.specs.finish});
  if (p.specs.material) rows.push({label: 'Material', value: p.specs.material});
  if (p.specs.voltage) rows.push({label: 'Voltage', value: p.specs.voltage});
  if (p.specs.heat_pump_compatible != null)
    rows.push({
      label: 'Heat-pump compatible',
      value: p.specs.heat_pump_compatible ? 'Yes' : 'No',
    });
  if (p.specs.bathroom_suitable != null)
    rows.push({
      label: 'Bathroom suitable',
      value: p.specs.bathroom_suitable ? 'Yes' : 'No',
    });
  if (p.specs.max_pressure_bar != null)
    rows.push({label: 'Max pressure', value: p.specs.max_pressure_bar, unit: 'bar'});
  if (p.specs.max_temp_c != null)
    rows.push({label: 'Max temperature', value: p.specs.max_temp_c, unit: '°C'});
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
  const short = product.common.custom?.short_description?.trim();
  const descRaw = product.descriptionHtml?.trim();
  const desc = descRaw ? demoteEmbeddedHeadings(descRaw) : '';
  if (!short && !desc) return null;
  return (
    <section className="space-y-7">
      {/*
        Editorial header — Eyebrow with rule + the lede sit at the top.
        The eyebrow earns its red 2px rule here because the description
        is its own narrative beat (chapter break) rather than yet another
        section. The lede is the curator's framing of the long-form
        body that follows.
      */}
      <header>
        <Eyebrow tone="accent" withRule>
          Overview
        </Eyebrow>
      </header>

      {short ? (
        <p
          className="max-w-[var(--lede-max-width,60ch)] whitespace-pre-line font-[var(--font-display)] text-[length:var(--text-body-lg,1.0625rem)] leading-[1.55] text-[var(--color-text)]"
        >
          {short}
        </p>
      ) : null}

      {/*
        Red accent rule — visual chapter break between the lede and the
        long-form prose. Keeps the section from reading as one undifferentiated
        block. Width is intentionally short (3rem) so it reads as an editorial
        section mark, not a section divider.
      */}
      {short && desc ? (
        <div
          aria-hidden
          className="h-[2px] w-12 bg-[var(--color-primary)]"
        />
      ) : null}

      {desc ? (
        <div
          className="prose-editorial"
          dangerouslySetInnerHTML={{__html: desc}}
        />
      ) : null}

      {/*
        Bottom hairline — a quiet rule that frames the section against
        whatever comes below (Detailed spec sheet / SectionsAccordion / FAQ).
        Without it, the long-form prose runs straight into the next eyebrow
        with no visual breath.
      */}
      <div aria-hidden className="mt-2 h-px w-full bg-[var(--color-border)]" />
    </section>
  );
}
