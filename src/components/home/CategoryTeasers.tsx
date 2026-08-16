import Link from "next/link";
import BrandImage from "@/components/brand/BrandImage";
import SectionHeading from "@/components/shared/SectionHeading";
import { getCategories } from "@/lib/storefrontData";

export default async function CategoryTeasers() {
  const categories = await getCategories();
  return (
    <section className="container-page py-14 md:py-20">
      <SectionHeading
        eyebrow="تصفح حسب التصنيف"
        title="اختر ما يناسبك"
        description="تشكيلة متنوعة تجمع بين التقنية، الأناقة، وعملية الاستخدام اليومي."
      />
      <div className="grid sm:grid-cols-3 gap-5">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/category/${category.slug}`}
            className="group relative rounded-xl overflow-hidden gold-border aspect-[4/3]"
          >
            <BrandImage
              src={category.image}
              alt={category.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-5">
              <h3 className="font-display text-lg font-bold text-cream">
                {category.name}
              </h3>
              <p className="text-xs text-cream-dim mt-1 line-clamp-1">
                {category.shortDescription}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
