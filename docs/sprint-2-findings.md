# Sprint 2 findings

Bugs surfaced by the first real sync runs + notes for S2.3/S3.

## Fixed in this sprint

1. **`agent/sync/env.ts` defaulted to `.env` instead of `.env.local`.** `import 'dotenv/config'` reads `.env`; our secrets live in `.env.local` per project convention. Replaced with explicit `dotenvConfig({ path: resolve(REPO_ROOT, '.env.local') })`.
2. **`productCreateMedia` received a File GID as `originalSource` — invalid input type.** The Shopify Admin API expects a URL (external or Shopify resource URL) there. Fixed by adding a `resolveImageUrl(fileGid)` helper that polls the MediaImage until `fileStatus: READY` and returns the CDN URL; `attachImages` now passes that URL. Manifest cache entries created before the fix are back-filled lazily on first reuse. `productCreateMedia.mediaUserErrors` is now checked and surfaced — previously discarded.
3. **`productUpdate` in 2026-04 rejects `productOptions` (`product_options cannot be specified during update`).** Split the write helper into `buildCreateInput` (with options) and `buildUpdateInput` (without). Variant option editing on existing products now requires `productOptionUpdate` / `productVariantsBulkCreate` — deferred to S3 since our current CREATE-only flow covers the common case.
4. **Gemini safety refusals crashed the whole product.** When Gemini returns a text-only response instead of inline image (rare, happened once across 16 attempts in this sprint), `extractImageFromResponse` threw and `regenerateImagesForProduct` aborted, creating products with zero images. Now wrapped in try/catch per image — failures log a warning and the product proceeds with the images that did succeed.
5. **Collection-handle mismatch xxl → ours.** xxl drops umlauts entirely (`wohnraumheizkorper`); we use ae/oe/ue substitution (`wohnraumheizkoerper`). Assignment silently dropped radiator products into `frontpage` instead. Added `agent/sync/collection-map.ts` with an explicit xxl→ours mapping. Handles not in the map (e.g. `frontpage`, `bestseller`) are dropped.

## Open — fix before scaling sync beyond 3 products

6. **[FIXED in sprint]** `attachImages` was additive on UPDATE. Implemented option (a): `applyUpdate` in [agent/sync/write.ts](../agent/sync/write.ts) now queries `product.media(first:1)` before attaching; if any media exists, the attach is skipped. Merchants who want a clean refresh delete all product media manually, then re-sync. The 30 stale duplicates from the first runs were cleaned via a one-off `productDeleteMedia` pass; final image counts are now 5/5/6 matching xxl source counts.
7. **Cold-run handle collision leftovers.** The first botched run created products with the bare xxl handle (`konrad-ventilheizkorper-typ-33`). Subsequent runs see the existing handle, `normalize.ts` appends `-gberg`, the diff classifies as UPDATE against the original GID but tries to rename handle → productUpdate rejects or quietly rolls back. Resulting state: store handle stays `konrad-...`, normalized handle is `konrad-...-gberg`, and the diff-log shows the normalized handle while the actual product keeps the original. Confusing. Fix: either drop handle from `buildUpdateInput` or do an explicit `handleRedirect` step. Low priority — only affects readability of the diff log, not functional.
8. **`frontpage` lingering on konrad-typ-33.** Got assigned during the first botched run. Not removed by subsequent syncs because the product-to-collection assignment is additive (we only call `collectionAddProducts`, never `collectionRemoveProducts`). Cleanup via Admin UI or a one-off script. Worth adding `collectionReconcile` to Sprint 3 if we expect the upstream taxonomy to churn.

## Observations, not bugs

9. **xxl catalog size**: `totalsFromXxl = 55` products total. Well within scope for weekly syncs at any limit.
10. **No top-level `heizkorper` parent on xxl.** They only expose the 4 sub-collections. Our `heizkoerper` stays as a menu-only aggregate with no product assignments — fine, it's a navigation header.
11. **Per-variant prices, delivery_contents, FAQ, spec metafields are not yet wired.** Normalize only populates title/body/vendor/tags/options/variants and assigns to collections + sync keys. The custom metafields (delivery_contents, faqs, wattage, width/height_cm, ral_color, connection_type, grundpreis_*) need field mapping from xxl's `body_html` parsing or metafields-in-body — S3 scope.

## Discovered during S2.1c (PDP inspection)

12. **[FIXED]** Products created by sync were not published to the Online Store / Shop channels. `productCreate` in the 2026-04 Admin API leaves a product in status=ACTIVE but unpublished to every sales channel — accessing the PDP on the storefront returns 404. Added `publishProduct(gid)` helper in [agent/sync/write.ts](../agent/sync/write.ts): fetches `publications(first:20)`, filters to `Online Store` + `Shop`, and calls `publishablePublish` at the tail of `applyCreate`. Publication IDs are cached per process. The 3 products from this sprint were back-filled with a one-off curl.
13. **[FIXED]** First `shopify theme push` landed only 3 assets on the target theme (config/settings_schema.json, layout/password.liquid, layout/theme.liquid). The CLI was run from the repo root rather than from inside `theme/`, triggered the warning `It doesn't seem like you're running this command in a theme directory`, and silently uploaded a near-empty shell. Storefront returned 404 for every path. Re-pushed from `cd theme && shopify theme push --theme=<id>` — now 364 assets, Havn was 362. Remediation: document the correct invocation path in [README.md](../README.md) (already shows `cd theme` pattern — reinforce in agent playbook for future sessions).

## Lighthouse baseline (one PDP, throttled mobile)

Target: ≥95 on all four categories. Captured at [lighthouse-reports/2026-04-24T08-08-products-konrad-ventilheizkorper-typ-33.{json,html}](../lighthouse-reports/).

| Category | Score | Target | Top offender |
|---|---|---|---|
| Performance | 74 | ≥95 | **LCP 6.5s** (score 0.09, weight 25) — hero/largest image not preloaded or oversized. FCP 2.2s (0.78). |
| Accessibility | 92 | ≥95 | `label` (w=10, score 0): a form input is missing an associated label. `color-contrast` (w=7, score 0): one text/bg pair below WCAG AA. |
| Best Practices | 77 | ≥95 | `third-party-cookies` (Shopify-infra — hard to remove). `inspector-issues` (minor console logs). |
| SEO | 100 | ≥95 | ✓ |

Core Web Vitals: FCP 2.2s · **LCP 6.5s** · TBT 10ms · CLS 0 · SI 3.3s · TTI 6.7s.

**LCP is the single biggest win.** Likely causes: Gemini-generated PNGs are not WebP/AVIF (Shopify CDN will transcode but initial fetch still large); the PDP gallery's first image isn't `loading="eager" fetchpriority="high"`; `img` tags likely don't have explicit `width`/`height` for the largest image, forcing browser reflow. Action in S2.3 or S3: audit the Dawn `product-media` snippet, add `fetchpriority="high"` to the first gallery image, ensure width/height attrs, and consider shrinking the master PNG to a reasonable max dimension on upload in [agent/sync/images.ts](../agent/sync/images.ts) (Gemini returns ~1024px — fine, but check for any that ship larger).

Accessibility fixes are small — grep the rendered PDP HTML for unlabeled `input`s and adjust the culprit section's Liquid; identify the failing contrast pair with the Chrome axe extension in the HTML report.

## Discovered during S2.4 cleanup

14. **[FIXED]** `registerEnglishTitle` registered EN translations into an EN-default store — a no-op. Replaced with `registerGermanTranslation(titleDe, bodyHtmlDe)` in [agent/sync/write.ts](../agent/sync/write.ts) that writes DE against the source digests for both title and body_html. Called on both `applyCreate` and `applyUpdate`. Back-filled all 25 products by re-running sync (0 Gemini spend — image guard kicks in).
15. **[FIXED]** `translate.ts` handed Claude empty strings when xxl products had no body_html and stored the conversational refusal (`"I'd be happy to help translate..."`) as the EN description. 3 products contaminated before detection; scanned for poisoned prefixes (`I'd be happy to help`, `I'd need the`, `I apologize`, `I cannot`, etc.), wiped their `descriptionHtml`, and purged 1 stale cache entry. Fix: `translateProduct` now short-circuits empty inputs to empty outputs without calling Claude.
16. **[FIXED]** Stray `frontpage` collection assignment on `konrad-ventilheizkorper-typ-33` from the first botched sync — removed via `collectionRemoveProducts`.

## Discovered during user review (visual QA)

17. **Image generation quality issues — PAUSED.** User review flagged three problems with the Gemini-generated product images:
   - **Inconsistent dimensions.** Images in the same PLP row don't line up — some taller, some shorter. `gemini-2.5-flash-image` doesn't honour the source image's aspect ratio unless explicitly instructed, so the output dimensions wander.
   - **Object hallucinations.** One image showed "a bottle hanging as if a heater" — the model misinterpreted the radiator silhouette. Lifestyle-context prompting makes this worse because the scene distracts from the product.
   - **Low variety.** Rooms look "almost the same" — the single prompt template produces near-identical bathrooms/living rooms regardless of product type.

   Immediate action: **pipeline paused** via `SYNC_SKIP_IMAGES=1` in `.env.local`. Existing 25 products keep their current images; future sync runs (text + metafields + collections + translations) proceed normally without generating new images.

   Remediation plan for Sprint 3:
   - **Pin aspect ratio and dimensions** — pass `aspectRatio: "1:1"` and `imageSize: "1K"` to the Gemini API so every output is a uniform square (matches Shopify's default product card shape).
   - **Product-aware prompt** — include `product.title`, `product.product_type`, and xxl's `tags` in the prompt. Example skeleton: *"Photorealistic product photograph of a {product_type} ({title}). Preserve the exact shape, proportions, finish, and hardware of the radiator shown in the input image. {context_for_type}. Square frame."* where `context_for_type` branches per product_type (bathroom radiators → tiled bathroom wall; living-room radiators → painted interior wall; accessories → clean white catalog background; toilets → tiled bathroom; pipes → flat grey catalog background).
   - **Negative prompt** — "no people, no text, no logos, no glass bottles, no plants, no furniture covering the product, no abstract art".
   - **Validation pass** — after generation, pipe the result through Gemini's vision API with a question like *"Does this image contain a {product_type}? Answer yes or no."* If no, retry with a simpler catalog-style prompt; if still no after 2 retries, skip that image and log an error in the sync report.
   - **Style consistency** — consider freezing seed / using the same style token across the catalog so products feel like one photoshoot, not twenty different rooms.

18. **Red/white brand signal too subtle — FIXED.** The `#C8102E` palette is correct on the live theme (verified via `/admin/api/.../assets?asset[key]=config/settings_data.json`) but every homepage section was defaulting to white-bg schemes; the only red pixels were on buttons + sale badges. Changes in `theme/templates/index.json`:
   - `usp-strip` section: `scheme-2` → `scheme-4` (red bg, white text — appears just below the hero for immediate brand recognition).
   - `trust-badges` section: `scheme-1` → `scheme-5` (dark-red bg, white text — anchors the "Why choose G-Berg" strip).
   Merchant can still override per-section in Theme Editor; the red-by-default palette is now visible above the fold.

19. **WhatsApp chat bubble hidden — code-side works, config needed.** The `whatsapp-bubble.liquid` snippet is rendered in `theme/layout/theme.liquid:376` and gated by `settings.whatsapp_enabled && settings.whatsapp_phone != blank`. Schema default: `enabled=true, label="Chat with us", prefill="Hi! I have a question about your heaters."`. But `whatsapp_phone` is blank on the live theme — merchant has not set it. **User action:** Admin → Online Store → Themes → G-Berg → Customize → Theme settings → WhatsApp chat bubble → fill in Phone number (international format, digits only, e.g. `491701234567`). Bubble appears immediately after save, no redeploy needed. We deliberately do NOT seed a placeholder number because a wrong digit would open a chat to a real stranger.

## Discovered during client-demo prep

20. **[FIXED]** `collectionCreate` doesn't auto-publish to the Online Store sales channel in 2026-04 — same pattern as `productCreate` (see §12). 10 of 11 seeded collections had empty `resourcePublicationsV2`, causing the storefront to treat them as blank and Dawn's `card-collection` / `featured-collection` sections to render the onboarding placeholder state (t-shirt SVGs, "Your collection's name", "Example product title €19,99"). The one collection that rendered correctly on the homepage (`zubehoer`) pre-dated Phase B and had been published by an earlier era. Fix: added `publishToStorefront(collectionGid)` helper in [agent/scripts/seed-collections.mjs](../agent/scripts/seed-collections.mjs), called on both CREATE and UPDATE paths (mirrors the `publishProduct` helper in [agent/sync/write.ts](../agent/sync/write.ts)). Back-filled all 11 existing collections via a one-off `publishablePublish` loop.

21. **[FIXED]** Card-product had no "image-less product" render branch. Dawn's `card-product.liquid` `if card_product.featured_media` closed without an `else`, so synced text-only products rendered a bare text card (no image slot) on PLPs and related-products — visually worse than Dawn's t-shirt onboarding placeholder. Added a G-Berg-branded inline SVG placeholder in a new [theme/snippets/gberg-product-placeholder.liquid](../theme/snippets/gberg-product-placeholder.liquid) (radiator silhouette + wordmark + translatable caption via `products.placeholder.caption` locale key). Wired in both the main card render and the quick-add modal branch. Zero image-API cost; renders for any future image-less product automatically.

## Discovered during bilingual verification

22. **[FIXED]** Metaobject fields weren't translatable, even though `translationsRegister` returned no errors. All 5 metaobject definitions (`trust_badge`, `usp_item`, `testimonial`, `faq_item`, `spec_section`) were created without the `capabilities.translatable` flag. Shopify silently accepts `translationsRegister` for non-translatable fields but never surfaces the translations on locale-switched storefronts. Spotted by querying `translatableResource.translatableContent` (empty) vs what I had registered (reported no errors). Enabled via `metaobjectDefinitionUpdate(capabilities: { translatable: { enabled: true } })` on all 5 definitions, baked the same capability into [agent/scripts/create-metaobjects.mjs](../agent/scripts/create-metaobjects.mjs) for future re-runs.

23. **[FIXED]** Seed scripts wrote German as primary values. Original seed seeded trust_badge / usp_item / testimonial / faq_item metaobjects with DE strings as primary, which made EN-locale visitors see German everywhere because no EN translation was registered. Conflicts with CLAUDE.md principle "English is the source of truth." Rewrote [agent/scripts/seed-sample-data.mjs](../agent/scripts/seed-sample-data.mjs) with `{ en: { … }, de: { … } }` per entry and added a `registerGermanFields(gid, deFields)` helper that resolves source digests via `translatableResource.translatableContent` and calls `translationsRegister`. Applied to 4 trust badges, 4 USP items, 4 testimonials (role + quote), 5 FAQs (question + answer + category).

24. **[FIXED]** Menus inherited the same EN/DE swap problem. Main menu and footer menu items were stored with German titles. Rewrote both via `menuUpdate` with EN titles as primary and registered DE translations per menu item via `translationsRegister`. 13 items total (6 main-nav top-level + 7 nested children + 7 footer links).

## Raw sprint cost

- First real sync (broken writer): generated 10 of 16 images before aborting. ~$0.40.
- Second real sync (writer fixed): generated 3 new + used 10 cached. ~$0.12.
- Third real sync (collection-map): all cached. $0.
- **Total spent on Gemini this sprint: ~$0.52.**
