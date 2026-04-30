import type {Money} from '@gberg/product-schema';

const FORMATTERS = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  money: Money | null | undefined,
  locale = 'en-EU',
): string {
  if (!money) return '';
  const key = `${locale}-${money.currencyCode}`;
  let f = FORMATTERS.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currencyCode,
      maximumFractionDigits: 2,
    });
    FORMATTERS.set(key, f);
  }
  const n = Number(money.amount);
  if (!Number.isFinite(n)) return '';
  return f.format(n);
}

export function formatLocaleFromRoute(locale: string): string {
  switch (locale.toLowerCase()) {
    case 'nl':
      return 'nl-NL';
    case 'de':
      return 'de-DE';
    case 'fr':
      return 'fr-FR';
    case 'en':
    default:
      return 'en-GB';
  }
}
