import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_META } from "@/lib/orderStatus";

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full text-black whitespace-nowrap"
      style={{ backgroundColor: meta.color }}
    >
      {meta.label}
    </span>
  );
}
