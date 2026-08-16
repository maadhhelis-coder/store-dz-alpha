import Link from "next/link";
import { ChevronRight } from "lucide-react";
import FunnelForm from "@/components/admin/FunnelForm";
import { prisma } from "@/server/db/prisma";

export default async function NewFunnelPage() {
  const products = await prisma.product.findMany({
    where: { isPublished: true },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link
        href="/admin/funnels"
        className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold mb-4"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة لصفحات الهبوط
      </Link>
      <h1 className="font-display text-xl font-bold text-cream mb-6">صفحة هبوط جديدة</h1>
      <FunnelForm mode="create" products={products} />
    </div>
  );
}
