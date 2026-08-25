import type { Metadata } from "next";
import SectionHeading from "@/components/shared/SectionHeading";
import { getCategories } from "@/lib/storefrontData";
import { buildMetadata } from "@/lib/seo";

type ProductsPageProps = {
  searchParams: Promise<{ page?: string; category?: string }>;
};

// كل تصنيف فلترة (?category=) صفحة محتوى مختلفة فعليًا فتستحق canonical/title خاص بها؛
// أما صفحات الترقيم (?page=2+) فمحتواها مكرر جزئيًا من صفحة 1، فتُعلَّم noindex,follow —
// تبقى قابلة للزحف (follow) لكن لا تُفهرَس بشكل منفصل يُشتت قيمة الصفحة الرئيسية فمحركات البحث.
export async function generateMetadata({ searchParams }: ProductsPageProps): Promise<Metadata> {
  const { page: pageParam, category: categorySlug } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  let title = "المنتجات";
  // نص عام عمدًا (لا يُعدِّد أسماء تصنيفات بعينها) — نسخة سابقة كانت تُسمّي ثلاثة تصنيفات
  // بالاسم هنا، فبقيت فوصف الصفحة الوصفي (meta description) بعد حذف تصنيفين فعليًا من
  // قاعدة البيانات، فظهرت فنتائج بحث جوجل تصنيفات لم تعد موجودة إطلاقًا.
  let description =
    "تصفح تشكيلة منتجات Store DZ الأصلية 100% بأسعار مناسبة وتوصيل لكل الجزائر.";
  let path = "/products";

  if (categorySlug) {
    const categories = await getCategories();
    const category = categories.find((c) => c.slug === categorySlug);
    if (category) {
      title = `${category.name} — المنتجات`;
      description = `تصفح تشكيلة ${category.name} فـStore DZ: منتجات أصلية 100% بأسعار مناسبة وتوصيل لكل الجزائر.`;
      path = `/products?category=${categorySlug}`;
    }
  }

  const meta = buildMetadata({ title, description, path });
  if (page > 1) {
    meta.robots = { index: false, follow: true };
  }
  return meta;
}

// اكتُشف فعليًا (طلب صريح): هذه الصفحة أصبحت تعرض العنوان فقط ("كل المنتجات" /
// "تشكيلتنا الكاملة") — لا Breadcrumbs، لا وصف، لا شبكة منتجات، لا تصنيفات، لا ترقيم صفحات.
export default async function ProductsPage() {
  return (
    <div className="container-page py-10 md:py-14">
      <SectionHeading as="h1" eyebrow="كل المنتجات" title="تشكيلتنا الكاملة" />
    </div>
  );
}
