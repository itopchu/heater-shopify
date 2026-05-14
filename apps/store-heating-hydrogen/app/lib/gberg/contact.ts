/**
 * Single source of truth for storefront contact data.
 *
 * Update PHONE_E164 / PHONE_DISPLAY here and every consumer (utility bar,
 * contact page, WhatsApp bubble, structured data, page fallbacks, legal
 * page templates, prod scripts) picks up the new value.
 *
 * SHIPPING_COUNTRIES_ISO lists the destinations where checkout is enabled.
 * Real Shopify checkout cost is configured server-side via
 * `agent/scripts/configure-shipping.mjs` — keep the two in sync.
 */

export const PHONE_DISPLAY = '+49 172 608 88 48';

// E.164 format, digits only (12 digits: 49 + 172 608 88 48). Used by:
//   - tel: links (where most dialers also accept the leading +)
//   - wa.me URLs (which require digits-only, no +, no spaces)
export const PHONE_E164 = '491726088848';
export const PHONE_TEL_HREF = `tel:+${PHONE_E164}`;

export const SUPPORT_EMAIL = 'info@g-berg-gmbh.de';

// WhatsApp prefilled messages — ALWAYS GERMAN regardless of storefront
// locale (per requirements §2). Button labels may be translated; the
// message body must not.
export const WHATSAPP_MESSAGE_GENERIC =
  'Hallo, ich habe eine Frage zu einem Produkt auf Ihrer Website.';
export const WHATSAPP_MESSAGE_PRODUCT =
  'Hallo, ich interessiere mich für dieses Produkt und hätte gerne weitere Informationen.';

export function whatsappHref(message: string = WHATSAPP_MESSAGE_GENERIC): string {
  return `https://wa.me/${PHONE_E164}?text=${encodeURIComponent(message)}`;
}

// Shipping policy (2026-05-14 revised). Two delivery profiles in Shopify:
//  · Default (free): every product except the two Aachen valve radiators —
//    delivery cost is built into the listed price.
//  · "Aachen carrier delivery (€100 / 500 kg)": the Typ 22 + Typ 33 Aachen
//    valve radiators ship via our specialist carrier. Each variant carries a
//    uniform 62.5 kg internal weight, so the cart's weight rolls up to whole
//    500 kg brackets at €100 each: 1–8 units = €100, 9–16 = €200, etc.
//    See agent/scripts/prod-aachen-carrier-delivery.mjs.
export const SHIPPING_COUNTRIES_ISO = ['DE', 'NL', 'BE', 'LU'] as const;
