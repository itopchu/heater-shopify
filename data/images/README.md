# Havn product images

Licensed + AI-rendered product photography lives here. One folder per product handle.

## Structure
```
data/images/
  havn-nord/        # Vertical bath radiator
    01-hero.jpg
    02-detail.jpg
    03-lifestyle.jpg
  havn-fjord/       # Horizontal living-room
  havn-skagen/      # Towel warmer
  havn-bris/        # Compact
  havn-storm/       # Large-format
```

## Sourcing
- **Stock photos:** purchase from Adobe Stock / Shutterstock with commercial license. Radiator category. ~5-10 per product (hero + detail + lifestyle).
- **AI renders:** generate consistent studio renders using Stable Diffusion XL with a fixed LoRA for visual consistency across the range. Store prompts in `prompts/` alongside the images.
- **Never:** hotlink from competitor sites (xxl-heizung.de, radiatorshop.com, etc.) — copyright risk + takedown risk.

## Uploading to Shopify
Run `node agent/scripts/attach-product-images-local.mjs` to upload everything in this tree via `stagedUploadsCreate` + `productCreateMedia`.

