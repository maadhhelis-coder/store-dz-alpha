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

  function step(delta: 1 | -1) {
    setActiveIndex((i) => (i + delta + images.length) % images.length);
  }

  return (
    // الإطار المستطيلي: يضمّ الإطار المربّع والمصغّرات معًا (طلب صريح).
    <div className="rounded-2xl gold-border bg-ink p-3 md:p-4">
      {/* الإطار المربّع. object-contain لا cover: صور المنتج طولية (3:4) فالقصّ
          إلى مربّع يبتر أعلاها وأسفلها. الفراغ الجانبي الناتج هو بالضبط مكان
          السهمين، فلا يغطّيان الصورة ولا جزءًا منها. */}
      <div className="relative aspect-square overflow-hidden rounded-xl gold-border bg-black">
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
              className="absolute start-1 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-gold transition-colors hover:bg-black/90"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="الصورة التالية"
              className="absolute end-1 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-gold transition-colors hover:bg-black/90"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {hasMany && (
        // مربّعات كبيرة داخل الإطار المستطيلي نفسه. grid لا flex: أربعة أعمدة
        // متساوية تملأ العرض المتاح مهما كان عدد الصور، فتكبر المصغّرة مع الإطار
        // بدل مقاس ثابت. كلها واضحة دائمًا — لا تعتيم على غير النشطة.
        <div className="mt-3 grid grid-cols-4 gap-2 md:gap-3">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`صورة ${index + 1} من ${productName}`}
              aria-current={index === activeIndex}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border-2 transition-colors",
                index === activeIndex ? "border-gold" : "border-gold/25 hover:border-gold/60",
              )}
            >
              <BrandImage
                src={image}
                alt={`${productName} — صورة ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 25vw, 160px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
