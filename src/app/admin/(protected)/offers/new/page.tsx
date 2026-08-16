import Link from "next/link";
import { ChevronRight } from "lucide-react";
import OfferForm from "@/components/admin/OfferForm";
import { prisma } from "@/server/db/prisma";

export default async function NewOfferPage() {
  const products = await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold mb-4"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للعروض
      </Link>
      <h1 className="font-display text-xl font-bold text-cream mb-6">عرض جديد</h1>
      <OfferForm mode="create" products={products} />
    </div>
  );
}
