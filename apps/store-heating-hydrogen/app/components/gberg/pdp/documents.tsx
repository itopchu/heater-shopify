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
  // No content → render nothing. The empty/pending placeholders below were
  // useful while we were seeding the catalog; now that 43/55 products have
  // a live datasheet and the rest are accessories that genuinely have none,
  // an empty Documents section just adds visual noise on a PDP.
  if (!primaryPdfUrl) return null;
  const live = isUploadedUrl(primaryPdfUrl);
  if (!live) return null;
  return (
    <section aria-label={t('pdp.documents_label')}>
      <Eyebrow>{t('pdp.documents_label')}</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold">{t('pdp.documents_title')}</h2>
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
    </section>
  );
}
