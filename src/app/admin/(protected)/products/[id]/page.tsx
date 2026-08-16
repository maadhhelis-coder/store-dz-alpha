import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import ProductForm from "@/components/admin/ProductForm";
import { getProduct, ProductNotFoundError } from "@/server/services/productsService";
import { prisma } from "@/server/db/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;

  let product;
  try {
    product = await getProduct(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) notFound();
    throw error;
  }

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
      <h1 className="font-display text-xl font-bold text-cream mb-6">{product.name}</h1>
      <ProductForm mode="edit" categories={categories} initialProduct={product} />
    </div>
  );
}
