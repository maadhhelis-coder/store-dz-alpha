import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CategoryForm from "@/components/admin/CategoryForm";

export default function NewCategoryPage() {
  return (
    <div>
      <Link
        href="/admin/categories"
        className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold mb-4"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للتصنيفات
      </Link>
      <h1 className="font-display text-xl font-bold text-cream mb-6">تصنيف جديد</h1>
      <CategoryForm mode="create" />
    </div>
  );
}
