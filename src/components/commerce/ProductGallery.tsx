"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BrandImage from "@/components/brand/BrandImage";
import { cn } from "@/lib/utils";

type ProductGalleryProps = {
  images: string[];
  productName: string;
};

export default function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] ?? images[0];
  const hasMany = images.length > 1;

  // الإطار 4:3 والصورة object-contain (طلب صريح: السهمان «ميكونش يغطو صورة المنتج
  // او جزء منها»). صور المنتج مربّعة 1:1، فتملأ ارتفاع الإطار ويبقى على كل جانب
  // فراغ = سُدس العرض تقريبًا — وهو بالضبط مكان السهمين. object-cover هنا كان
  // يقصّ أعلى الصورة وأسفلها.
  function step(delta: 1 | -1) {
    setActiveIndex((i) => (i + delta + images.length) % images.length);
  }

  return (
    <div>
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden gold-border">
        <BrandImage
          src={activeImage}
          alt={`${productName} — Store DZ`}
          fill
          priority
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 50vw"
        />

        {hasMany && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="الصورة السابقة"
              className="absolute start-1 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-gold hover:bg-black/90 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="الصورة التالية"
              className="absolute end-1 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-gold hover:bg-black/90 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {hasMany && (
        // كلها واضحة دائمًا: opacity-70 على غير النشطة أُزيلت (طلب صريح — «اريدهم
        // كلهم واضحين»). أكبر (80px بدل 64) وsizes أوسع من المقاس المعروض حتى
        // تُقدَّم نسخة كثيفة على شاشات 2× فلا تظهر ضبابية.
        <div className="flex flex-wrap gap-3 mt-4">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`صورة ${index + 1} من ${productName}`}
              aria-current={index === activeIndex}
              className={cn(
                "relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors",
                index === activeIndex ? "border-gold" : "border-gold/25 hover:border-gold/60",
              )}
            >
              <BrandImage
                src={image}
                alt={`${productName} — صورة ${index + 1}`}
                fill
                className="object-cover"
                sizes="160px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
