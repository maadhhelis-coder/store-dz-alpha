import ProductsTable from "@/components/admin/ProductsTable";
import { prisma } from "@/server/db/prisma";

export default async function AdminProductsPage() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-6">المنتجات</h1>
      <ProductsTable categories={categories} />
    </div>
  );
}
