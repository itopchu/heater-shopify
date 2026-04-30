/**
 * Server component. PDP image gallery.
 * Above-the-fold critical content per the master execution prompt — server-rendered.
 * Spec ref: shop/02_wireframes_page_blueprints.md "Heating product page".
 */
import Image from "next/image";
import type { Image as ImageType } from "@gberg/product-schema";
import { cn } from "@gberg/ui";

export interface GalleryProps {
  images: ImageType[];
  alt: string;
  className?: string;
}

export function Gallery({ images, alt, className }: GalleryProps) {
  if (!images?.length) {
    return (
      <div className={cn("aspect-square w-full rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)]", className)} />
    );
  }
  const [primary, ...rest] = images;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)]">
        {primary ? (
          <Image
            src={primary.url}
            alt={primary.altText ?? alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
          />
        ) : null}
      </div>
      {rest.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2">
          {rest.slice(0, 4).map((img, i) => (
            <li key={`${img.url}-${i}`} className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-muted)]">
              <Image
                src={img.url}
                alt={img.altText ?? `${alt} (view ${i + 2})`}
                fill
                sizes="120px"
                className="object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
