import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import CategoryForm from "@/components/admin/CategoryForm";
import { getCategory, CategoryNotFoundError } from "@/server/services/categoriesService";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCategoryPage({ params }: PageProps) {
  const { id } = await params;

  let category;
  try {
    category = await getCategory(id);
  } catch (error) {
    if (error instanceof CategoryNotFoundError) notFound();
    throw error;
  }

  return (
    <div>
      <Link
        href="/admin/categories"
        className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold mb-4"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للتصنيفات
      </Link>
      <h1 className="font-display text-xl font-bold text-cream mb-6">{category.name}</h1>
      <CategoryForm mode="edit" initialCategory={category} />
    </div>
  );
}
