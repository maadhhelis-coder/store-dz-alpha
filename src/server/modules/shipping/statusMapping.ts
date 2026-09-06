import type { OrderStatus, ShipmentStatus } from "@prisma/client";

// ترجمة حالة الناقل ← حالة الشحنة ← حالة الطلب. وحدة نقية بالكامل (بلا قاعدة
// بيانات ولا شبكة) — كل قرار هنا قابل للاختبار وحده.
//
// مصدر المفردات: مفردات منصة EcoTrack الفرنسية التي تعمل عليها DHD، وهي نفس
// الحقل `data.state.title` الذي يصل في الـwebhook (راجع processDhdWebhookPayload).
// **لم تُختبر بعد بحمولة إنتاج حقيقية** — نفس تحفّظ dhdService على بقية الحقول.
// ولهذا القاعدة الحاكمة: أي قيمة خارج هذا الجدول **لا تُخمَّن إطلاقًا** — تُحفظ
// خامًا في shipment_events ويُرفع تنبيه للمراجعة البشرية.

/** ترتيب تقدّم الشحنة — يمنع التراجع عند وصول الأحداث خارج ترتيبها.
 * حدث برتبة ≤ الحالة الحالية يُحفظ ولا يُغيّر الحالة. */
const PROGRESS_RANK: Record<ShipmentStatus, number> = {
  error: 0,
  created: 1,
  handed_over: 2,
  in_transit: 3,
  out_for_delivery: 4,
  return_requested: 5,
  delivered: 6,
  returned: 7,
  cancelled: 7,
};

export function shipmentProgressRank(status: ShipmentStatus): number {
  return PROGRESS_RANK[status];
}

/** هل هذا الحدث يتقدّم بالشحنة فعلًا؟ (لا تراجع، ولا إعادة كتابة لنفس الحالة) */
export function advancesShipment(current: ShipmentStatus, incoming: ShipmentStatus): boolean {
  return PROGRESS_RANK[incoming] > PROGRESS_RANK[current];
}

function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

// المفتاح مُطبَّع (بلا حركات، صغير الأحرف، فراغ واحد) — يقبل تنويعات الكتابة
// دون أن يقبل قيمة غير معروفة.
const DHD_TO_SHIPMENT: Record<string, ShipmentStatus> = {
  // ما بعد قبول الطلب عند الناقل وقبل الالتقاط
  "en preparation": "created",
  "pret a expedier": "created",
  // التقاط المندوب
  "ramasse": "handed_over",
  "collecte": "handed_over",
  "pris en charge": "handed_over",
  // في الطريق بين المراكز
  "en transit": "in_transit",
  "expedie": "in_transit",
  "vers wilaya": "in_transit",
  "recu a wilaya": "in_transit",
  // خرج للتسليم
  "sorti en livraison": "out_for_delivery",
  "en livraison": "out_for_delivery",
  // نجاح
  "livre": "delivered",
  "livre payer": "delivered",
  // طلب إرجاع / رفض
  "retour vers vendeur": "return_requested",
  "en attente de retour": "return_requested",
  "tentative echouee": "return_requested",
  // إغلاق دورة الإرجاع
  "retourne au vendeur": "returned",
  "retour recu": "returned",
  // إلغاء عند الناقل
  "annule": "cancelled",
};

/** حالة الناقل الخام → حالة شحنة معروفة، أو null إن كانت غير موثّقة (لا تخمين). */
export function mapCarrierStatus(rawStatus: string): ShipmentStatus | null {
  return DHD_TO_SHIPMENT[normalize(rawStatus)] ?? null;
}

/** حالة الشحنة → حالة الطلب المقابلة، أو null إن لم يكن للناقل سلطة عليها.
 *
 * created/handed_over لا تُحرّك الطلب: التسليم للناقل يُسجَّل عند نجاح الإرسال
 * (shipped) لا عند حدث لاحق. cancelled لا تُلغي طلبًا أبدًا — إلغاء الطلب قرار
 * تجاري بشري؛ الناقل يرفع تنبيهًا فقط. */
const SHIPMENT_TO_ORDER: Partial<Record<ShipmentStatus, OrderStatus>> = {
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  return_requested: "return_to_origin",
  returned: "returned",
};

export function orderStatusForShipment(status: ShipmentStatus): OrderStatus | null {
  return SHIPMENT_TO_ORDER[status] ?? null;
}
