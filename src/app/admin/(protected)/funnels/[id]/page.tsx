import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import FunnelForm from "@/components/admin/FunnelForm";
import { getFunnel, FunnelNotFoundError } from "@/server/services/funnelsService";
import { prisma } from "@/server/db/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditFunnelPage({ params }: PageProps) {
  const { id } = await params;

  let funnel;
  try {
    funnel = await getFunnel(id);
  } catch (error) {
    if (error instanceof FunnelNotFoundError) notFound();
    throw error;
  }

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
      <h1 className="font-display text-xl font-bold text-cream mb-6">{funnel.title}</h1>
      <FunnelForm mode="edit" products={products} initialFunnel={funnel} />
    </div>
  );
}
