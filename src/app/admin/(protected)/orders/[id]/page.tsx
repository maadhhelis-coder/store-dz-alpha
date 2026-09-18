import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import OrderDetailForm from "@/components/admin/OrderDetailForm";
import ShipmentPanel from "@/components/admin/crm/ShipmentPanel";
import ReturnsPanel from "@/components/admin/crm/ReturnsPanel";
import OrderFinancePanel from "@/components/admin/crm/OrderFinancePanel";
import AttributionPanel from "@/components/admin/crm/AttributionPanel";
import CommunicationsPanel from "@/components/admin/crm/CommunicationsPanel";
import { getOrder, OrderNotFoundError } from "@/server/services/ordersService";
import { getShipmentsForOrder } from "@/server/modules/shipping/shipmentService";

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

  // رفض الناقل يقع بعد رد الزر (202) — يُقرأ هنا من آخر شحنة ليظهر في النموذج.
  const [latestShipment] = await getShipmentsForOrder(order.id);
  const dispatchError = latestShipment?.status === "error" ? latestShipment.lastError : null;

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
      <OrderDetailForm order={order} dispatchError={dispatchError} />
      <ShipmentPanel orderId={order.id} orderStatus={order.status} />
      <ReturnsPanel orderId={order.id} orderStatus={order.status} items={order.items} />
      <OrderFinancePanel orderId={order.id} />
      <AttributionPanel order={order} />
      <CommunicationsPanel orderId={order.id} isTest={order.isTest} />
    </div>
  );
}
