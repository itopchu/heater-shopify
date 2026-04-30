/**
 * Server component. PDP "Documents" block.
 *
 * Today: the catalog-sync pipeline stores `media.primary_pdf_url` as a
 * *relative file path* (`/scrapper/.../X.pdf`), because the upload pipeline
 * doesn't yet upload PDFs to Shopify Files. We render a disabled link with a
 * short tooltip in that case so the page still signals "datasheet available".
 *
 * Once that URL becomes a `cdn.shopify.com` (or any absolute https) URL,
 * this component automatically flips the link to enabled.
 */
import { Eyebrow } from "@gberg/ui";

export interface DocumentsProps {
  primaryPdfUrl?: string;
}

function isUploadedUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export function Documents({ primaryPdfUrl }: DocumentsProps) {
  const live = isUploadedUrl(primaryPdfUrl);
  if (!primaryPdfUrl) {
    return (
      <section aria-label="Documents">
        <Eyebrow>Documents</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold">Datasheets &amp; manuals</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          No documents attached to this product yet.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Documents">
      <Eyebrow>Documents</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold">Datasheets &amp; manuals</h2>
      {live ? (
        <ul className="mt-4 space-y-2">
          <li>
            <a
              href={primaryPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[var(--color-primary)] hover:underline"
            >
              <span aria-hidden>PDF</span>
              Download datasheet
            </a>
          </li>
        </ul>
      ) : (
        <p
          className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
          title="Datasheet available — coming online once we upload it to Shopify"
        >
          <span aria-hidden>PDF</span>
          Datasheet available — coming online
        </p>
      )}
    </section>
  );
}
