import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ProductForm from "@/components/admin/ProductForm";
import { prisma } from "@/server/db/prisma";

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div>
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold mb-4"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للمنتجات
      </Link>
      <h1 className="font-display text-xl font-bold text-cream mb-6">منتج جديد</h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}
