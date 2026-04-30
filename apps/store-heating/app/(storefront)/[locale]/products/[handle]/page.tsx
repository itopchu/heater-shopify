/**
 * Heating PDP.
 * Wireframe ref: shop/02_wireframes_page_blueprints.md "Heating product page".
 *
 * Above-the-fold (server-rendered, SEO-critical):
 *  - breadcrumbs, series eyebrow, title, subtitle, badge row, price,
 *    variant selector, add-to-cart, trust strip, gallery
 *
 * Below the fold:
 *  - quick facts, AI factual block, specs table, description,
 *    sections accordion, documents, FAQ, related products.
 *
 * Data wiring: reads metafields populated by the catalog-sync pipeline
 * (`custom.subtitle`, `merchandising.badges`, `content.sections_*`,
 * `aix.entity_summary` etc) — all returned via the shared @gberg/shopify-client
 * `getHeatingProductByHandle` query. Empty data renders graceful empty states,
 * never blanks.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
} from "@gberg/ui";
import { Gallery } from "@/components/pdp/gallery";
import { BuyBox } from "@/components/pdp/buy-box";
import { QuickFacts } from "@/components/pdp/quick-facts";
import { SectionsAccordion } from "@/components/pdp/sections-accordion";
import { AiBlock } from "@/components/pdp/ai-block";
import { Documents } from "@/components/pdp/documents";
import { ProductGrid } from "@/components/product-grid";
import {
  fetchProductByHandle,
  fetchRelatedProducts,
} from "@/lib/queries";
import { formatLocaleFromRoute } from "@/lib/format";
import {
  buildQuickFacts,
  fallbackKeyFacts,
  galleryImages,
  isFaqShapedSection,
  pickSections,
  resolveSeries,
  seriesLabel,
} from "@/lib/heating-derived";
import type { HeatingProduct } from "@gberg/product-schema";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const { handle, locale } = await params;
  const product = await fetchProductByHandle(handle, locale).catch(() => null);
  if (!product) return { title: handle };
  const seo = product.common.seo;
  return {
    title: seo?.override_title ?? product.seo.title ?? product.title,
    description:
      seo?.override_description ??
      product.seo.description ??
      product.common.custom?.short_description ??
      product.common.custom?.subtitle ??
      undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const product = await fetchProductByHandle(handle, locale);
  if (!product) notFound();

  const intl = formatLocaleFromRoute(locale);
  const initialVariant = product.variants[0] ?? null;
  const subtitle =
    product.common.custom?.subtitle ?? product.common.custom?.short_description ?? "";
  const dispatch =
    product.common.shipping?.dispatch_note ?? "Usually dispatched within 3 business days";

  const series = resolveSeries(product.tags);
  const eyebrow = series ? seriesLabel(series) : product.productType ?? "Radiator";

  const badges = product.common.merchandising?.badges ?? [];

  const images = galleryImages(product);
  const quickFacts = buildQuickFacts(product, initialVariant);
  const specRows = buildSpecRows(product);

  const { sections, source: sectionsSource } = pickSections(product);
  const faqs = buildFaqsFromSections(sections);

  const aix = product.common.aix ?? {};
  const keyFacts = aix.key_facts ?? fallbackKeyFacts(product);

  const related = await fetchRelatedProducts(product, locale, 4).catch(
    () => [] as HeatingProduct[],
  );

  return (
    <article className="container-x pb-24 pt-6">
      <Breadcrumb
        items={[
          { label: "Home", href: `/${locale}` },
          // Link to the first collection the product belongs to so the
          // breadcrumb always points at a real PLP. Falls back to the
          // headline "Living rooms" collection — exists on every G-Berg
          // store and avoids the dead `collections/all` Shopify never auto-
          // creates.
          {
            label: "Radiators",
            href: `/${locale}/collections/${product.collectionHandles?.[0] ?? "wohnraumheizkoerper"}`,
          },
          { label: product.title },
        ]}
        className="mb-6"
      />

      {/* ABOVE THE FOLD */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr]">
        <Gallery images={images} alt={product.title} />

        <div className="lg:sticky lg:top-24 self-start space-y-6">
          <header>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-3 text-[clamp(1.75rem,2vw+1rem,2.5rem)] font-semibold leading-tight">
              {product.title}
            </h1>
            {subtitle ? (
              <p className="mt-3 text-[var(--color-text-muted)]">{subtitle}</p>
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
            options={product.options}
            variants={product.variants}
            initialVariant={initialVariant}
            locale={intl}
            fallbackPrice={product.priceRange.minVariantPrice}
          />

          <QuickFacts facts={quickFacts} />

          {/* Trust + dispatch */}
          <ul className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
            <li className="flex items-center gap-2">
              <span aria-hidden>•</span>
              <span>{dispatch}</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden>•</span>
              <span>30-day returns</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden>•</span>
              <span>10-year warranty</span>
            </li>
          </ul>
        </div>
      </div>

      {/* BELOW THE FOLD */}
      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-12">
          {/* AI-readable factual block (per brief 11). */}
          <AiBlock
            entitySummary={aix.entity_summary}
            keyFacts={keyFacts}
            compatibilitySummary={aix.compatibility_summary}
            customerQuestionSummary={aix.customer_question_summary}
          />

          {/* Description (short copy + html fallback) */}
          <DescriptionSection product={product} />

          {/* Specs table */}
          <section>
            <Eyebrow>Technical specifications</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold">Specs at a glance</h2>
            <div className="mt-4">
              <SpecsTable
                rows={specRows}
                emptyState="Specifications coming soon — our catalog team is enriching this product."
              />
            </div>
          </section>

          {/* Long-form sections from `content.sections_en` (or DE fallback). */}
          {sections.length > 0 ? (
            <section>
              <Eyebrow>About this product</Eyebrow>
              <h2 className="mt-3 text-2xl font-semibold">More detail</h2>
              <div className="mt-4">
                <SectionsAccordion sections={sections} source={sectionsSource} />
              </div>
            </section>
          ) : null}

          {/* Documents */}
          <Documents primaryPdfUrl={product.common.media?.primary_pdf_url} />

          {/* FAQ — derived from FAQ-shaped sections until seo.faq_group lands. */}
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

        {/* Sticky side rail (delivery/returns) */}
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

      {/* Related */}
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

/* ------------------------------------------------------------------ */

function buildSpecRows(p: HeatingProduct): SpecRow[] {
  const rows: SpecRow[] = [];
  if (p.specs.width_mm != null) rows.push({ label: "Width", value: p.specs.width_mm, unit: "mm" });
  if (p.specs.height_mm != null) rows.push({ label: "Height", value: p.specs.height_mm, unit: "mm" });
  if (p.specs.depth_mm != null) rows.push({ label: "Depth", value: p.specs.depth_mm, unit: "mm" });
  if (p.specs.orientation) rows.push({ label: "Orientation", value: p.specs.orientation });
  if (p.specs.connection_type) rows.push({ label: "Connection type", value: p.specs.connection_type });
  if (p.specs.pipe_spacing_mm != null) rows.push({ label: "Pipe spacing", value: p.specs.pipe_spacing_mm, unit: "mm" });
  if (p.specs.heating_medium) rows.push({ label: "Heating medium", value: p.specs.heating_medium });
  if (p.specs.heat_output_75_65_20 != null)
    rows.push({ label: "Heat output (75/65/20)", value: p.specs.heat_output_75_65_20, unit: "W" });
  if (p.specs.heat_output_70_55_20 != null)
    rows.push({ label: "Heat output (70/55/20)", value: p.specs.heat_output_70_55_20, unit: "W" });
  if (p.specs.heat_output_55_45_20 != null)
    rows.push({ label: "Heat output (55/45/20)", value: p.specs.heat_output_55_45_20, unit: "W" });
  if (p.specs.color) rows.push({ label: "Color", value: p.specs.color });
  if (p.specs.finish) rows.push({ label: "Finish", value: p.specs.finish });
  if (p.specs.material) rows.push({ label: "Material", value: p.specs.material });
  if (p.specs.voltage) rows.push({ label: "Voltage", value: p.specs.voltage });
  if (p.specs.heat_pump_compatible != null)
    rows.push({ label: "Heat-pump compatible", value: p.specs.heat_pump_compatible ? "Yes" : "No" });
  if (p.specs.bathroom_suitable != null)
    rows.push({ label: "Bathroom suitable", value: p.specs.bathroom_suitable ? "Yes" : "No" });
  if (p.specs.max_pressure_bar != null)
    rows.push({ label: "Max pressure", value: p.specs.max_pressure_bar, unit: "bar" });
  if (p.specs.max_temp_c != null)
    rows.push({ label: "Max temperature", value: p.specs.max_temp_c, unit: "°C" });
  return rows;
}

function buildFaqsFromSections(
  sections: { title: string; text: string; html: string }[],
): FaqItem[] {
  return sections
    .filter(isFaqShapedSection)
    .slice(0, 8)
    .map((s, i) => ({
      id: `faq-${i}`,
      question: s.title,
      answer: s.html ? (
        <div dangerouslySetInnerHTML={{ __html: s.html }} />
      ) : (
        s.text
      ),
    }));
}

function DescriptionSection({ product }: { product: HeatingProduct }) {
  const short = product.common.custom?.short_description?.trim();
  const desc = product.descriptionHtml?.trim();
  if (!short && !desc) return null;
  return (
    <section>
      <Eyebrow>Overview</Eyebrow>
      {short ? (
        <p className="mt-3 max-w-[65ch] whitespace-pre-line text-[var(--color-text)] leading-relaxed">
          {short}
        </p>
      ) : null}
      {desc ? (
        <div
          className="prose prose-sm mt-4 max-w-none text-[var(--color-text)]"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
      ) : null}
    </section>
  );
}
