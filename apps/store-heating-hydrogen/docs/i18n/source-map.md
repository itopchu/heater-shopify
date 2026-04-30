# i18n Source Map

Every key in `app/locales/en.json` mapped back to the JSX site that
currently hard-codes the English string. The next phase (JSX rewiring)
walks this list to replace each literal with `t('namespace.key')`.

Paths are relative to `apps/store-heating-hydrogen/`. Line numbers are
the line on which the literal appears at the time of audit
(2026-04-30) — they may drift if the SEO Phase 1 agent reformats the
file. The keys themselves are stable.

## common

| key | file:line |
| --- | --- |
| common.skip_to_content | app/root.tsx:175 |
| common.error | app/root.tsx:233 |
| common.error_generic | app/root.tsx:236 |
| common.unknown_error | app/root.tsx:220 |
| common.close | app/components/Aside.tsx:67, app/components/gberg/nav/mobile-drawer.tsx:71, app/components/gberg/search/search-overlay.tsx:49,65, app/components/gberg/plp/collection-view.tsx:695, app/components/gberg/pdp/gallery.tsx:210,213 |
| common.loading | app/components/PaginatedResourceSection.tsx:29,49, app/components/SearchResults.tsx:138,147, app/components/PageLayout.tsx:62,101 |
| common.search | app/components/Header.tsx:135, app/components/PageLayout.tsx:86,91, app/components/gberg/search/search-overlay.tsx:37, app/components/SearchForm.tsx (placeholder) |
| common.go | app/components/gberg/search/search-input.tsx:145 |
| common.clear | app/components/gberg/search/search-input.tsx:138 |
| common.apply | app/components/CartSummary.tsx:111,242 |
| common.remove | app/components/CartSummary.tsx:90,295, app/components/CartLineItem.tsx:161 |
| common.browse_all | app/components/gberg/nav/mega-menu.tsx:128, app/components/gberg/nav/mobile-drawer.tsx:105 |
| common.shop_all | app/components/gberg/nav/mega-menu.tsx:25, app/components/gberg/header.tsx:60 |
| common.no_image | app/components/gberg/product-card.tsx:147 |
| common.yes | app/routes/($locale).products.$handle.tsx:343,348 |
| common.no | app/routes/($locale).products.$handle.tsx:343,348 |

## header

| key | file:line |
| --- | --- |
| header.cart | app/components/gberg/header.tsx:29 (CartCount), app/components/Header.tsx:157, app/components/gberg/nav/mobile-drawer.tsx:147, app/components/CartMain.tsx:84,199, app/components/PageLayout.tsx:60 (heading) |
| header.account | app/components/Header.tsx:108 |
| header.sign_in | app/components/Header.tsx:106,107,108 |
| header.menu | app/components/PageLayout.tsx:164 (heading), app/components/gberg/nav/mobile-drawer.tsx:36 (open menu aria) |
| header.open_menu | app/components/gberg/nav/mobile-drawer.tsx:37 |
| header.close_menu | app/components/gberg/nav/mobile-drawer.tsx:71 |
| header.open_search | app/components/gberg/search/search-overlay.tsx:30 |
| header.close_search | app/components/gberg/search/search-overlay.tsx:49,65 |
| header.search_catalogue | app/components/gberg/search/search-overlay.tsx:57 |
| header.cart_aria | app/components/gberg/header.tsx:84 |
| header.home | app/components/Header.tsx:67 |
| header.main_nav | app/components/gberg/nav/mega-menu.tsx:103 |
| header.mobile_nav | app/components/gberg/nav/mobile-drawer.tsx:61,83 |
| header.quick_links | app/components/gberg/nav/mobile-drawer.tsx:137 |
| header.contact | app/components/gberg/nav/mobile-drawer.tsx:155 |

## utility_bar

| key | file:line |
| --- | --- |
| utility_bar.free_eu_delivery | app/components/gberg/utility-bar.tsx:59, app/routes/($locale)._index.tsx:69 |
| utility_bar.warranty_10y | app/components/gberg/utility-bar.tsx:60 |
| utility_bar.returns_30d | app/components/gberg/utility-bar.tsx:61, app/routes/($locale)._index.tsx:70 |
| utility_bar.secure_checkout | app/components/gberg/utility-bar.tsx:62 |
| utility_bar.need_help_phone | app/components/gberg/utility-bar.tsx:72 |

## language_switcher

| key | file:line |
| --- | --- |
| language_switcher.aria_label | app/components/gberg/language-switcher.tsx:38 |
| language_switcher.choose_language | app/components/gberg/language-switcher.tsx:47 |

## nav

| key | file:line |
| --- | --- |
| nav.shop_all | app/components/gberg/nav/mega-menu.tsx:25, app/components/gberg/header.tsx:60 |
| nav.living_rooms | app/components/gberg/nav/mega-menu.tsx:26, app/routes/($locale)._index.tsx:37, app/components/CartMain.tsx:11 |
| nav.bathroom | app/components/gberg/nav/mega-menu.tsx:27, app/routes/($locale)._index.tsx:38, app/components/CartMain.tsx:12 |
| nav.electric | app/components/gberg/nav/mega-menu.tsx:28, app/routes/($locale)._index.tsx:39, app/components/CartMain.tsx:13 |
| nav.replacement | app/components/gberg/nav/mega-menu.tsx:29, app/routes/($locale)._index.tsx:40, app/components/CartMain.tsx:14 |
| nav.underfloor | app/routes/($locale)._index.tsx:41, app/components/CartMain.tsx:15 |
| nav.accessories | app/components/gberg/nav/mega-menu.tsx:30, app/routes/($locale)._index.tsx:42, app/components/CartMain.tsx:16 |
| nav.engineered_tagline | app/components/gberg/nav/mega-menu.tsx:146 |

## footer

| key | file:line |
| --- | --- |
| footer.stay_in_loop | app/components/gberg/footer.tsx:32, app/routes/($locale).blogs._index.tsx:135 |
| footer.newsletter_promise | app/components/gberg/footer.tsx:35 |
| footer.brand_blurb | app/components/gberg/footer.tsx:48 |
| footer.legal_entity | app/components/gberg/footer.tsx:51 |
| footer.col_customer_service | app/components/gberg/footer.tsx:54 |
| footer.col_shipping_returns | app/components/gberg/footer.tsx:55 |
| footer.col_legal | app/components/gberg/footer.tsx:56 |
| footer.contact | app/components/gberg/footer.tsx:11 |
| footer.faq | app/components/gberg/footer.tsx:12 |
| footer.engineering_support | app/components/gberg/footer.tsx:13, app/routes/($locale)._index.tsx:71 |
| footer.shipping | app/components/gberg/footer.tsx:15 |
| footer.returns | app/components/gberg/footer.tsx:16 |
| footer.warranty | app/components/gberg/footer.tsx:17 |
| footer.imprint | app/components/gberg/footer.tsx:20 |
| footer.privacy | app/components/gberg/footer.tsx:21 |
| footer.terms | app/components/gberg/footer.tsx:22 |
| footer.copyright | app/components/gberg/footer.tsx:63 |
| footer.vat_note | app/components/gberg/footer.tsx:64 |

## newsletter

| key | file:line |
| --- | --- |
| newsletter.email_label | app/components/gberg/newsletter-form.tsx:35 |
| newsletter.email_placeholder | app/components/gberg/newsletter-form.tsx:42 |
| newsletter.subscribe | app/components/gberg/newsletter-form.tsx:54 |
| newsletter.subscribed_thanks | app/components/gberg/newsletter-form.tsx:54 |
| newsletter.first_guide_promise | app/routes/($locale).blogs._index.tsx:137 |

## whatsapp

| key | file:line |
| --- | --- |
| whatsapp.aria_label | app/components/gberg/whatsapp-bubble.tsx:21 |
| whatsapp.default_message | app/components/gberg/whatsapp-bubble.tsx:9 |

## home

| key | file:line |
| --- | --- |
| home.meta_title | app/routes/($locale)._index.tsx:21 |
| home.meta_description | app/routes/($locale)._index.tsx:22 |
| home.hero_eyebrow | app/routes/($locale)._index.tsx:156 |
| home.hero_title_line1 | app/routes/($locale)._index.tsx:159 |
| home.hero_title_line2 | app/routes/($locale)._index.tsx:161 |
| home.hero_lede | app/routes/($locale)._index.tsx:163-166 |
| home.hero_cta_shop | app/routes/($locale)._index.tsx:169 |
| home.hero_cta_bathroom | app/routes/($locale)._index.tsx:173 |
| home.hero_image_alt | app/routes/($locale)._index.tsx:182 |
| home.shop_by_room_eyebrow | app/routes/($locale)._index.tsx:206 |
| home.shop_by_room_title | app/routes/($locale)._index.tsx:208-212 |
| home.shop_by_room_yours | app/routes/($locale)._index.tsx:210 |
| home.shop_by_room_description | app/routes/($locale)._index.tsx:214 |
| home.designed_in_germany_eyebrow | app/routes/($locale)._index.tsx:283 |
| home.designed_in_germany_title | app/routes/($locale)._index.tsx:284-289 |
| home.designed_in_germany_lede | app/routes/($locale)._index.tsx:291 |
| home.browse_catalog_cta | app/routes/($locale)._index.tsx:299 |
| home.bestsellers_eyebrow | app/routes/($locale)._index.tsx:312 |
| home.bestsellers_title | app/routes/($locale)._index.tsx:314-321 |
| home.bestsellers_empty | app/routes/($locale)._index.tsx:328 |
| home.guided_finder_eyebrow | app/routes/($locale)._index.tsx:338 |
| home.guided_finder_title | app/routes/($locale)._index.tsx:338 |
| home.guided_finder_replace_label | app/routes/($locale)._index.tsx:48 |
| home.guided_finder_replace_desc | app/routes/($locale)._index.tsx:49 |
| home.guided_finder_living_label | app/routes/($locale)._index.tsx:53 |
| home.guided_finder_living_desc | app/routes/($locale)._index.tsx:54 |
| home.guided_finder_bathroom_label | app/routes/($locale)._index.tsx:58 |
| home.guided_finder_bathroom_desc | app/routes/($locale)._index.tsx:59 |
| home.guided_finder_electric_label | app/routes/($locale)._index.tsx:63 |
| home.guided_finder_electric_desc | app/routes/($locale)._index.tsx:64 |
| home.guided_finder_start | app/routes/($locale)._index.tsx:351 |
| home.faq_eyebrow | app/routes/($locale)._index.tsx:380 |
| home.faq_title | app/routes/($locale)._index.tsx:380 |
| home.faq_q1 | app/routes/($locale)._index.tsx:77 |
| home.faq_a1 | app/routes/($locale)._index.tsx:78 |
| home.faq_q2 | app/routes/($locale)._index.tsx:82 |
| home.faq_a2 | app/routes/($locale)._index.tsx:83 |
| home.faq_q3 | app/routes/($locale)._index.tsx:87 |
| home.faq_a3 | app/routes/($locale)._index.tsx:88 |
| home.why_us_delivery | app/routes/($locale)._index.tsx:69 |
| home.why_us_returns | app/routes/($locale)._index.tsx:70 |
| home.why_us_engineering | app/routes/($locale)._index.tsx:71 |
| home.why_us_warranty | app/routes/($locale)._index.tsx:72 |
| home.hero_image_fallback | app/routes/($locale)._index.tsx:193 |
| home.editorial_image_fallback | app/routes/($locale)._index.tsx:279 |

## pdp

| key | file:line |
| --- | --- |
| pdp.add_to_cart | app/components/gberg/pdp/add-to-cart.tsx:80, app/components/gberg/pdp/buy-box.tsx:134, app/components/ProductForm.tsx:121, app/components/CartMain.tsx:189 |
| pdp.added | app/components/gberg/pdp/add-to-cart.tsx:80, app/components/gberg/pdp/buy-box.tsx:134 |
| pdp.out_of_stock | app/components/gberg/pdp/add-to-cart.tsx:80 |
| pdp.sold_out | app/components/gberg/pdp/buy-box.tsx:134, app/components/ProductForm.tsx:121, app/components/gberg/pdp/variant-selector.tsx:162 |
| pdp.quantity | app/components/gberg/pdp/add-to-cart.tsx:30 |
| pdp.decrease_quantity | app/components/gberg/pdp/add-to-cart.tsx:33, app/components/CartLineItem.tsx:117 |
| pdp.increase_quantity | app/components/gberg/pdp/add-to-cart.tsx:45, app/components/CartLineItem.tsx:127 |
| pdp.buy_bar_aria | app/components/gberg/pdp/buy-box.tsx:102 |
| pdp.price_vat_note | app/components/gberg/pdp/price-block.tsx:57, app/routes/($locale).products.$handle.tsx:290 |
| pdp.delivery_returns_heading | app/routes/($locale).products.$handle.tsx:288 |
| pdp.delivery_returns_body | app/routes/($locale).products.$handle.tsx:290 |
| pdp.need_help_heading | app/routes/($locale).products.$handle.tsx:294 |
| pdp.need_help_body | app/routes/($locale).products.$handle.tsx:295 |
| pdp.dispatch_default | app/routes/($locale).products.$handle.tsx:139 |
| pdp.fallback_eyebrow_radiator | app/routes/($locale).products.$handle.tsx:144 |
| pdp.section_overview | app/routes/($locale).products.$handle.tsx:407 |
| pdp.section_specs_eyebrow | app/routes/($locale).products.$handle.tsx:253 |
| pdp.section_specs_title | app/routes/($locale).products.$handle.tsx:254 |
| pdp.section_about_eyebrow | app/routes/($locale).products.$handle.tsx:265 |
| pdp.section_about_title | app/routes/($locale).products.$handle.tsx:266 |
| pdp.section_faq_eyebrow | app/routes/($locale).products.$handle.tsx:277 |
| pdp.section_faq_title | app/routes/($locale).products.$handle.tsx:278 |
| pdp.related_eyebrow | app/routes/($locale).products.$handle.tsx:307 |
| pdp.related_title | app/routes/($locale).products.$handle.tsx:308 |
| pdp.product_overview | app/components/gberg/pdp/ai-block.tsx:25,28 |
| pdp.key_facts | app/components/gberg/pdp/ai-block.tsx:35 |
| pdp.compatibility | app/components/gberg/pdp/ai-block.tsx:53 |
| pdp.most_asked | app/components/gberg/pdp/ai-block.tsx:61 |
| pdp.also_available_in | app/components/gberg/pdp/sibling-colors.tsx:30 |
| pdp.documents_label | app/components/gberg/pdp/documents.tsx:19,29 |
| pdp.documents_title | app/components/gberg/pdp/documents.tsx:21,31 |
| pdp.documents_empty | app/components/gberg/pdp/documents.tsx:23 |
| pdp.documents_download | app/components/gberg/pdp/documents.tsx:42 |
| pdp.documents_pending_label | app/components/gberg/pdp/documents.tsx:49 |
| pdp.documents_pending_text | app/components/gberg/pdp/documents.tsx:52 |
| pdp.specs_caption | app/components/gberg/pdp/quick-facts.tsx:54 |
| pdp.translation_pending_de | app/components/gberg/pdp/sections-accordion.tsx:18-20 |
| pdp.section_fallback | app/components/gberg/pdp/sections-accordion.tsx:30 |
| pdp.gallery_open | app/components/gberg/pdp/gallery.tsx:63 |
| pdp.gallery_view_more | app/components/gberg/pdp/gallery.tsx:108,128 |
| pdp.gallery_show_image | app/components/gberg/pdp/gallery.tsx:110,235 |
| pdp.gallery_aria | app/components/gberg/pdp/gallery.tsx:198 |
| pdp.gallery_close | app/components/gberg/pdp/gallery.tsx:209 |
| pdp.variant_available_only | app/components/gberg/pdp/variant-selector.tsx:131 |
| pdp.variant_available_with_sold_out | app/components/gberg/pdp/variant-selector.tsx:131 |
| pdp.spec_label_width | app/routes/($locale).products.$handle.tsx:319 |
| pdp.spec_label_height | app/routes/($locale).products.$handle.tsx:320 |
| pdp.spec_label_depth | app/routes/($locale).products.$handle.tsx:321 |
| pdp.spec_label_orientation | app/routes/($locale).products.$handle.tsx:322 |
| pdp.spec_label_connection_type | app/routes/($locale).products.$handle.tsx:323 |
| pdp.spec_label_pipe_spacing | app/routes/($locale).products.$handle.tsx:325 |
| pdp.spec_label_heating_medium | app/routes/($locale).products.$handle.tsx:327 |
| pdp.spec_label_heat_output_75 | app/routes/($locale).products.$handle.tsx:329 |
| pdp.spec_label_heat_output_70 | app/routes/($locale).products.$handle.tsx:331 |
| pdp.spec_label_heat_output_55 | app/routes/($locale).products.$handle.tsx:333 |
| pdp.spec_label_color | app/routes/($locale).products.$handle.tsx:335 |
| pdp.spec_label_finish | app/routes/($locale).products.$handle.tsx:336 |
| pdp.spec_label_material | app/routes/($locale).products.$handle.tsx:337 |
| pdp.spec_label_voltage | app/routes/($locale).products.$handle.tsx:338 |
| pdp.spec_label_heat_pump | app/routes/($locale).products.$handle.tsx:341 |
| pdp.spec_label_bathroom | app/routes/($locale).products.$handle.tsx:346 |
| pdp.spec_label_max_pressure | app/routes/($locale).products.$handle.tsx:350 |
| pdp.spec_label_max_temp | app/routes/($locale).products.$handle.tsx:352 |
| pdp.heat_pump_ready | app/components/gberg/product-card.tsx:194 |
| pdp.bestseller_badge | app/components/gberg/product-card.tsx:153 |
| pdp.product_no_longer_available | app/routes/($locale).products.$handle.tsx:52,57 |

## plp

| key | file:line |
| --- | --- |
| plp.heading_eyebrow | app/routes/($locale).collections.$handle.tsx:90 |
| plp.heading_about_category_eyebrow | app/routes/($locale).collections.$handle.tsx:121 |
| plp.about_category_body | app/routes/($locale).collections.$handle.tsx:123-127 |
| plp.empty_collection | app/routes/($locale).collections.$handle.tsx:113-114 |
| plp.empty_storefront | app/routes/($locale).collections.$handle.tsx:113 |
| plp.empty_default_lede | app/routes/($locale).collections.$handle.tsx:103-106 |
| plp.shop_all_eyebrow | app/routes/($locale).products._index.tsx:47 |
| plp.shop_all_title | app/routes/($locale).products._index.tsx:49-50 |
| plp.shop_all_lede | app/routes/($locale).products._index.tsx:56-58 |
| plp.shop_all_empty | app/routes/($locale).products._index.tsx:64 |
| plp.shop_all_meta_title | app/routes/($locale).products._index.tsx:16 |
| plp.shop_all_meta_description | app/routes/($locale).products._index.tsx:18 |
| plp.results_count | app/components/gberg/plp/collection-view.tsx:539 |
| plp.filter_sort | app/components/gberg/plp/collection-view.tsx:548,690 |
| plp.subcategory_filters | app/components/gberg/plp/collection-view.tsx:507 |
| plp.filter_all | app/components/gberg/plp/collection-view.tsx:516 |
| plp.filter_clear_all | app/components/gberg/plp/collection-view.tsx:584,728 |
| plp.filter_clear | app/components/gberg/plp/collection-view.tsx:608 |
| plp.filter_apply | app/components/gberg/plp/collection-view.tsx:734 |
| plp.filter_no_match | app/components/gberg/plp/collection-view.tsx:599 |
| plp.facet_type | app/components/gberg/plp/collection-view.tsx:446 |
| plp.facet_color | app/components/gberg/plp/collection-view.tsx:233 |
| plp.facet_series | app/components/gberg/plp/collection-view.tsx:461 |
| plp.facet_heating_medium | app/components/gberg/plp/collection-view.tsx:471 |
| plp.heating_medium_all | app/components/gberg/plp/collection-view.tsx:476 |
| plp.heating_medium_hydronic | app/components/gberg/plp/collection-view.tsx:477,420,489 |
| plp.heating_medium_electric | app/components/gberg/plp/collection-view.tsx:478,421,489 |
| plp.product_type_radiator | app/components/gberg/plp/collection-view.tsx:274 |
| plp.product_type_towel_radiator | app/components/gberg/plp/collection-view.tsx:275 |
| plp.product_type_underfloor_heating | app/components/gberg/plp/collection-view.tsx:276 |
| plp.product_type_bathroom_fixture | app/components/gberg/plp/collection-view.tsx:277 |
| plp.product_type_accessory | app/components/gberg/plp/collection-view.tsx:278 |
| plp.flag_vertical | app/components/gberg/plp/collection-view.tsx:110 |
| plp.flag_horizontal | app/components/gberg/plp/collection-view.tsx:111 |
| plp.flag_panel | app/components/gberg/plp/collection-view.tsx:112 |
| plp.flag_electric | app/components/gberg/plp/collection-view.tsx:113 |
| plp.flag_hydronic | app/components/gberg/plp/collection-view.tsx:114 |
| plp.flag_bathroom | app/components/gberg/plp/collection-view.tsx:115 |
| plp.flag_heat_pump | app/components/gberg/plp/collection-view.tsx:116 |
| plp.flag_mid_connection | app/components/gberg/plp/collection-view.tsx:117 |
| plp.sort_label | app/components/gberg/plp/collection-view.tsx:556,705 |
| plp.sort_newest | app/components/gberg/plp/collection-view.tsx:562,711 |
| plp.sort_price_asc | app/components/gberg/plp/collection-view.tsx:563,712 |
| plp.sort_price_desc | app/components/gberg/plp/collection-view.tsx:564,713 |
| plp.sort_title | app/components/gberg/plp/collection-view.tsx:565,714 |
| plp.empty_grid_default | app/components/gberg/plp/product-grid.tsx:17 |

## search

| key | file:line |
| --- | --- |
| search.placeholder | app/components/gberg/search/search-input.tsx:127, app/components/SearchForm.tsx (jsdoc) |
| search.aria_label | app/components/gberg/search/search-input.tsx:128 |
| search.clear | app/components/gberg/search/search-input.tsx:135 |
| search.searching | app/components/gberg/search/search-input.tsx:152 |
| search.no_quick_matches | app/components/gberg/search/search-input.tsx:225-227 |
| search.suggestions | app/components/gberg/search/search-input.tsx:160 |
| search.products | app/components/gberg/search/search-input.tsx:184, app/components/SearchResultsPredictive.tsx:207, app/components/SearchResults.tsx:106 |
| search.collections | app/components/SearchResultsPredictive.tsx:133 |
| search.pages | app/components/SearchResultsPredictive.tsx:174, app/components/SearchResults.tsx:73 |
| search.articles | app/components/SearchResultsPredictive.tsx:92, app/components/SearchResults.tsx:43 |
| search.results_for | app/routes/($locale).search.tsx:51, app/components/PageLayout.tsx:139 |
| search.what_looking_for | app/routes/($locale).search.tsx:58 |
| search.match_singular | app/routes/($locale).search.tsx:72 |
| search.match_plural | app/routes/($locale).search.tsx:72 |
| search.empty | app/components/SearchResults.tsx:160 |
| search.empty_query | app/components/SearchResultsPredictive.tsx:271 |
| search.no_results_for_query | app/routes/($locale).search.tsx:79-83 |
| search.view_all_results | app/components/PageLayout.tsx:139 |

## cart

| key | file:line |
| --- | --- |
| cart.title | app/components/CartMain.tsx:84,199 |
| cart.your_cart | app/components/CartMain.tsx:88 |
| cart.your_cart_empty | app/components/CartMain.tsx:179,202 |
| cart.empty_aside_blurb | app/components/CartMain.tsx:181 |
| cart.empty_page_blurb | app/components/CartMain.tsx:204 |
| cart.browse_all | app/components/CartMain.tsx:189 |
| cart.replacement_radiators | app/components/CartMain.tsx:225 |
| cart.shop_by_room | app/components/CartMain.tsx:230 |
| cart.items_ready_singular | app/components/CartMain.tsx:91 |
| cart.items_ready_plural | app/components/CartMain.tsx:91 |
| cart.line_items | app/components/CartMain.tsx:97,142 |
| cart.aria_page | app/components/CartMain.tsx:82 |
| cart.aria_drawer | app/components/CartMain.tsx:142 |
| cart.line_items_with | app/components/CartLineItem.tsx:82 |
| cart.line_quantity_label | app/components/CartLineItem.tsx:113 |
| cart.totals | app/components/CartSummary.tsx:23 |
| cart.subtotal | app/components/CartSummary.tsx:25 |
| cart.continue_to_checkout | app/components/CartSummary.tsx:55 |
| cart.discounts | app/components/CartSummary.tsx:81,77 |
| cart.discount_code | app/components/CartSummary.tsx:101 |
| cart.discount_code_placeholder | app/components/CartSummary.tsx:108 |
| cart.discount_apply_aria | app/components/CartSummary.tsx:111 |
| cart.discount_remove_aria | app/components/CartSummary.tsx:90 |
| cart.gift_cards | app/components/CartSummary.tsx:196 |
| cart.gift_card_applied | app/components/CartSummary.tsx:199 |
| cart.gift_card_label | app/components/CartSummary.tsx:225 |
| cart.gift_card_placeholder | app/components/CartSummary.tsx:232 |
| cart.gift_card_apply_aria | app/components/CartSummary.tsx:239 |
| cart.gift_card_remove_aria | app/components/CartSummary.tsx:292 |
| cart.trust_free_eu_title | app/components/CartMain.tsx:20 |
| cart.trust_free_eu_sub | app/components/CartMain.tsx:20 |
| cart.trust_returns_title | app/components/CartMain.tsx:21 |
| cart.trust_returns_sub | app/components/CartMain.tsx:21 |
| cart.trust_warranty_title | app/components/CartMain.tsx:22 |
| cart.trust_warranty_sub | app/components/CartMain.tsx:22 |
| cart.trust_engineering_title | app/components/CartMain.tsx:23 |
| cart.trust_engineering_sub | app/components/CartMain.tsx:23 |

## blogs

| key | file:line |
| --- | --- |
| blogs.meta_title | app/routes/($locale).blogs._index.tsx:17 |
| blogs.meta_description | app/routes/($locale).blogs._index.tsx:21 |
| blogs.eyebrow | app/routes/($locale).blogs._index.tsx:49 |
| blogs.title_active | app/routes/($locale).blogs._index.tsx:52 |
| blogs.title_coming_soon_lead | app/routes/($locale).blogs._index.tsx:54-58 |
| blogs.title_coming_soon_em | app/routes/($locale).blogs._index.tsx:56 |
| blogs.lede_active | app/routes/($locale).blogs._index.tsx:66 |
| blogs.lede_coming_soon | app/routes/($locale).blogs._index.tsx:67 |
| blogs.placeholder_eyebrow_install | app/routes/($locale).blogs._index.tsx:27 |
| blogs.placeholder_title_install | app/routes/($locale).blogs._index.tsx:27 |
| blogs.placeholder_eyebrow_heatpump | app/routes/($locale).blogs._index.tsx:28 |
| blogs.placeholder_title_heatpump | app/routes/($locale).blogs._index.tsx:28 |
| blogs.placeholder_eyebrow_series | app/routes/($locale).blogs._index.tsx:29 |
| blogs.placeholder_title_series | app/routes/($locale).blogs._index.tsx:29 |
| blogs.placeholder_eyebrow_eu | app/routes/($locale).blogs._index.tsx:30 |
| blogs.placeholder_title_eu | app/routes/($locale).blogs._index.tsx:30 |
| blogs.placeholder_eyebrow_bathroom | app/routes/($locale).blogs._index.tsx:31 |
| blogs.placeholder_title_bathroom | app/routes/($locale).blogs._index.tsx:31 |
| blogs.placeholder_eyebrow_replacement | app/routes/($locale).blogs._index.tsx:32 |
| blogs.placeholder_title_replacement | app/routes/($locale).blogs._index.tsx:32 |
| blogs.coming_soon_marker | app/routes/($locale).blogs._index.tsx:120 |
| blogs.coming_soon_card_aria | app/routes/($locale).blogs._index.tsx:108 |
| blogs.coming_soon_email_promise | app/routes/($locale).blogs._index.tsx:126 |

## pages

| key | file:line |
| --- | --- |
| pages.meta_title_default | app/routes/($locale).pages.$handle.tsx:30 |
| pages.eyebrow | app/routes/($locale).pages.$handle.tsx:74 |
| pages.fallback_notice | app/routes/($locale).pages.$handle.tsx:100-101 |

## policies

| key | file:line |
| --- | --- |
| policies.title | app/routes/($locale).policies._index.tsx:29 |
| policies.back_link | app/routes/($locale).policies.$handle.tsx:52 |

## errors

| key | file:line |
| --- | --- |
| errors.404_default | app/routes/($locale).$.tsx:4 |
| errors.cart_link_expired | app/routes/($locale).cart.$lines.tsx:53 |
| errors.product_no_longer_available_meta | app/routes/($locale).products.$handle.tsx:52,57 |
| errors.something_went_wrong | app/root.tsx:236 |

## seo

(SEO Phase 1 agent owns these — listed for completeness so the JSX
rewiring pass doesn't accidentally double up.)

| key | file:line |
| --- | --- |
| seo.brand_suffix | app/lib/gberg/seo.ts (BRAND_NAME) |

## Untranslatable strings

These keep the English value in every locale because they are brand
names, proper nouns, or technical tokens with no localized equivalent.
They are flagged with `_translatable: false` in each locale dictionary.

- `nav.engineered_tagline` partial — the words "Engineered, certified,
  delivered across Europe" can be translated, but "Designed in Germany"
  on the homepage is intentionally kept in English in every locale
  (it's the brand's English-only positioning slogan).
- `home.designed_in_germany_eyebrow` — value: "Designed in Germany".
  Same reason: brand slogan that we deliberately keep in English even
  on DE/NL/FR markets.
- `pdp.fallback_eyebrow_radiator` — value: "Radiator". Translatable
  per locale.
- `pdp.spec_label_*` — translatable spec terminology, but the legacy
  derived spec table mixes English / German source data; once the
  product-content team lands the localized spec metafields the wiring
  pass will fall back to those metafields in preference to a UI label.

No fully untranslatable strings beyond brand identity ("G-Berg",
"G-Berg GmbH", "G-Berg Heizung") which are kept verbatim — they are
proper nouns, not strings.
