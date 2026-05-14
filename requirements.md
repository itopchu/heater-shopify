# requirements.md

> **Status header (2026-05-14)** — read this before treating any rule below
> as authoritative. The document was written 2026-05-12; several sections
> have been overtaken by later business decisions and shipped work.
>
> ### Superseded by current policy
> - **§0.1 / §4 / §11 / §12 / §15 — shipping is "no free shipping, €20 per
>   product, 3 countries (ES/DE/NL)"**: REPLACED. Current policy:
>   - Default delivery profile: **free** for **DE / NL / BE / LU** (4
>     countries; Spain dropped 2026-05-07).
>   - Custom "Aachen carrier delivery (€100 / 500 kg)" profile: applies to
>     the two Aachen valve radiators (Ventilheizkörper Typ 22 + Typ 33)
>     only. €100 per 500 kg block; with 62.5 kg per unit that resolves to
>     1–8 units = €100, 9–16 = €200, 17–24 = €300, etc. The weight
>     calculation is **internal** — customers see only the per-unit price
>     ladder, never the kg figure.
>   - All other products ship free; the previous "+€20 baked into price"
>     workaround has been reverted.
>   - See [agent/scripts/prod-aachen-carrier-delivery.mjs](agent/scripts/prod-aachen-carrier-delivery.mjs) and
>     [apps/store-heating-hydrogen/app/lib/gberg/contact.ts](apps/store-heating-hydrogen/app/lib/gberg/contact.ts).
> - **§3 / §15 — 8 target languages (DE, TR, ES, NL, PL, DA, IT, HU)**:
>   PARTIAL. Active locales are EN (default), DE, NL, FR. The other four
>   (TR, ES, PL, DA, IT, HU) are not in scope for this launch window.
> - **§9 — homepage section "eyebrow" tags**: DONE — every uppercase
>   eyebrow on home / shopping / cart / account routes was removed
>   (commits `77fd52b`, `093bae0`, `ae53d15`).
>
> ### Done (no further action)
> - §1 contact phone (`+49 172 608 88 48`) centralised in
>   `app/lib/gberg/contact.ts`; every consumer pulls from there.
> - §2 WhatsApp prefilled message stays German on every locale.
> - §10 contact page wired to the centralised contact constants.
> - §11 shipping/returns/warranty CMS pages rewritten to match the
>   Aachen-carrier policy (see [agent/scripts/prod-fill-footer-pages.mjs](agent/scripts/prod-fill-footer-pages.mjs)).
> - §12 product-page shipping snippets updated.
> - Series rebrand (Twister/Pullman/etc → Berlin/Dresden/Hamburg/Potsdam/
>   Mainz/Köln/Essen/Aachen/Baden) shipped; old handles 301 via Shopify
>   `urlRedirects`.
>
> ### Still pending
> - §5 — review-request automation 14 days after delivery (no
>   implementation yet; needs an app or Shopify Email flow).
> - §6 — landing-page image quality audit (partial; AI-regen pipeline
>   parked, see `memory/project_image_source_policy.md`).
> - §7 — Electric Heating Element color/material variants (no live
>   variant axes for color/material yet).
>
> The unchanged body below remains the source of truth for **layout /
> compactness / UX / brand-style** rules (§0, §8, §13, §14, §16, §17),
> which have not been superseded.

---

## Project
Shopify storefront update and localization implementation.

## Objective
Implement the following storefront, content, localization, shipping, automation, product, and mobile UX changes with minimal regressions while preserving brand identity and improving compactness, usability, and conversion efficiency.

---

## 0. Core implementation philosophy

These rules are global and override any weaker design or layout preference.

### Highest priority
**UX is the highest priority in every context.**

If there is any conflict between:
- visual decoration
- spacing
- animation
- stylistic choices
- exact symmetry
- content density
- implementation convenience

then prioritize in this order:
1. **UX**
2. **readability**
3. **clarity**
4. **compactness**
5. **brand consistency**

### Global rule: be space greedy
The implementation must be **space greedy**.

Meaning:
- use as little space as reasonably possible
- keep layouts compact and efficient
- reduce unnecessary whitespace, padding, margins, and oversized elements
- fit more useful content into the visible area without harming readability
- avoid tall sections, inflated cards, and large empty gaps
- minimize unnecessary scrolling
- make every section justify the space it consumes

This does **not** mean:
- cramped layouts
- tiny text
- poor tap targets
- weak hierarchy
- lifeless design
- reduced readability

It **does** mean:
- compact
- efficient
- readable
- elegant
- high-utility
- conversion-friendly

### Style requirement
Keep the design/style **alive and effective**.

This means:
- preserve visual energy and brand character
- maintain clear hierarchy and contrast
- keep CTAs strong and visible
- avoid turning the storefront into a dull or generic minimal layout
- compactness must feel deliberate and premium, not cheap or crowded

### Instruction to implementation AI
Do not interpret compactness as optional. Treat compact, space-efficient layout as a hard requirement across the storefront. Remove wasted space aggressively, but never at the expense of UX, readability, tap usability, or brand quality.

### Decision rule
When multiple valid implementation options exist, prefer the option that is:
- more usable
- more compact
- more readable
- more space-efficient
- still visually strong and on-brand

Avoid choices that increase page height or reduce visible content unless they clearly improve UX.

---

## 0.1 Current live-site conflicts that must be removed or corrected

The current live storefront contains content and logic that conflict with the requested business rules. These conflicts must be fully removed from theme content, translation content, policy pages, product pages, and app-configured text.

### Must remove/replace everywhere
- old contact phone number
- any “Free EU delivery” message
- any “Free delivery over €500” message
- any statement implying shipping across the EU or to countries beyond Spain, Germany, Netherlands
- any shipping text saying shipping is calculated by destination/parcel size if that conflicts with fixed shipping logic
- any FAQ answer, product snippet, policy copy, announcement bar, badge, or block that conflicts with the new shipping rules

### Acceptance criteria
- no customer-facing content remains that contradicts the updated business rules
- policy pages, homepage, FAQ, product pages, and contact page all match the same shipping/contact logic
- no stale legacy text remains in hidden sections, translation files, or secondary templates

---

## 1. Global contact data

### Required canonical contact
Use this number everywhere, without exception:

**+49 172 608 88 48**

### Update all instances of
- visible phone numbers
- `tel:` links
- WhatsApp links/buttons
- SMS/message/contact links
- company contact blocks
- header/footer contact details
- contact page
- landing pages
- product pages
- popups/banners
- theme settings
- translation files
- snippets/sections/templates
- editable app blocks/widgets where possible
- notification emails/templates where relevant
- FAQ answers
- policy pages if phone/contact appears there

### Implementation requirement
Centralize contact data in one reusable source if feasible, so future updates require changing one value only.

### Acceptance criteria
- no old phone/contact number remains anywhere customer-facing
- all clickable phone links use the correct number
- all WhatsApp links point to this number
- all language versions use the same contact number

---

## 2. WhatsApp behavior

### Requirement
All WhatsApp CTAs must use:
- phone number: **+49 172 608 88 48**
- prefilled message: **always in German**
- this rule applies to all storefront languages

### Default message
Use this unless a better approved German template already exists:

`Hallo, ich habe eine Frage zu einem Produkt auf Ihrer Website.`

If the button is product-specific, this is also acceptable:

`Hallo, ich interessiere mich für dieses Produkt und hätte gerne weitere Informationen.`

### Important rule
Do **not** localize the prefilled WhatsApp message.  
Button labels may be translated, but the message text itself must remain German in every language version.

### Additional implementation rule
If there are multiple WhatsApp entry points:
- generic contact CTA may use the generic German message
- product page CTA may include product context if technically safe
- all variants must remain in German

### Acceptance criteria
- every WhatsApp CTA opens chat for `+49 172 608 88 48`
- prefilled message is German on all language versions
- behavior is consistent across all pages/buttons

---

## 3. Localization / translation

### Source language
English

### Target languages
- German
- Turkish
- Spanish
- Dutch
- Polish
- Danish
- Italian
- Hungarian

### Requirement
Translate the full storefront and product content using a Shopify-based translation/localization solution.

### Translate at minimum
- navigation
- header/footer
- homepage / landing page
- product titles
- product descriptions
- product option labels
- variant labels where shown
- collection pages
- cart text
- contact page
- buttons / CTAs
- custom section text
- validation / informational storefront text
- metafield content displayed on storefront
- policy pages if they are part of the localized storefront
- search/filter labels if visible
- app text where supported by the app/theme architecture
- announcement bar text
- FAQ content
- delivery/returns/help blocks on product pages
- newsletter/signup labels and success/error states

### Constraints
- keep layout stable for longer translated strings
- avoid visible English leftovers on customer-facing pages
- preserve functional language switching
- WhatsApp prefilled message remains German and is not translated

### Additional translation QA requirement
Explicitly check that translated storefronts do not still show:
- English shipping notices
- English FAQ answers
- English policy fragments
- untranslated product option names
- untranslated helper text in cards or accordions

### Acceptance criteria
- all listed languages are available and selectable
- core storefront content is translated
- product content is translated
- no major customer-facing English text remains unintentionally
- layout remains usable across supported languages

---

## 4. Shipping and delivery rules

### Hard requirements
- **No free shipping under any circumstances**
- shipping cost = **20 EUR per product**
- delivery countries limited to:
  - Spain
  - Germany
  - Netherlands

### Shipping calculation
Assume **per unit quantity**, not per order.

Examples:
- qty 1 => 20 EUR shipping
- qty 2 => 40 EUR shipping
- qty 3 => 60 EUR shipping

### Implementation requirement
Shipping cost should be easy to change later, ideally from a single configuration point.

### Restrictions
Remove or disable all free-shipping logic, including:
- free shipping thresholds
- promo free shipping
- auto-discounts that create free shipping
- theme messaging implying free shipping
- app banners or widgets referencing free shipping
- FAQ or policy text mentioning free shipping
- badges or trust icons promising free delivery

### Country restriction
Only shipping addresses in Spain, Germany, and the Netherlands should be allowed.

### Required copy updates
Update all shipping-related copy so it consistently states:
- shipping is paid
- shipping is 20 EUR per product
- delivery is limited to Spain, Germany, Netherlands
- no contradictory country list appears anywhere

### Acceptance criteria
- shipping is never free
- shipping total scales as `20 EUR x product quantity`
- checkout/delivery restricted to Spain, Germany, Netherlands only
- no conflicting free-shipping text appears anywhere

---

## 5. Review request automation

### Requirement
Customers should receive a review request email **14 days after product delivery**.

### Preferred trigger
Confirmed delivery event.

### Fallback trigger
If delivery confirmation is not available in the final implementation, use the closest reliable event and document it clearly, such as:
- fulfillment completed date
- order delivered event from installed app
- shipment delivered webhook if available

### Rules
- send once per delivered order/item set
- avoid duplicate review requests
- exclude cancelled orders
- exclude fully refunded orders if appropriate
- do not send before delivery/fallback event

### Additional recommendation
If a review app is installed or chosen, ensure:
- review request email supports all required storefront languages if needed
- timing logic works with Shopify fulfillment flow
- duplicate suppression is enabled

### Acceptance criteria
- review request email is automatically sent 14 days after delivery or documented fallback trigger
- no duplicate review emails
- cancelled orders excluded

---

## 6. Image quality upgrade

### Requirement
Replace low-quality imagery, especially on the landing page.

### Priority
1. all landing page images
2. any visibly blurry, pixelated, stretched, or poorly cropped images elsewhere
3. category cards / bestseller cards / product thumbnails if low quality

### Standards
- high-quality source assets
- sharp on desktop and mobile
- brand-consistent
- optimized for web performance
- proper aspect ratios
- no distorted cropping
- responsive delivery where applicable

### Additional requirement
Audit image consistency across:
- hero image
- category/room cards
- series/catalog promotional section
- bestseller product cards
- product gallery images
- related products

### Acceptance criteria
- all landing page photos are reviewed and replaced where needed
- no obviously low-quality landing page imagery remains
- images remain performant and responsive

---

## 7. Product update: Electric Heating Element

### Requirement
Add a color/material range to the **Electric Heating Element** product.

### Current state note
The current live product appears to expose size-based selection only. The requested color/material range must be added without breaking current purchasability.

### Expected implementation
Support selectable options for:
- Color
- Material

Use proper Shopify product options/variants or the cleanest equivalent supported by the product structure.

### Rules
- do not break existing variant/product logic
- selected values must appear correctly on:
  - product page
  - cart
  - checkout/order data where supported
- option labels should be localizable

### Additional product-page cleanup requirements
The Electric Heating Element product page should also be reviewed for:
- duplicated or awkward FAQ content
- repeated question blocks
- overly long/unstructured overview text
- inconsistent or overly tall accordion spacing
- stale shipping snippets that mention free delivery

### Unknowns to resolve
If exact color/material values are not yet defined, mark as blocked input and implement once values are provided.

### Acceptance criteria
- Electric Heating Element supports color and material selection
- selections persist through cart/order flow
- labels/options can be translated where shown
- no stale free-shipping language remains on the product page

---

## 8. Mobile layout optimization

### Objective
Make the mobile storefront significantly more compact, more space-efficient, and more usable while preserving brand identity.

### Mandatory design principle
Mobile implementation must be **space greedy**:
- reduce wasted vertical space aggressively
- reduce oversized top/bottom padding
- reduce excessive gaps between sections
- reduce unnecessary whitespace inside cards
- reduce card height where possible
- make lists/grids denser without hurting readability
- keep key information visible earlier on screen

### UX priority rule
**UX is the highest priority.**
If a compact layout choice hurts readability, tap accuracy, comprehension, or shopping flow, adjust it until UX wins.

### Required changes
- reduce excessive spacing
- improve text readability
- verify responsive compatibility
- show **3 items per row** on mobile where appropriate
- resize text appropriately for mobile
- preserve existing visual branding

### "3 items per row" applies primarily to
- product grids
- collection grids
- featured product sections
- recommended/related product listings
- similar card-based item grids

### Do not force 3-per-row if it breaks UX
If a specific section becomes unreadable or unusable, preserve usability first and document any justified exception.

### Specific implementation expectations
- reduce section padding/margins wherever not needed
- reduce product card vertical height
- reduce oversized headings/subheadings on mobile
- keep text readable but not oversized
- tighten spacing between image, title, price, badges, and CTA
- avoid giant hero sections on mobile unless justified by UX
- ensure above-the-fold area shows as much useful content as possible
- minimize scroll depth for important content
- maintain proper tap target sizes despite compact layout

### Required mobile outcomes
- compact layout
- efficient use of viewport space
- strong readability
- no clutter
- no overlap
- no awkward empty gaps
- clear hierarchy
- fast scanning
- 3 items per row where appropriate
- brand identity preserved
- visually alive and effective design

### Acceptance criteria
- mobile screens show more useful content without feeling cramped
- spacing is intentionally tight and efficient
- the layout is clearly more compact than before
- relevant listing grids show 3 items per row on mobile
- UX is improved or unchanged, never worse
- no section feels bloated
- text remains readable
- no major responsive regressions on common mobile widths
- design still feels premium, branded, and visually alive

---

## 9. Homepage / landing page section requirements

### Current visible homepage sections to review
- announcement/value-prop bar
- hero
- shop by room
- design-series promotional section
- bestsellers
- guided finder
- FAQ
- newsletter
- footer

### Requirements by section

#### Announcement / trust bar
Current live content includes free delivery messaging and must be rewritten.

Required behavior:
- remove all free shipping claims
- keep compact
- keep high-value trust messaging
- use concise, scan-friendly items

Recommended replacement topics:
- paid shipping clarity
- secure checkout
- warranty
- engineering support

#### Hero section
- keep strong and visually alive
- reduce unnecessary height
- tighten copy block spacing
- preserve strong CTA visibility
- ensure hero does not consume excessive vertical space on mobile
- verify hero image quality

#### Shop by room / category section
- keep cards compact
- ensure cards remain easy to scan
- verify images are high quality
- ensure text labels are translated
- avoid excessive vertical gaps between heading, intro, and cards

#### Design-series promo section
- keep visual identity strong
- review copy for density and readability
- tighten layout spacing
- ensure mobile hierarchy remains strong
- avoid overly tall text/image stacking

#### Bestsellers section
- optimize product grid for compactness
- use 3-up mobile layout where viable
- keep essential information visible
- remove any conflicting shipping or delivery badges

#### Guided finder section
- keep guidance clear
- make cards tighter and more actionable
- reduce dead space
- ensure category cards remain readable in all translations

#### FAQ section
- rewrite any shipping answers that mention EU-wide delivery or free shipping
- keep accordion spacing compact
- eliminate duplicate or repetitive answers
- ensure FAQ remains easy to scan on mobile

#### Newsletter section
- keep concise
- reduce vertical footprint
- ensure labels, validation, and confirmation states are translated

### Acceptance criteria
- homepage contains no conflicting shipping/contact claims
- each section is reviewed for compactness and clarity
- homepage remains visually strong but uses space more efficiently

---

## 10. Contact page requirements

### Current visible contact page elements to preserve/improve
- email contact
- phone contact
- WhatsApp CTA
- help topics
- brief submission guidance

### Required updates
- replace phone number everywhere
- ensure WhatsApp opens correct number with German template
- tighten spacing throughout contact page
- keep response-time and support claims accurate
- preserve clear support pathways:
  - email
  - phone
  - WhatsApp

### Recommended additional improvements
- ensure CTA hierarchy is clear
- make contact methods easy to tap on mobile
- keep content concise and actionable
- avoid oversized icons/cards or wasted whitespace

### Acceptance criteria
- contact page is accurate, compact, and consistent with global rules
- all contact methods use the correct data
- no stale number remains

---

## 11. Shipping / returns / warranty page requirements

### Shipping page
Must be fully rewritten to align with:
- no free shipping
- 20 EUR per product
- delivery only to Spain, Germany, Netherlands

Also ensure:
- no legacy country list remains
- no EU-wide claims remain
- if delivery times are kept, ensure they are accurate and consistent
- contact details on the page use updated number/email if shown

### Returns page
Review for consistency with the new shipping rules.

Keep or confirm:
- return conditions
- return shipping responsibility
- contact pathways

Also:
- ensure no free-delivery references remain indirectly
- ensure compact formatting and readable hierarchy

### Warranty page
Review for:
- compactness
- contact consistency
- no stale phone/contact data
- translation readiness

### Acceptance criteria
- policy/information pages are fully aligned with the new business rules
- no contradictions exist between policy pages and storefront messaging

---

## 12. Product page global requirements

### Apply to all product pages
Review all product templates/components for:
- stale free-shipping messages
- outdated help/contact number
- oversized spacing
- accordion bloat
- repeated FAQ content
- excessive page height
- low-quality product media
- weak mobile compactness

### Product page help/contact block
If a “Need help?” or engineer-support block exists:
- replace phone/contact data
- ensure WhatsApp behavior follows global rule
- keep CTA strong and compact

### Product page shipping/returns snippet
If a short shipping snippet exists on product pages:
- it must match the new shipping rules exactly
- remove all free-shipping phrasing

### Acceptance criteria
- product pages are consistent with global shipping/contact requirements
- product pages are compact and mobile-optimized
- no contradictory snippets remain

---

## 13. Non-functional requirements

### Global UX rule
**UX is the top priority in every implementation decision.**

The coding agent must not optimize for:
- aesthetic preference alone
- excessive whitespace
- visual breathing room beyond what usability requires
- decorative spacing that pushes content down unnecessarily

### Global layout rule
The storefront must be **compact by default**.

Interpret this as:
- every component should justify the space it consumes
- remove dead space wherever possible
- prefer tighter, cleaner spacing systems
- avoid large empty wrappers and oversized containers
- optimize for efficient scanning and shopping flow

### Visual quality rule
Compact does not mean boring.

The storefront should remain:
- premium
- energetic
- modern
- readable
- conversion-friendly
- clearly branded

### Maintainability
- prefer centralized config for contact data, shipping constants, and reusable CTA logic
- avoid hardcoding the same value in multiple places where possible
- keep implementation compatible with Shopify theme architecture

### Stability
- preserve desktop layout
- avoid breaking translations
- avoid regressions in cart/checkout flow
- keep changes scoped and clean

### Performance
- optimize replacement images
- do not significantly worsen mobile performance

### Implementation bias
When multiple implementation options are valid, prefer the one that:
- uses less space
- improves scanability
- preserves or improves UX
- preserves style and brand energy
- reduces unnecessary scrolling

---

## 14. Recommended implementation approach

### Contact / WhatsApp
- create one reusable contact config/source
- create one reusable WhatsApp helper/snippet for number + German prefilled message
- replace all legacy references

### Localization
- use Shopify-native or Shopify-compatible translation architecture
- ensure translatable theme strings and product content
- verify language selector and translated routes/content rendering

### Shipping
- configure shipping so cost scales by quantity
- remove all free-shipping messaging and logic
- restrict allowed shipping countries
- update FAQ, policy pages, and product snippets accordingly

### Reviews
- implement using existing Shopify/app automation if available
- if exact delivery trigger depends on installed apps, document final trigger used

### Product options
- add Color and Material safely for Electric Heating Element
- ensure storefront and order metadata display correctly

### Layout / styling bias
For all sections and components, review and optimize:
- padding
- margin
- line-height
- font size scaling
- card height
- section height
- image ratio usage
- grid density
- CTA placement
- content stacking

### Component-level compactness
Apply compactness especially to:
- hero sections
- announcement bars
- headers
- product cards
- collection grids
- featured product sections
- icon/text blocks
- FAQ accordions
- contact sections
- footers
- popup/modal spacing
- policy page templates

### Rule for preserving style
While tightening layouts:
- keep hierarchy clear
- keep CTA visibility strong
- keep imagery impactful
- keep typography intentional
- avoid making the design feel compressed or lifeless

### Mobile
- adjust grid CSS and card sizing first
- then tune type scale and spacing
- test multiple common mobile widths

---

## 15. QA checklist

### Contact
- [ ] all phone/contact references changed to `+49 172 608 88 48`
- [ ] all `tel:` links updated
- [ ] all WhatsApp links use correct number
- [ ] old number fully removed from homepage, contact page, policy pages, product pages, footer, and translated versions

### WhatsApp
- [ ] all WhatsApp prefilled messages are in German
- [ ] message stays German on every language storefront

### Localization
- [ ] German available
- [ ] Turkish available
- [ ] Spanish available
- [ ] Dutch available
- [ ] Polish available
- [ ] Danish available
- [ ] Italian available
- [ ] Hungarian available
- [ ] homepage translated
- [ ] product pages translated
- [ ] navigation/footer translated
- [ ] FAQ translated
- [ ] policy pages translated if in scope
- [ ] no major English leftovers

### Shipping
- [ ] no free shipping exists anywhere
- [ ] shipping = `20 EUR x quantity`
- [ ] only Spain/Germany/Netherlands allowed for delivery
- [ ] no free-shipping banners/messages remain
- [ ] homepage shipping claims updated
- [ ] FAQ shipping answers updated
- [ ] shipping policy page updated
- [ ] product shipping snippets updated

### Reviews
- [ ] review request sends 14 days after delivery or documented fallback event
- [ ] no duplicates
- [ ] cancelled orders excluded

### Images
- [ ] landing page images upgraded/replaced where low quality
- [ ] category/section images reviewed
- [ ] images are responsive and optimized

### Product
- [ ] Electric Heating Element has color/material selection
- [ ] selections appear correctly in cart/order flow
- [ ] no stale free-shipping language remains on the product page
- [ ] no duplicated FAQ/repetitive content remains on the product page

### Compactness
- [ ] layout uses space efficiently
- [ ] unnecessary whitespace removed
- [ ] sections are not taller than needed
- [ ] cards are compact and information-dense
- [ ] important content appears earlier on screen
- [ ] scrolling effort is reduced where possible

### UX
- [ ] UX improved or preserved in every changed area
- [ ] readability remains strong
- [ ] tap targets remain usable
- [ ] no cramped or cluttered layouts
- [ ] hierarchy remains clear
- [ ] compactness never harms shopping flow

### Mobile
- [ ] mobile layout is more compact
- [ ] 3 items per row on relevant mobile grids
- [ ] text is readable
- [ ] no major mobile layout breakage
- [ ] brand identity preserved

### Style
- [ ] design still feels alive
- [ ] design still feels effective
- [ ] brand identity remains intact
- [ ] compactness did not make the storefront feel dull or generic

---

## 16. Assumptions

Unless clarified otherwise, use these assumptions:
1. `20 EUR per product` means **per unit quantity in cart**
2. review request timing is **14 days after delivery**, with fallback to the closest reliable fulfillment/delivery event if necessary
3. exact color/material values for Electric Heating Element may need to be supplied separately
4. high-quality image replacements should come from approved client/brand assets if available
5. 3-column mobile layout applies mainly to product/listing grids, not every block on the site

---

## 17. Deliverables expected from implementation

- updated Shopify theme/config with all contact changes
- working WhatsApp CTA behavior
- multilingual storefront for all requested languages
- shipping restrictions and pricing logic in place
- homepage copy and policy pages aligned with new shipping rules
- review email automation configured
- upgraded landing page imagery
- Electric Heating Element option updates
- compact mobile layout improvements
- short implementation notes documenting:
  - where contact data is centralized
  - how WhatsApp links are generated
  - how shipping pricing/restrictions were implemented
  - what trigger is used for review emails
  - which homepage/policy/product snippets were updated
  - any blocked items or assumptions used