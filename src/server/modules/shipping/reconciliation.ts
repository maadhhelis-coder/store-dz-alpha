import { prisma } from "@/server/db/prisma";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { redactErrorMessage } from "@/lib/redact";
import { getCarrierAdapter } from "@/server/modules/shipping/carrierAdapter";
import { ingestCarrierEvent } from "@/server/modules/shipping/shipmentEvents";
import { ACTIVE_SHIPMENT_STATUSES } from "@/server/modules/shipping/shipmentService";

// مطابقة الشحن مع الناقل — الطرف الثاني من عقد الأثر الخارجي.
//
// المرجع الثابت: رقم التتبّع للشحنات المُرسَلة، وorderNumber للشحنات التي لم
// يصلها رقم تتبّع بعد.
//
// **لا إصلاح صامت**: التصحيح الآمن الوحيد هو تمرير حالة المزود عبر نفس بوابة
// ingestCarrierEvent — أي أنه يمر بالـdedup وبمنع التراجع وبآلة الحالات
// ويُوثَّق كحدث شحنة. أي تباعد لا يُصلَح بهذه الطريقة يُرفَع تنبيهًا ويبقى
// مفتوحًا للبشر، ولا يُخمَّن ولا يُكتَب فوقه.
//
// الشحنة العالقة بلا رقم تتبّع بعد محاولة إرسال: مصيرها عند الناقل مجهول (لا
// استعلام بالمرجع في DHD) ⇒ تنبيه دائم، وممنوع منعًا باتًا إعادة الإرسال هنا.

export type ReconciliationResult = {
  checked: number;
  advanced: number;
  unchanged: number;
  stale: number;
  errors: number;
};

export async function reconcileShipments(): Promise<ReconciliationResult> {
  const settings = await getCrmSetting("shipping_reconciliation");
  const since = new Date(Date.now() - settings.lookback_days * 86_400_000);
  const staleBefore = new Date(Date.now() - settings.stale_dispatch_minutes * 60_000);

  const shipments = await prisma.shipment.findMany({
    where: {
      status: { in: [...ACTIVE_SHIPMENT_STATUSES] },
      createdAt: { gte: since },
      // بيانات الاختبار لا تُطابَق مع مزود حقيقي أبدًا
      order: { isTest: false },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: settings.max_shipments_per_run,
    select: {
      id: true,
      provider: true,
      trackingNumber: true,
      status: true,
      retryCount: true,
      lastSyncedAt: true,
      createdAt: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });

  const result: ReconciliationResult = {
    checked: shipments.length,
    advanced: 0,
    unchanged: 0,
    stale: 0,
    errors: 0,
  };

  for (const shipment of shipments) {
    if (!shipment.trackingNumber) {
      // إرسال بدأ ولم يعد برقم تتبّع، وتجاوز المهلة ⇒ تباعد مؤكَّد بلا إصلاح آمن
      const attempted = shipment.retryCount > 0;
      const overdue = (shipment.lastSyncedAt ?? shipment.createdAt) < staleBefore;
      if (attempted && overdue) {
        result.stale += 1;
        await raiseSystemAlert({
          type: "shipment_reconciliation_divergence",
          severity: "critical",
          message: `الشحنة بلا رقم تتبّع بعد محاولة إرسال (الطلب ${shipment.order.orderNumber}) — تحقّق يدويًا عند الناقل قبل أي إرسال جديد`,
          entityType: "shipment",
          entityId: shipment.id,
          metadata: {
            orderId: shipment.order.id,
            orderNumber: shipment.order.orderNumber,
            retryCount: shipment.retryCount,
            provider: shipment.provider,
          },
        });
      }
      continue;
    }

    try {
      const adapter = getCarrierAdapter(shipment.provider);
      const { rawStatus } = await adapter.fetchStatus(shipment.trackingNumber);
      if (rawStatus === null) {
        // لا بيانات عند الناقل بعد — ليست تباعدًا ولا حالة مجهولة
        result.unchanged += 1;
        continue;
      }

      // التصحيح الآمن: عبر نفس بوابة الأحداث — dedup + لا تراجع + آلة الحالات
      const ingest = await ingestCarrierEvent({
        provider: shipment.provider,
        trackingNumber: shipment.trackingNumber,
        reference: shipment.order.orderNumber,
        rawStatus,
        description: `مطابقة دورية: ${rawStatus}`,
      });

      if (ingest.outcome === "applied") result.advanced += 1;
      else result.unchanged += 1;
    } catch (error) {
      result.errors += 1;
      const message = redactErrorMessage(
        error instanceof Error ? error.message : String(error),
      ).slice(0, 500);
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { lastError: message, lastSyncedAt: new Date() },
      });
    }
  }

  await prisma.integrationSyncLog.create({
    data: {
      integration: "shipping_reconciliation",
      status: result.errors > 0 ? "partial" : "success",
      stats: { ...result },
      finishedAt: new Date(),
    },
  });

  return result;
}
