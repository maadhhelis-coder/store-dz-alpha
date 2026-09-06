import { AlertTriangle } from "lucide-react";
import { getShipmentsForOrder } from "@/server/modules/shipping/shipmentService";
import { hasPermission } from "@/lib/auth/requirePermission";
import ReshipButton from "@/components/admin/crm/ReshipButton";
import type { OrderStatus, ShipmentStatus } from "@prisma/client";

// لوحة الشحن — دورات الشحن وأحداث الناقل. تعرض ما هو مسجَّل فعلًا لا أكثر:
// شحنة بلا رقم تتبّع = لم تصل الناقل بعد، وهذا يُقال صراحةً بدل تركه فراغًا.

const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  created: "أُنشئت محليًا",
  handed_over: "سُلّمت للناقل",
  in_transit: "في الطريق",
  out_for_delivery: "خرجت للتسليم",
  return_requested: "طلب إرجاع",
  delivered: "سُلّمت",
  returned: "أُرجعت",
  cancelled: "أُلغيت",
  error: "خطأ إرسال",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "أساسية",
  replacement: "استبدال",
  reship: "إعادة شحن",
};

function moment(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 16);
}

export default async function ShipmentPanel({
  orderId,
  orderStatus,
}: {
  orderId: string;
  orderStatus: OrderStatus;
}) {
  const [shipments, canRead, canReship] = await Promise.all([
    getShipmentsForOrder(orderId),
    hasPermission("shipments.read"),
    hasPermission("shipments.reship"),
  ]);

  if (!canRead) return null;

  return (
    <div className="gold-border bg-ink rounded-xl p-5 mt-6">
      <h2 className="font-display text-base font-bold text-cream mb-4">دورات الشحن</h2>

      {shipments.length === 0 ? (
        <p className="text-sm text-cream-dim">لا توجد شحنة لهذا الطلب بعد.</p>
      ) : (
        <div className="space-y-4">
          {shipments.map((shipment) => (
            <div key={shipment.id} className="rounded-lg border border-gold/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-cream">
                  {SHIPMENT_STATUS_LABELS[shipment.status]}
                  <span className="ms-2 text-xs font-normal text-cream-dim">
                    {ROLE_LABELS[shipment.role] ?? shipment.role} · {shipment.provider}
                  </span>
                </div>
                <div className="text-xs text-cream-dim" dir="ltr">
                  {shipment.trackingNumber ?? "—"}
                </div>
              </div>

              {!shipment.trackingNumber && (
                <p className="mt-2 text-xs text-cream-dim">
                  لم يصل رقم تتبّع بعد — الإرسال للناقل يجري في الخلفية.
                </p>
              )}

              {shipment.lastError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
                  <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                  {shipment.lastError}
                </p>
              )}

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-cream-dim">
                <div className="flex justify-between">
                  <dt>مبلغ التحصيل</dt>
                  <dd>{shipment.codAmountDzd} دج</dd>
                </div>
                <div className="flex justify-between">
                  <dt>محاولات الإرسال</dt>
                  <dd>{shipment.retryCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>أُنشئت</dt>
                  <dd dir="ltr">{moment(shipment.createdAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>آخر مزامنة</dt>
                  <dd dir="ltr">{shipment.lastSyncedAt ? moment(shipment.lastSyncedAt) : "—"}</dd>
                </div>
              </dl>

              {shipment.events.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-gold/10 pt-3 text-xs">
                  {shipment.events.map((event) => (
                    <li key={event.id} className="flex justify-between gap-3 text-cream-dim">
                      <span>
                        {event.status
                          ? SHIPMENT_STATUS_LABELS[event.status]
                          : "حالة غير موثّقة — بانتظار مراجعة"}
                        {event.description && (
                          <span className="ms-2 text-cream-dim/70">{event.description}</span>
                        )}
                      </span>
                      <span dir="ltr" className="shrink-0 text-cream-dim/60">
                        {moment(event.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {canReship && orderStatus === "returned" && (
        <div className="mt-4">
          <ReshipButton orderId={orderId} />
        </div>
      )}
    </div>
  );
}
