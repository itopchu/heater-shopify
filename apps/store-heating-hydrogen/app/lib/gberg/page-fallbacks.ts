/**
 * Inline fallback content for static info pages whose Shopify Admin Page
 * hasn't been created yet. Ported from apps/store-heating/lib/page-fallbacks.ts.
 *
 * The store is currently English-only — we keep just the EN copy here.
 */

import type {Locale} from './i18n';

export interface PageFallback {
  title: string;
  intro: string;
  body: string;
}

export type PageFallbackHandle =
  | 'about'
  | 'contact'
  | 'imprint'
  | 'privacy'
  | 'terms'
  | 'shipping'
  | 'returns'
  | 'warranty'
  | 'faq';

const EN: Record<PageFallbackHandle, PageFallback> = {
  about: {
    title: 'About G-Berg',
    intro:
      'G-Berg designs sculptural radiators and heating systems for European homes — engineered, certified, delivered.',
    body: [
      'We curate a tight selection of European radiators across eight design series and three studio colourways. Every product is CE-certified and ships with installer-grade documentation.',
      "Our catalogue is sourced from xxl-heizung.de, the German industry reference, then re-photographed in lifestyle settings and translated into NL, DE, FR and EN before it reaches your screen.",
      "This page is editable by the merchant in Shopify Admin → Online Store → Pages. The fallback you are reading now will disappear the moment a Page with handle 'about' is published.",
    ].join('\n\n'),
  },
  contact: {
    title: 'Contact',
    intro:
      'Talk to a heating engineer, not a chatbot. Replies within two business hours during EU office hours.',
    body: [
      'Email: hello@gberg-heizung.de',
      'Phone: +49 (0)30 12 34 56 78',
      'Hours: Monday – Friday, 09:00 – 17:00 CET',
      'We provide free dimensioning support: send us your room measurements, current radiator photos and heat loss (if known) and we will recommend the right model.',
    ].join('\n\n'),
  },
  imprint: {
    title: 'Imprint',
    intro:
      'Legal information about the operator of this storefront, per § 5 TMG.',
    body: [
      'G-Berg GmbH',
      'Authorized regional reseller of xxl-heizung.de',
      "Address, registration number and VAT ID will be inserted by the merchant in Shopify Admin → Online Store → Pages → 'imprint'.",
      'Liability for content: as a service provider we are responsible for our own content under the general laws (§ 7 (1) TMG). External links are checked at the time of placement.',
    ].join('\n\n'),
  },
  privacy: {
    title: 'Privacy',
    intro: 'How we handle personal data on this storefront, per the GDPR.',
    body: [
      'We process the minimum data needed to fulfil orders: contact details, delivery address, payment confirmation from our payment provider, and analytics events scoped to anonymous device IDs.',
      'We never sell or share customer data with third parties beyond payment, shipping and tax authorities.',
      "Detailed processor list, retention periods and your rights (access, deletion, portability) will be published by the merchant in Shopify Admin → Online Store → Pages → 'privacy'.",
    ].join('\n\n'),
  },
  terms: {
    title: 'Terms & Conditions',
    intro:
      'The terms governing your use of this storefront and any orders you place.',
    body: [
      'Prices include local VAT and exclude shipping unless otherwise indicated. Currency: EUR.',
      'Right of withdrawal: 30 days from delivery for unused, unopened items in original packaging. Bespoke orders and cut-to-length pipes are excluded.',
      "Warranty: 10 years on the radiator body, 2 years on electronic components, per manufacturer terms. Detailed terms will be published by the merchant in Shopify Admin → Online Store → Pages → 'terms'.",
    ].join('\n\n'),
  },
  shipping: {
    title: 'Shipping & Delivery',
    intro:
      'We ship to Germany, Belgium, Spain, Austria, the Netherlands and other EU countries. Free over €500.',
    body: [
      'Standard delivery: 3–7 business days within the EU after dispatch confirmation.',
      'Express delivery: available for in-stock items at checkout, 1–3 business days.',
      'Curbside delivery only — items above 30 kg or 1.5 m require two-person handling on-site (ask your installer).',
      "Detailed per-country rates will be published by the merchant in Shopify Admin → Online Store → Pages → 'shipping'.",
    ].join('\n\n'),
  },
  returns: {
    title: 'Returns',
    intro: '30-day returns on unused, unopened items in original packaging.',
    body: [
      'To start a return, email hello@gberg-heizung.de with your order number. We will provide a return label and instructions.',
      'Refunds are issued to the original payment method within 14 days of receiving the returned item in re-saleable condition.',
      'Bespoke or cut-to-length items are non-refundable. We will tell you clearly before checkout.',
    ].join('\n\n'),
  },
  warranty: {
    title: 'Warranty',
    intro: '10 years on the radiator body, 2 years on electronic components.',
    body: [
      'All G-Berg radiators are CE-certified and tested against EN 442 output ratings.',
      "Warranty applies when the unit is installed by a certified heating engineer per the manufacturer's instructions.",
      'Submit warranty claims to hello@gberg-heizung.de with your order number, photos of the issue and the installation report.',
    ].join('\n\n'),
  },
  faq: {
    title: 'Frequently asked questions',
    intro: 'Quick answers to the questions our engineers hear most often.',
    body: [
      'Do you ship across Europe? Yes — Germany, Belgium, Spain, Austria, the Netherlands and more. Free over €500.',
      "Are your radiators heat-pump compatible? Many are. Look for the 'Heat-pump ready' badge on the product card.",
      'Can I install a radiator myself? Hydronic radiators must be commissioned by a certified heating engineer to keep the warranty. Electric radiators can be installed by a qualified electrician.',
      'What if the model I want is out of stock? Email hello@gberg-heizung.de — most items return to stock within 4–6 weeks and we hold orders without payment until you confirm.',
    ].join('\n\n'),
  },
};

export const FALLBACK_HANDLES = Object.keys(EN) as readonly PageFallbackHandle[];

export function isFallbackHandle(slug: string): slug is PageFallbackHandle {
  return (FALLBACK_HANDLES as readonly string[]).includes(slug);
}

export function getPageFallback(
  handle: PageFallbackHandle,
  _locale: Locale,
): PageFallback {
  return EN[handle];
}
