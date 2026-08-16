import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import OfferForm from "@/components/admin/OfferForm";
import { getOffer, OfferNotFoundError } from "@/server/services/offersService";
import { prisma } from "@/server/db/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditOfferPage({ params }: PageProps) {
  const { id } = await params;

  let offer;
  try {
    offer = await getOffer(id);
  } catch (error) {
    if (error instanceof OfferNotFoundError) notFound();
    throw error;
  }

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
      <h1 className="font-display text-xl font-bold text-cream mb-6">{offer.title}</h1>
      <OfferForm mode="edit" products={products} initialOffer={offer} />
    </div>
  );
}
