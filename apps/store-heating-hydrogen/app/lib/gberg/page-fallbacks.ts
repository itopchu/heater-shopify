/**
 * Inline fallback content for static info pages whose Shopify Admin Page
 * hasn't been created yet. Ported from apps/store-heating/lib/page-fallbacks.ts.
 *
 * The store is currently English-only — we keep just the EN copy here.
 */

import type {Locale} from './i18n';
import {PHONE_DISPLAY, SUPPORT_EMAIL} from './contact';

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
      'Talk to a heating engineer, not a chatbot. Replies within two business hours during business hours.',
    body: [
      `Email: ${SUPPORT_EMAIL}`,
      `Phone: ${PHONE_DISPLAY}`,
      'Hours: Monday – Friday, 09:00 – 17:00 CET',
      'We provide free dimensioning support: send us your room measurements, current radiator photos and heat loss (if known) and we will recommend the right model.',
    ].join('\n\n'),
  },
  imprint: {
    title: 'Imprint',
    intro: 'Information per § 5 TMG.',
    body: [
      'G-Berg GmbH\nHagenerstrasse 33\n58642 Iserlohn / Letmathe\nGermany',
      'Managing director: Gökberk Köylü',
      `Phone: ${PHONE_DISPLAY}\nEmail: ${SUPPORT_EMAIL}`,
      'VAT ID per § 27a UStG: DE450348934',
      'Liability under § 7 (1) TMG; external links checked at the time of placement.',
    ].join('\n\n'),
  },
  privacy: {
    title: 'Privacy',
    intro: 'How we handle personal data, per the GDPR.',
    body: [
      'Controller: G-Berg GmbH, Hagenerstrasse 33, 58642 Iserlohn, info@g-berg-gmbh.de.',
      'We process the minimum data needed to fulfil orders: contact details, delivery address, payment confirmations, and anonymous analytics. We never sell customer data.',
      'Recipients: payment providers (Shopify Payments, Klarna, PayPal), shipping carriers, tax authorities — only what each needs to deliver your order.',
      'Your rights: access, rectification, deletion, portability, withdrawal of consent. Email info@g-berg-gmbh.de.',
    ].join('\n\n'),
  },
  terms: {
    title: 'Terms & Conditions',
    intro: 'The terms governing orders placed on this storefront.',
    body: [
      'Prices in EUR, including local VAT. Free shipping to Germany, the Netherlands, Belgium and Luxembourg on almost the entire catalog — only the Aachen Typ 22 and Typ 33 valve radiators carry a separate carrier fee, calculated at checkout.',
      'Right of withdrawal: 30 days from delivery for unused, unopened items in original packaging. Bespoke and cut-to-length items are excluded.',
      'Warranty: 10 years on the radiator body, 2 years on electronic components, per manufacturer terms.',
      'Seller: G-Berg GmbH, Hagenerstrasse 33, 58642 Iserlohn, Germany. info@g-berg-gmbh.de.',
    ].join('\n\n'),
  },
  shipping: {
    title: 'Shipping & Delivery',
    intro:
      'We deliver to Germany, the Netherlands, Belgium and Luxembourg only. Shipping is free for almost the entire catalog — only the Aachen Typ 22 and Typ 33 valve radiators carry a separate delivery fee, calculated at checkout.',
    body: [
      'For every product except the two Aachen valve radiators, shipping is included in the listed price — no additional charge at checkout.',
      'The Aachen Typ 22 and Typ 33 valve radiators ship via our heavy carrier at €100 per order of up to 8 units, then €200 for 9–16 units, €300 for 17–24, and so on. The exact fee is shown in the cart and at checkout.',
      'Delivery countries: Germany, Netherlands, Belgium, Luxembourg. Addresses outside these four countries cannot be checked out at the moment.',
      'Standard delivery: 3–7 business days after dispatch confirmation.',
      'Curbside delivery only — items above 30 kg or 1.5 m require two-person handling on-site (ask your installer).',
    ].join('\n\n'),
  },
  returns: {
    title: 'Returns',
    intro: '30-day returns on unused, unopened items in original packaging.',
    body: [
      'To start a return, email info@g-berg-gmbh.de with your order number. We will provide a return label and instructions.',
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
      'Submit warranty claims to info@g-berg-gmbh.de with your order number, photos of the issue and the installation report.',
    ].join('\n\n'),
  },
  faq: {
    title: 'Frequently asked questions',
    intro: 'Quick answers to the questions our engineers hear most often.',
    body: [
      'Where do you ship? Germany, the Netherlands, Belgium and Luxembourg. Shipping is free for almost the entire catalog — only the Aachen Typ 22 and Typ 33 valve radiators carry a separate carrier fee (€100 per up to 8 units, scaling in 8-unit blocks), shown at checkout.',
      "Are your radiators heat-pump compatible? Many are. Look for the 'Heat-pump ready' badge on the product card.",
      'Can I install a radiator myself? Hydronic radiators must be commissioned by a certified heating engineer to keep the warranty. Electric radiators can be installed by a qualified electrician.',
      `What if the model I want is out of stock? Email ${SUPPORT_EMAIL} — most items return to stock within 4–6 weeks and we hold orders without payment until you confirm.`,
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
