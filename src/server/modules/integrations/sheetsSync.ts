import { prisma } from "@/server/db/prisma";
import { redactErrorMessage } from "@/lib/redact";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";

// مزامنة Google Sheets (P7) — على الخادم عبر outbox، لا من المتصفح.
//
// PostgreSQL هو المرجع؛ الشيت مرآة تشغيلية للمالك. الرابط = تطبيق Apps Script
// (ORDER_SHEETS_ENDPOINT، ويُقبل NEXT_PUBLIC_ORDER_ENDPOINT القديم توافقًا) — لا مفاتيح
// Google هنا ولا في المتصفح. كل طلب يحمل action + orderNumber حتى يزيل السكربت
// التكرار عند إعادة المحاولة (راجع GOOGLE_SHEETS_SETUP.md، النسخة 3). كل تشغيلة تُسجَّل
// في integration_sync_logs (نجاح/فشل بالسبب المنقّح) — لا فشل صامت.

const SHEETS_TIMEOUT_MS = 15_000;
export const SHEETS_INTEGRATION = "google_sheets";

export function sheetsEndpoint(): string | null {
  const url = (process.env.ORDER_SHEETS_ENDPOINT ?? process.env.NEXT_PUBLIC_ORDER_ENDPOINT ?? "").trim();
  return url.length > 0 ? url : null;
}

export type SheetsAction = "order.created" | "order.status_changed";

export class SheetsSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetsSyncError";
  }
}

/** صف الشيت من لقطة الطلب (نفس أعمدة النسخة القديمة + رقم الطلب والحالة). */
async function buildPayload(orderId: string, action: SheetsAction) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return null;
  if (order.isTest) return null; // طلب اختبار: لا أثر خارجي
  const [main, ...extras] = order.items;
  return {
    action,
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    firstName: order.customerFirstName,
    lastName: order.customerLastName,
    phone: order.phone,
    wilayaName: order.wilayaName,
    commune: order.commune,
    address: order.address ?? "",
    quantity: main?.quantity ?? 0,
    productName: main
      ? `${main.productNameSnapshot}${main.variantLabelSnapshot ? ` (${main.variantLabelSnapshot})` : ""}`
      : "",
    productPrice: main?.lineTotalDzd ?? 0,
    deliveryPrice: order.deliveryPriceDzd,
    totalPrice: order.totalDzd,
    offerProductName: extras.map((e) => e.productNameSnapshot).join(" + ") || undefined,
    offerPriceDzd: extras.reduce((s, e) => s + e.lineTotalDzd, 0) || undefined,
    couponCode: order.couponCode ?? undefined,
    discountDzd: order.discountDzd || undefined,
  };
}

export type SheetsSyncOutcome = "synced" | "skipped_not_configured" | "skipped_test_or_missing" | "skipped_e2e";

/** يرمي عند الفشل (المشغّل يعيد المحاولة ثم dead-letter + SystemAlert). */
export async function syncOrderToSheets(orderId: string, action: SheetsAction): Promise<SheetsSyncOutcome> {
  const endpoint = sheetsEndpoint();
  if (!endpoint) return "skipped_not_configured";
  // نفس حارس E2E المعتمد في بقية التكاملات: لا كتابة في شيت المالك من تشغيلة اختبار
  if (isE2ETestRun()) {
    logE2ESkip(`sheets sync ${action} ${orderId}`);
    return "skipped_e2e";
  }
  const payload = await buildPayload(orderId, action);
  if (!payload) return "skipped_test_or_missing";

  const log = await prisma.integrationSyncLog.create({
    data: { integration: SHEETS_INTEGRATION, status: "running", stats: { action, orderNumber: payload.orderNumber } },
    select: { id: true },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new SheetsSyncError(`Sheets HTTP ${res.status}: ${text.slice(0, 200)}`);
    // Apps Script يرد JSON {status:"ok"} — أي رد آخر (صفحة HTML لخطأ نشر مثلًا) فشل صريح
    let parsed: { status?: string; error?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SheetsSyncError(`رد غير متوقع من Apps Script: ${text.slice(0, 120)}`);
    }
    if (parsed.status !== "ok") throw new SheetsSyncError(`Apps Script رفض: ${parsed.error ?? text.slice(0, 120)}`);
    await prisma.integrationSyncLog.update({
      where: { id: log.id },
      data: { status: "success", finishedAt: new Date(), stats: { action, orderNumber: payload.orderNumber } },
    });
    return "synced";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.integrationSyncLog.update({
      where: { id: log.id },
      data: { status: "failed", finishedAt: new Date(), error: redactErrorMessage(message).slice(0, 1000) },
    });
    throw error instanceof SheetsSyncError ? error : new SheetsSyncError(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function lastSheetsSyncLogs(limit = 10) {
  return prisma.integrationSyncLog.findMany({
    where: { integration: SHEETS_INTEGRATION },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
