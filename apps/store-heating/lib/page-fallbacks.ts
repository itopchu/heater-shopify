/**
 * Inline fallback content for static info pages whose Shopify Admin Page
 * hasn't been created yet.
 *
 * Why fall back instead of 404?  The merchant rebuild is in flight; legal
 * pages (imprint, privacy, terms) and trust pages (about, contact, shipping,
 * returns, warranty) are linked from the global footer and the homepage
 * trust strip. A 404 there is worse than placeholder copy that explicitly
 * marks itself as "merchant-editable in Shopify Admin → Pages".
 *
 * As soon as a Shopify Page with the same handle is published, the
 * `/pages/[slug]` route prefers it and ignores this map (handled in the
 * route component, not here).
 *
 * Localized strings: NL/DE/FR are machine-translated stubs; the EN entry is
 * the source of truth. Keep titles + first sentence factual; everything
 * else is a clearly-temporary "we'll fill this in" tone so the merchant
 * notices it on QA.
 */

import type { Locale } from "./i18n";

export interface PageFallback {
  title: string;
  intro: string;
  /** Plain markdown-ish body. Newlines = paragraph breaks. */
  body: string;
}

export type PageFallbackHandle =
  | "about"
  | "contact"
  | "imprint"
  | "privacy"
  | "terms"
  | "shipping"
  | "returns"
  | "warranty"
  | "faq"
  | "guides";

const EN: Record<PageFallbackHandle, PageFallback> = {
  about: {
    title: "About G-Berg",
    intro:
      "G-Berg designs sculptural radiators and heating systems for European homes — engineered, certified, delivered.",
    body: [
      "We curate a tight selection of European radiators across eight design series and three studio colourways. Every product is CE-certified and ships with installer-grade documentation.",
      "Our catalogue is sourced from xxl-heizung.de, the German industry reference, then re-photographed in lifestyle settings and translated into NL, DE, FR and EN before it reaches your screen.",
      "This page is editable by the merchant in Shopify Admin → Online Store → Pages. The fallback you are reading now will disappear the moment a Page with handle 'about' is published.",
    ].join("\n\n"),
  },
  contact: {
    title: "Contact",
    intro:
      "Talk to a heating engineer, not a chatbot. Replies within two business hours during EU office hours.",
    body: [
      "Email: hello@gberg-heizung.de",
      "Phone: +49 (0)30 12 34 56 78",
      "Hours: Monday – Friday, 09:00 – 17:00 CET",
      "We provide free dimensioning support: send us your room measurements, current radiator photos and heat loss (if known) and we will recommend the right model.",
    ].join("\n\n"),
  },
  imprint: {
    title: "Imprint",
    intro:
      "Legal information about the operator of this storefront, per § 5 TMG.",
    body: [
      "G-Berg GmbH",
      "Authorized regional reseller of xxl-heizung.de",
      "Address, registration number and VAT ID will be inserted by the merchant in Shopify Admin → Online Store → Pages → 'imprint'.",
      "Liability for content: as a service provider we are responsible for our own content under the general laws (§ 7 (1) TMG). External links are checked at the time of placement.",
    ].join("\n\n"),
  },
  privacy: {
    title: "Privacy",
    intro:
      "How we handle personal data on this storefront, per the GDPR.",
    body: [
      "We process the minimum data needed to fulfil orders: contact details, delivery address, payment confirmation from our payment provider, and analytics events scoped to anonymous device IDs.",
      "We never sell or share customer data with third parties beyond payment, shipping and tax authorities.",
      "Detailed processor list, retention periods and your rights (access, deletion, portability) will be published by the merchant in Shopify Admin → Online Store → Pages → 'privacy'.",
    ].join("\n\n"),
  },
  terms: {
    title: "Terms & Conditions",
    intro:
      "The terms governing your use of this storefront and any orders you place.",
    body: [
      "Prices include local VAT and exclude shipping unless otherwise indicated. Currency: EUR.",
      "Right of withdrawal: 30 days from delivery for unused, unopened items in original packaging. Bespoke orders and cut-to-length pipes are excluded.",
      "Warranty: 10 years on the radiator body, 2 years on electronic components, per manufacturer terms. Detailed terms will be published by the merchant in Shopify Admin → Online Store → Pages → 'terms'.",
    ].join("\n\n"),
  },
  shipping: {
    title: "Shipping & Delivery",
    intro:
      "We ship to Germany, Belgium, Spain, Austria, the Netherlands and other EU countries. Free over €500.",
    body: [
      "Standard delivery: 3–7 business days within the EU after dispatch confirmation.",
      "Express delivery: available for in-stock items at checkout, 1–3 business days.",
      "Curbside delivery only — items above 30 kg or 1.5 m require two-person handling on-site (ask your installer).",
      "Detailed per-country rates will be published by the merchant in Shopify Admin → Online Store → Pages → 'shipping'.",
    ].join("\n\n"),
  },
  returns: {
    title: "Returns",
    intro:
      "30-day returns on unused, unopened items in original packaging.",
    body: [
      "To start a return, email hello@gberg-heizung.de with your order number. We will provide a return label and instructions.",
      "Refunds are issued to the original payment method within 14 days of receiving the returned item in re-saleable condition.",
      "Bespoke or cut-to-length items are non-refundable. We will tell you clearly before checkout.",
    ].join("\n\n"),
  },
  warranty: {
    title: "Warranty",
    intro:
      "10 years on the radiator body, 2 years on electronic components.",
    body: [
      "All G-Berg radiators are CE-certified and tested against EN 442 output ratings.",
      "Warranty applies when the unit is installed by a certified heating engineer per the manufacturer's instructions.",
      "Submit warranty claims to hello@gberg-heizung.de with your order number, photos of the issue and the installation report.",
    ].join("\n\n"),
  },
  faq: {
    title: "Frequently asked questions",
    intro: "Quick answers to the questions our engineers hear most often.",
    body: [
      "Do you ship across Europe? Yes — Germany, Belgium, Spain, Austria, the Netherlands and more. Free over €500.",
      "Are your radiators heat-pump compatible? Many are. Look for the 'Heat-pump ready' badge on the product card.",
      "Can I install a radiator myself? Hydronic radiators must be commissioned by a certified heating engineer to keep the warranty. Electric radiators can be installed by a qualified electrician.",
      "What if the model I want is out of stock? Email hello@gberg-heizung.de — most items return to stock within 4–6 weeks and we hold orders without payment until you confirm.",
    ].join("\n\n"),
  },
  guides: {
    title: "Buying guides",
    intro:
      "Three short guides to help you pick the right radiator without guesswork.",
    body: [
      "Replace existing — match dimensions, pipe spacing and connection type to your current unit. Photos of the back of the radiator help us check compatibility.",
      "Shop by dimensions — narrow by width, height and depth. Useful when the wall space is fixed.",
      "Heat-pump compatible — low-temperature radiators that work efficiently with modern heat pumps. Output is rated at 55/45/20 °C, not 75/65/20 °C.",
    ].join("\n\n"),
  },
};

const NL: Partial<Record<PageFallbackHandle, Partial<PageFallback>>> = {
  about: {
    title: "Over G-Berg",
    intro:
      "G-Berg ontwerpt sculpturale radiatoren en verwarmingssystemen voor Europese woningen — geëngineerd, gecertificeerd, geleverd.",
  },
  contact: {
    title: "Contact",
    intro:
      "Praat met een verwarmingsingenieur, geen chatbot. Antwoord binnen twee werkuren tijdens kantooruren.",
  },
  imprint: {
    title: "Colofon",
    intro: "Wettelijke informatie over de exploitant van deze webshop, conform § 5 TMG.",
  },
  privacy: {
    title: "Privacy",
    intro: "Hoe wij omgaan met persoonsgegevens op deze webshop, conform de AVG.",
  },
  terms: {
    title: "Algemene voorwaarden",
    intro: "De voorwaarden voor het gebruik van deze webshop en bestellingen die u plaatst.",
  },
  shipping: {
    title: "Verzending & Levering",
    intro:
      "Wij leveren in Duitsland, België, Spanje, Oostenrijk, Nederland en andere EU-landen. Gratis vanaf €500.",
  },
  returns: {
    title: "Retourneren",
    intro: "30 dagen retourrecht op ongebruikte artikelen in originele verpakking.",
  },
  warranty: {
    title: "Garantie",
    intro: "10 jaar op het radiatorlichaam, 2 jaar op elektronische onderdelen.",
  },
  faq: {
    title: "Veelgestelde vragen",
    intro: "Korte antwoorden op de vragen die onze ingenieurs het vaakst horen.",
  },
  guides: {
    title: "Koopgidsen",
    intro: "Drie korte gidsen om de juiste radiator zonder giswerk te kiezen.",
  },
};

const DE: Partial<Record<PageFallbackHandle, Partial<PageFallback>>> = {
  about: {
    title: "Über G-Berg",
    intro:
      "G-Berg entwirft skulpturale Heizkörper und Heizsysteme für europäische Wohnräume — entwickelt, zertifiziert, geliefert.",
  },
  contact: {
    title: "Kontakt",
    intro:
      "Sprechen Sie mit einem Heizungsingenieur, nicht mit einem Chatbot. Antwort innerhalb von zwei Werkstunden.",
  },
  imprint: {
    title: "Impressum",
    intro: "Rechtliche Informationen über den Betreiber dieses Shops gemäß § 5 TMG.",
  },
  privacy: {
    title: "Datenschutz",
    intro:
      "Wie wir personenbezogene Daten in diesem Shop behandeln, gemäß der DSGVO.",
  },
  terms: {
    title: "AGB",
    intro: "Die Bedingungen für die Nutzung dieses Shops und die von Ihnen aufgegebenen Bestellungen.",
  },
  shipping: {
    title: "Versand & Lieferung",
    intro:
      "Wir liefern nach Deutschland, Belgien, Spanien, Österreich, in die Niederlande und weitere EU-Länder. Versandkostenfrei ab €500.",
  },
  returns: {
    title: "Rücksendungen",
    intro: "30 Tage Rückgaberecht auf unbenutzte Artikel in Originalverpackung.",
  },
  warranty: {
    title: "Garantie",
    intro: "10 Jahre auf den Heizkörperkörper, 2 Jahre auf elektronische Komponenten.",
  },
  faq: {
    title: "Häufige Fragen",
    intro: "Kurze Antworten auf die Fragen, die unsere Ingenieure am häufigsten hören.",
  },
  guides: {
    title: "Kaufberatung",
    intro: "Drei kurze Leitfäden, um den richtigen Heizkörper ohne Rätselraten zu finden.",
  },
};

const FR: Partial<Record<PageFallbackHandle, Partial<PageFallback>>> = {
  about: {
    title: "À propos de G-Berg",
    intro:
      "G-Berg conçoit des radiateurs sculpturaux et des systèmes de chauffage pour les foyers européens — étudiés, certifiés, livrés.",
  },
  contact: {
    title: "Contact",
    intro:
      "Parlez à un ingénieur chauffagiste, pas à un chatbot. Réponse sous deux heures ouvrables.",
  },
  imprint: {
    title: "Mentions légales",
    intro: "Informations légales concernant l'exploitant de cette boutique, conformément à la loi.",
  },
  privacy: {
    title: "Confidentialité",
    intro: "Comment nous traitons les données personnelles, conformément au RGPD.",
  },
  terms: {
    title: "Conditions générales",
    intro: "Les conditions régissant l'utilisation de cette boutique et vos commandes.",
  },
  shipping: {
    title: "Livraison",
    intro:
      "Nous livrons en Allemagne, Belgique, Espagne, Autriche, aux Pays-Bas et dans d'autres pays de l'UE. Gratuit dès 500 €.",
  },
  returns: {
    title: "Retours",
    intro: "30 jours pour retourner les articles non utilisés dans leur emballage d'origine.",
  },
  warranty: {
    title: "Garantie",
    intro: "10 ans sur le corps du radiateur, 2 ans sur les composants électroniques.",
  },
  faq: {
    title: "Questions fréquentes",
    intro: "Réponses courtes aux questions les plus fréquentes posées à nos ingénieurs.",
  },
  guides: {
    title: "Guides d'achat",
    intro: "Trois guides courts pour choisir le bon radiateur sans hésitation.",
  },
};

const LOCALE_OVERRIDES: Record<Locale, Partial<Record<PageFallbackHandle, Partial<PageFallback>>>> = {
  en: {},
};
// EN-only mode: localized fallback maps NL/DE/FR are intentionally unused.
void NL; void DE; void FR;

export const FALLBACK_HANDLES = Object.keys(EN) as readonly PageFallbackHandle[];

/**
 * Type-guard a slug against the fallback set.
 */
export function isFallbackHandle(slug: string): slug is PageFallbackHandle {
  return (FALLBACK_HANDLES as readonly string[]).includes(slug);
}

/**
 * Get fallback content for a given handle + locale. Falls back to EN copy
 * for any field the locale dictionary doesn't override.
 */
export function getPageFallback(
  handle: PageFallbackHandle,
  locale: Locale,
): PageFallback {
  const base = EN[handle];
  const over = LOCALE_OVERRIDES[locale]?.[handle] ?? {};
  return {
    title: over.title ?? base.title,
    intro: over.intro ?? base.intro,
    body: over.body ?? base.body,
  };
}
