/**
 * Custom Contact page layout.
 *
 * The generic /pages/$handle route renders Shopify pages as plain prose. The
 * contact page instead uses this structured layout: a brand hero, a 3-card
 * channel grid, a "what we can help with" list and a brief callout. Every
 * string lives under `contact.*` in the locale files so all 8 supported
 * languages render natively.
 */
import {Eyebrow} from '@gberg/ui';
import {useT} from '~/lib/gberg/i18n';

const WHATSAPP_PHONE_E164 = '491722706673';

export function ContactView() {
  const t = useT();

  const email = t('contact.channel_email_value');
  const phone = t('contact.channel_phone_value');
  const whatsappHref = `https://wa.me/${WHATSAPP_PHONE_E164}?text=${encodeURIComponent(
    t('whatsapp.default_message'),
  )}`;
  // Strip non-digits but keep leading + for tel: — most dialers accept that.
  const phoneHref = `tel:${phone.replace(/[^\d+]/g, '')}`;

  return (
    <article className="container-x py-10 lg:py-16">
      <header className="max-w-3xl">
        <Eyebrow>{t('contact.eyebrow')}</Eyebrow>
        <h1 className="display-heading mt-3 text-[clamp(2rem,3vw+1rem,3.25rem)] text-[var(--color-text)]">
          {t('contact.title')}
        </h1>
        <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-[var(--color-text-muted)]">
          {t('contact.lede')}
        </p>
        <span
          aria-hidden
          className="mt-6 inline-block h-[2px] w-12 bg-[var(--color-primary)]"
        />
      </header>

      <ul className="mt-10 grid gap-3 md:grid-cols-3 md:gap-4">
        <ContactCard
          label={t('contact.channel_email_label')}
          value={email}
          hint={t('contact.channel_email_hint')}
          href={`mailto:${email}`}
        />
        <ContactCard
          label={t('contact.channel_phone_label')}
          value={phone}
          hint={t('contact.channel_phone_hint')}
          href={phoneHref}
        />
        <ContactCard
          label={t('contact.channel_whatsapp_label')}
          value={t('contact.channel_whatsapp_value')}
          hint={t('contact.channel_whatsapp_hint')}
          href={whatsappHref}
          external
        />
      </ul>

      <div className="mt-14 grid gap-10 md:grid-cols-12 md:gap-12">
        <section className="md:col-span-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            {t('contact.help_title')}
          </p>
          <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-[var(--color-text)]">
            {[
              t('contact.help_1'),
              t('contact.help_2'),
              t('contact.help_3'),
              t('contact.help_4'),
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-[0.55rem] block h-[2px] w-4 shrink-0 bg-[var(--color-primary)]"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="md:col-span-5">
          <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            <div className="h-[3px] bg-[var(--color-primary)]" aria-hidden />
            <div className="p-6 md:p-7">
              <p className="font-[var(--font-display)] text-2xl font-medium leading-tight text-[var(--color-text)]">
                {t('contact.brief_title')}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {t('contact.brief_lede')}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-text)] px-5 py-3 text-[12px] uppercase tracking-[0.14em] font-semibold text-white transition-colors hover:bg-[var(--color-primary)]"
                >
                  {t('contact.brief_cta_email')}
                  <span aria-hidden>→</span>
                </a>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-border)] px-5 py-3 text-[12px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-text)]"
                >
                  {t('contact.brief_cta_whatsapp')}
                </a>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

interface ContactCardProps {
  label: string;
  value: string;
  hint: string;
  href: string;
  external?: boolean;
}

function ContactCard({label, value, hint, href, external}: ContactCardProps) {
  return (
    <li>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className="group flex h-full flex-col rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-[box-shadow,border-color] duration-200 hover:border-[var(--color-text)] hover:[box-shadow:var(--shadow-hairline-hover)]"
      >
        <span
          aria-hidden
          className="block h-1 w-6 rounded-full bg-[var(--color-primary)]"
        />
        <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="mt-2 break-words text-[17px] font-medium leading-snug text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
          {value}
        </span>
        <span className="mt-2 text-[13px] leading-snug text-[var(--color-text-muted)]">
          {hint}
        </span>
      </a>
    </li>
  );
}
