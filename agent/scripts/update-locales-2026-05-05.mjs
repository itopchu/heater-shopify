#!/usr/bin/env node
/**
 * One-shot locale rewrite (May 2026) — aligns all storefront locale JSONs
 * with the new rules:
 *   - phone: +49 172 608 88 48
 *   - WhatsApp default + product messages: ALWAYS GERMAN
 *   - free-shipping copy → paid €20/item, ES/DE/NL only
 *   - drops EU-wide claims
 *   - renames `utility_bar.free_eu_delivery` → `utility_bar.paid_shipping`
 *
 * Run: node agent/scripts/update-locales-2026-05-05.mjs
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(
  __dirname,
  '..',
  '..',
  'apps',
  'store-heating-hydrogen',
  'app',
  'locales',
);

const PHONE = '+49 172 608 88 48';

// German WhatsApp messages (used unchanged in every locale per requirements §2)
const DE_GENERIC = 'Hallo, ich habe eine Frage zu einem Produkt auf Ihrer Website.';
const DE_PRODUCT = 'Hallo, ich interessiere mich für dieses Produkt und hätte gerne weitere Informationen.';

// Per-locale copy table. EN already updated by hand; this script writes the
// other 7. Keep keys terse; the goal is "no English / no free-shipping /
// correct phone / German WhatsApp message".
const COPY = {
  de: {
    paid_shipping: 'Versand 20 €/Stück',
    why_us_delivery: 'Versand 20 €/Stück · ES · DE · NL',
    faq_q1: 'Wohin liefern Sie?',
    faq_a1: 'Wir liefern nur nach Spanien, Deutschland und in die Niederlande. Versandkosten 20 € pro Stück — keine kostenfreie Versandschwelle.',
    delivery_returns_body: 'Versand 20 € pro Stück nach Spanien, Deutschland und in die Niederlande. 30 Tage Rückgaberecht für unbenutzte Artikel.',
    empty_page_blurb: 'Nehmen Sie sich einen ruhigen Moment, um den Raum zu planen. Beginnen Sie mit einer Kategorie unten oder gehen Sie direkt zum vollständigen Katalog — jedes Stück ist CE-zertifiziert und wird für 20 € pro Stück nach Spanien, Deutschland und in die Niederlande geliefert.',
    plp_empty_default_lede: 'CE-zertifizierte Heizkörper, ausgewählt für Leistung, Langlebigkeit und saubere Integration in moderne Heizungssysteme.',
    trust_title: 'Versand 20 €/Stück',
    trust_sub: 'Spanien · Deutschland · Niederlande',
    need_help_phone: `Brauchen Sie Hilfe? ${PHONE}`,
    newsletter_promise: 'Neuheiten und Kundenangebote.',
  },
  nl: {
    paid_shipping: 'Verzending € 20/stuk',
    why_us_delivery: 'Verzending € 20/stuk · ES · DE · NL',
    faq_q1: 'Waar leveren jullie?',
    faq_a1: 'Wij leveren alleen aan Spanje, Duitsland en Nederland. Verzendkosten € 20 per stuk — er is geen gratis verzenddrempel.',
    delivery_returns_body: 'Verzending € 20 per stuk naar Spanje, Duitsland en Nederland. 30 dagen retour op ongebruikte artikelen.',
    empty_page_blurb: 'Neem rustig de tijd om de ruimte te plannen. Begin met een categorie hieronder of ga direct naar de volledige catalogus — elk stuk is CE-gecertificeerd en wordt geleverd aan Spanje, Duitsland en Nederland voor € 20 per stuk.',
    plp_empty_default_lede: 'CE-gecertificeerde radiatoren, geselecteerd op prestaties, duurzaamheid en naadloze integratie met moderne verwarmingssystemen.',
    trust_title: 'Verzending € 20/stuk',
    trust_sub: 'Spanje · Duitsland · Nederland',
    need_help_phone: `Hulp nodig? ${PHONE}`,
    newsletter_promise: 'Nieuwe collecties en klantenacties.',
  },
  fr: {
    paid_shipping: 'Livraison 20 €/article',
    why_us_delivery: 'Livraison 20 €/article · ES · DE · NL',
    faq_q1: 'Où livrez-vous ?',
    faq_a1: 'Nous livrons uniquement en Espagne, Allemagne et aux Pays-Bas. Frais de port 20 € par article — pas de seuil de livraison gratuite.',
    delivery_returns_body: 'Livraison 20 € par article vers l\'Espagne, l\'Allemagne et les Pays-Bas. Retours sous 30 jours sur articles non utilisés.',
    empty_page_blurb: 'Prenez un moment pour planifier la pièce. Commencez par une catégorie ci-dessous ou allez directement au catalogue complet — chaque pièce est certifiée CE et livrée en Espagne, Allemagne et aux Pays-Bas pour 20 € par article.',
    plp_empty_default_lede: 'Radiateurs certifiés CE sélectionnés pour la performance, la durabilité et une intégration propre aux systèmes de chauffage modernes.',
    trust_title: 'Livraison 20 €/article',
    trust_sub: 'Espagne · Allemagne · Pays-Bas',
    need_help_phone: `Besoin d'aide ? ${PHONE}`,
    newsletter_promise: 'Nouveautés et offres clients.',
  },
  es: {
    paid_shipping: 'Envío 20 €/artículo',
    why_us_delivery: 'Envío 20 €/artículo · ES · DE · NL',
    faq_q1: '¿Adónde enviáis?',
    faq_a1: 'Enviamos solo a España, Alemania y los Países Bajos. Gastos de envío 20 € por artículo — no hay umbral de envío gratis.',
    delivery_returns_body: 'Envío 20 € por artículo a España, Alemania y los Países Bajos. 30 días para devoluciones de artículos sin usar.',
    empty_page_blurb: 'Tómese un momento para planificar la estancia. Empiece por una categoría a continuación o vaya directo al catálogo completo — cada pieza está certificada CE y se envía a España, Alemania y los Países Bajos por 20 € el artículo.',
    plp_empty_default_lede: 'Radiadores certificados CE seleccionados por rendimiento, durabilidad e integración limpia con sistemas de calefacción modernos.',
    trust_title: 'Envío 20 €/artículo',
    trust_sub: 'España · Alemania · Países Bajos',
    need_help_phone: `¿Necesita ayuda? ${PHONE}`,
    newsletter_promise: 'Novedades y ofertas para clientes.',
  },
  it: {
    paid_shipping: 'Spedizione 20 €/pezzo',
    why_us_delivery: 'Spedizione 20 €/pezzo · ES · DE · NL',
    faq_q1: 'Dove spedite?',
    faq_a1: 'Spediamo solo in Spagna, Germania e Paesi Bassi. Spese di spedizione 20 € per pezzo — nessuna soglia di spedizione gratuita.',
    delivery_returns_body: 'Spedizione 20 € per pezzo in Spagna, Germania e Paesi Bassi. 30 giorni di reso su articoli non utilizzati.',
    empty_page_blurb: 'Prenditi un momento per pianificare la stanza. Inizia da una categoria qui sotto o vai direttamente al catalogo completo — ogni pezzo è certificato CE e spedito in Spagna, Germania e Paesi Bassi a 20 € per pezzo.',
    plp_empty_default_lede: 'Radiatori certificati CE selezionati per prestazioni, durata e integrazione pulita con i moderni impianti di riscaldamento.',
    trust_title: 'Spedizione 20 €/pezzo',
    trust_sub: 'Spagna · Germania · Paesi Bassi',
    need_help_phone: `Serve aiuto? ${PHONE}`,
    newsletter_promise: 'Novità e offerte per i clienti.',
  },
  pl: {
    paid_shipping: 'Wysyłka 20 €/sztuka',
    why_us_delivery: 'Wysyłka 20 €/sztuka · ES · DE · NL',
    faq_q1: 'Dokąd wysyłacie?',
    faq_a1: 'Wysyłamy wyłącznie do Hiszpanii, Niemiec i Holandii. Koszt wysyłki 20 € za sztukę — brak progu darmowej wysyłki.',
    delivery_returns_body: 'Wysyłka 20 € za sztukę do Hiszpanii, Niemiec i Holandii. 30 dni na zwrot nieużywanych produktów.',
    empty_page_blurb: 'Poświęć chwilę na zaplanowanie pomieszczenia. Zacznij od kategorii poniżej lub przejdź bezpośrednio do pełnego katalogu — każdy produkt ma certyfikat CE i jest wysyłany do Hiszpanii, Niemiec i Holandii za 20 € za sztukę.',
    plp_empty_default_lede: 'Grzejniki z certyfikatem CE wybrane pod kątem wydajności, trwałości i czystej integracji z nowoczesnymi instalacjami grzewczymi.',
    trust_title: 'Wysyłka 20 €/sztuka',
    trust_sub: 'Hiszpania · Niemcy · Holandia',
    need_help_phone: `Potrzebujesz pomocy? ${PHONE}`,
    newsletter_promise: 'Nowości i oferty dla klientów.',
  },
  da: {
    paid_shipping: 'Fragt 20 €/stk',
    why_us_delivery: 'Fragt 20 €/stk · ES · DE · NL',
    faq_q1: 'Hvor leverer I?',
    faq_a1: 'Vi leverer kun til Spanien, Tyskland og Holland. Fragt 20 € pr. stk. — ingen gratis fragt-grænse.',
    delivery_returns_body: 'Fragt 20 € pr. stk. til Spanien, Tyskland og Holland. 30 dages returret på ubrugte varer.',
    empty_page_blurb: 'Tag et roligt øjeblik til at planlægge rummet. Begynd med en kategori nedenfor, eller gå direkte til hele kataloget — hver del er CE-certificeret og leveres til Spanien, Tyskland og Holland for 20 € pr. stk.',
    plp_empty_default_lede: 'CE-certificerede radiatorer valgt på baggrund af ydeevne, holdbarhed og ren integration med moderne varmesystemer.',
    trust_title: 'Fragt 20 €/stk',
    trust_sub: 'Spanien · Tyskland · Holland',
    need_help_phone: `Brug for hjælp? ${PHONE}`,
    newsletter_promise: 'Nyheder og kundetilbud.',
  },
};

function patch(localeCode, copy) {
  const path = resolve(LOCALES_DIR, `${localeCode}.json`);
  const obj = JSON.parse(readFileSync(path, 'utf8'));

  // utility_bar
  if (obj.utility_bar) {
    delete obj.utility_bar.free_eu_delivery;
    obj.utility_bar.paid_shipping = copy.paid_shipping;
    obj.utility_bar.need_help_phone = copy.need_help_phone;
  }

  // whatsapp — ALWAYS GERMAN
  if (obj.whatsapp) {
    obj.whatsapp.default_message = DE_GENERIC;
    obj.whatsapp.product_message = DE_PRODUCT;
  }

  // home
  if (obj.home) {
    obj.home.faq_q1 = copy.faq_q1;
    obj.home.faq_a1 = copy.faq_a1;
    obj.home.why_us_delivery = copy.why_us_delivery;
  }

  // pdp
  if (obj.pdp) {
    obj.pdp.delivery_returns_body = copy.delivery_returns_body;
  }

  // cart
  if (obj.cart) {
    obj.cart.empty_page_blurb = copy.empty_page_blurb;
    obj.cart.trust_free_eu_title = copy.trust_title;
    obj.cart.trust_free_eu_sub = copy.trust_sub;
  }

  // plp empty default
  if (obj.plp) {
    obj.plp.empty_default_lede = copy.plp_empty_default_lede;
  }

  // contact phone
  if (obj.contact) {
    obj.contact.channel_phone_value = PHONE;
  }

  // footer
  if (obj.footer) {
    obj.footer.newsletter_promise = copy.newsletter_promise;
  }

  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`✓ ${localeCode}.json`);
}

for (const [code, copy] of Object.entries(COPY)) {
  patch(code, copy);
}
console.log('\nDone.');
