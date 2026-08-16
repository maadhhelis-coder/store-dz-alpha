import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import OrderDetailForm from "@/components/admin/OrderDetailForm";
import { getOrder, OrderNotFoundError } from "@/server/services/ordersService";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = await params;

  let order;
  try {
    order = await getOrder(id);
  } catch (error) {
    if (error instanceof OrderNotFoundError) notFound();
    throw error;
  }

  return (
    <div>
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold mb-4"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للطلبات
      </Link>
      <h1 className="font-display text-xl font-bold text-cream mb-6">
        الطلب {order.orderNumber}
      </h1>
      <OrderDetailForm order={order} />
    </div>
  );
}
