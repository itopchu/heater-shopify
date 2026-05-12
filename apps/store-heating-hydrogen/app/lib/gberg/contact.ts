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

// Shipping rule (storefront copy only; the Shopify delivery profile is plain
// free shipping for all four countries).
// Policy 2026-05 (revised): shipping is free everywhere — the delivery cost is
// included in the listed price for every product. (Valve radiators carry a flat
// €20/unit surcharge baked into their price via the `shipping-in-price` tag;
// see agent/scripts/prod-bake-valve-shipping-into-price.mjs — Basic plan can't
// bill €X/item at checkout without a carrier service.)
export const SHIPPING_COUNTRIES_ISO = ['DE', 'NL', 'BE', 'LU'] as const;
