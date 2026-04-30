/**
 * PDP "Documents" block.
 */
import {Eyebrow} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

export interface DocumentsProps {
  primaryPdfUrl?: string;
}

function isUploadedUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export function Documents({primaryPdfUrl}: DocumentsProps) {
  const t = useT();
  const live = isUploadedUrl(primaryPdfUrl);
  if (!primaryPdfUrl) {
    return (
      <section aria-label={t('pdp.documents_label')}>
        <Eyebrow>{t('pdp.documents_label')}</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold">{t('pdp.documents_title')}</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {t('pdp.documents_empty')}
        </p>
      </section>
    );
  }
  return (
    <section aria-label={t('pdp.documents_label')}>
      <Eyebrow>{t('pdp.documents_label')}</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold">{t('pdp.documents_title')}</h2>
      {live ? (
        <ul className="mt-4 space-y-2">
          <li>
            <a
              href={primaryPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[var(--color-primary)] hover:underline"
            >
              <span aria-hidden>{t('pdp.documents_pending_label')}</span>
              {t('pdp.documents_download')}
            </a>
          </li>
        </ul>
      ) : (
        <p
          className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
          title="Datasheet available — coming online once we upload it to Shopify"
        >
          <span aria-hidden>{t('pdp.documents_pending_label')}</span>
          {t('pdp.documents_pending_text')}
        </p>
      )}
    </section>
  );
}
