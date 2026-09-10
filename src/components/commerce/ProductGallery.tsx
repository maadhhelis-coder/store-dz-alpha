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
      {/* بلا حدّ ذهبي وبلا خلفية مغايرة (طلب صريح: «الإطار يكون بالصورة كامل»):
          الحاوية شفافة فوق خلفية الإطار المستطيلي نفسها فلا تُرى لها حافة —
          المرئي هو الصورة وحدها. object-contain يُبقيها كاملة بلا قصّ، والفراغ
          الجانبي غير المرئي الناتج هو بالضبط مكان السهمين فلا يغطّيان شيئًا. */}
      <div className="relative aspect-square overflow-hidden rounded-xl">
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
        // أصغر قليلًا من ملء العرض (طلب صريح) ومتوسّطة: مقاس ثابت بـflex بدل
        // أعمدة تتمدّد. كلها واضحة دائمًا — لا تعتيم على غير النشطة.
        <div className="mt-3 flex flex-wrap justify-center gap-2 md:gap-3">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`صورة ${index + 1} من ${productName}`}
              aria-current={index === activeIndex}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors sm:h-20 sm:w-20 md:h-24 md:w-24",
                index === activeIndex ? "border-gold" : "border-gold/25 hover:border-gold/60",
              )}
            >
              <BrandImage
                src={image}
                alt={`${productName} — صورة ${index + 1}`}
                fill
                // contain لا cover: القصّ كان يخفي أطراف الصورة فتبدو «مغطّاة»
                className="object-contain"
                sizes="(max-width: 768px) 96px, 192px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
