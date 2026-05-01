/**
 * Site footer. Hydrogen port.
 */
import {Link} from 'react-router';
import {NewsletterForm} from './newsletter-form';
import {localeHref} from '~/lib/gberg/href';
import {tFor, isSupportedLocale, DEFAULT_LOCALE} from '~/lib/gberg/i18n';

export function Footer({locale}: {locale: string}) {
  const t = tFor(isSupportedLocale(locale) ? locale : DEFAULT_LOCALE);
  const cs = [
    {label: t('footer.contact'), href: localeHref(locale, '/pages/contact')},
    {label: t('footer.faq'), href: localeHref(locale, '/pages/faq')},
    {label: t('footer.engineering_support'), href: 'mailto:hello@gberg-heizung.de'},
  ];
  const ship = [
    {label: t('footer.shipping'), href: localeHref(locale, '/pages/shipping')},
    {label: t('footer.returns'), href: localeHref(locale, '/pages/returns')},
    {label: t('footer.warranty'), href: localeHref(locale, '/pages/warranty')},
  ];
  const legal = [
    {label: t('footer.imprint'), href: localeHref(locale, '/pages/imprint')},
    {label: t('footer.privacy'), href: localeHref(locale, '/pages/privacy')},
    {label: t('footer.terms'), href: localeHref(locale, '/pages/terms')},
  ];

  return (
    <footer className="mt-16 bg-[var(--color-surface-inverse)] text-[var(--color-text-inverse)]">
      <div className="border-b border-white/15">
        <div className="container-x grid gap-6 py-10 md:grid-cols-[1.4fr_1fr] md:items-end md:gap-12">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
              {t('footer.stay_in_loop')}
            </p>
            <p className="mt-3 font-[var(--font-display)] text-3xl italic leading-[1] md:text-4xl">
              {t('footer.newsletter_promise')}
            </p>
          </div>
          <NewsletterForm dark />
        </div>
      </div>

      <div className="container-x grid grid-cols-1 gap-10 py-14 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-4">
          <p className="font-[var(--font-display)] text-5xl font-semibold leading-none md:text-6xl">
            G&#8209;Berg
          </p>
          <p className="mt-5 max-w-[28ch] text-sm text-white/90">
            {t('footer.brand_blurb')}
          </p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {t('footer.legal_entity')}
          </p>
        </div>
        <FooterColumn title={t('footer.col_customer_service')} items={cs} />
        <FooterColumn title={t('footer.col_shipping_returns')} items={ship} />
        <FooterColumn title={t('footer.col_legal')} items={legal} />
      </div>

      <div className="rule-accent-strong" aria-hidden />

      <div>
        <div className="container-x flex flex-wrap items-center justify-between gap-4 py-5 text-[11px] uppercase tracking-[0.14em] text-white/80">
          <p>{t('footer.copyright', {year: new Date().getFullYear()})}</p>
          <p>{t('footer.vat_note')}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: {label: string; href: string}[];
}) {
  return (
    <div className="md:col-span-2 md:relative md:before:absolute md:before:left-[-1rem] md:before:top-0 md:before:bottom-0 md:before:w-px md:before:bg-[var(--color-primary)]/30 lg:col-span-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
        {title}
      </p>
      <ul className="mt-5 space-y-3 text-sm">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              to={i.href}
              className="link-accent text-white transition-colors hover:text-[var(--color-primary)]"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
