/**
 * PDP "Documents" body — only the download list.
 *
 * Eyebrow + title come from the wrapping CollapsibleSection on the
 * PDP route, so this component intentionally omits its own header
 * to avoid the duplicate "Datasheets & manuals" + "Documents" stack
 * the user reported.
 */
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
  if (!primaryPdfUrl) return null;
  if (!isUploadedUrl(primaryPdfUrl)) return null;
  return (
    <ul className="space-y-2">
      <li>
        <a
          href={primaryPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
        >
          <span aria-hidden>{t('pdp.documents_pending_label')}</span>
          {t('pdp.documents_download')}
        </a>
      </li>
    </ul>
  );
}
