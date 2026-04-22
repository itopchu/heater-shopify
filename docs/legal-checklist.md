# German DSGVO / Handels-Compliance Checklist

Tick items during Phase 6. Every item must be verified on the live DE storefront before Phase 10 (launch).

## Mandatory pages (reachable ≤ 1 click from every page footer)

- [ ] **Impressum** (Shopify Page) — §5 TMG data: full legal name, street address, country, phone, email, Registergericht + HRB/HRA number, USt-IdNr, Geschäftsführer(in), Verantwortlich nach §18 MStV
- [ ] **Datenschutzerklärung** (Shopify Page) — DSGVO-compliant privacy policy covering: data controller, purposes, legal basis, third-party processors (Shopify, Klarna, PayPal, GA4, etc.), cookies, user rights, contact for data requests
- [ ] **AGB** (Shopify Page) — Allgemeine Geschäftsbedingungen
- [ ] **Widerrufsbelehrung** (Shopify Page) — 14-day right-of-withdrawal text + Muster-Widerrufsformular + electronic withdrawal button (2026 BGB update)
- [ ] **Versand & Lieferung** (optional but recommended Shopify Page) — Versandkosten, Lieferzeiten
- [ ] **Zahlungsarten** (optional) — accepted payment methods

## Price display (§1 PAngV)

- [ ] All prices show `inkl. 19% MwSt` inline
- [ ] All prices show `zzgl. Versand` (or link to Versand page) where shipping applies
- [ ] Grundpreis (price/unit) shown for products sold by volume/length where applicable
- [ ] Price strike-through for reduced items shows both original and reduced, with reduction clearly labelled

## Consent

- [ ] Shopify Customer Privacy banner enabled; configured for DE market
- [ ] GA4 / pixel scripts only fire after "Accept" (verify in DevTools Network tab — no `collect?...` requests before click)
- [ ] Decline option equally prominent as Accept
- [ ] Consent choice persists across pages
- [ ] Cookie policy linked from banner

## Newsletter

- [ ] Double opt-in enabled (Shopify Email → Settings)
- [ ] Confirmation email is in DE (and EN for EN subscribers)
- [ ] Unsubscribe link in every marketing email
- [ ] Privacy policy link in signup form

## Checkout

- [ ] VAT displayed as `inkl. 19% MwSt` on cart + checkout
- [ ] Invoice/Rechnung generated for every order (Shopify native or Klarna's)
- [ ] Order confirmation email includes Widerrufsbelehrung summary

## Bilingual coverage

- [ ] Every mandatory page exists in both DE and EN (EN translation via Translate & Adapt)
- [ ] Consent banner available in DE and EN
- [ ] Checkout available in DE and EN (Shopify Markets language setting)

## Trust signals (optional but recommended)

- [ ] Trust badge / Käuferschutz displayed (self-built metaobject or Trusted Shops free tier)
- [ ] Contact phone + email visible in footer
- [ ] Physical address visible in footer or Impressum link footer
