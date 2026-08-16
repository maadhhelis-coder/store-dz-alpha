"use client";

import { useState } from "react";
import BrandImage from "@/components/brand/BrandImage";
import { cn } from "@/lib/utils";

type ProductGalleryProps = {
  images: string[];
  productName: string;
};

export default function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] ?? images[0];

  return (
    <div>
      <div className="relative aspect-square rounded-2xl overflow-hidden gold-border">
        <BrandImage
          src={activeImage}
          alt={`${productName} — Store DZ`}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-3 mt-4">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`صورة ${index + 1} من ${productName}`}
              className={cn(
                "relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors",
                index === activeIndex ? "border-gold" : "border-transparent opacity-70",
              )}
            >
              <BrandImage
                src={image}
                alt={`${productName} — صورة ${index + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
