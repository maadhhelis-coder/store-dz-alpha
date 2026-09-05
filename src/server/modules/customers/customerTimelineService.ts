// ===========================================================================
// Timeline موحّد للعميل — cursor pagination حتمي عبر مصادر متعددة
// ===========================================================================
// الترتيب الحتمي المعماري: createdAt DESC ثم id DESC (كسر التعادل يمنع التذبذب
// ويمنع التكرار/التخطي عند الإدراج المتزامن — العناصر الأحدث من المؤشر فقط
// تعود، والعناصر الأقدم تبقى خلفه بثبات).
// المصادر (المتاحة حاليًا في P3): تاريخ حالات الطلب، محاولات التأكيد،
// الاتصالات المسجلة، المهام. بلا N+1: استعلام واحد لكل مصدر بحدود bounded.
// المؤشر: base64(createdAtISO|id) — آمن للعرض وغير قابل للتفسير الخاطئ.

import { prisma } from "@/server/db/prisma";

export type TimelineEntryType = "order_status" | "confirmation_attempt" | "communication" | "task";

export type TimelineEntry = {
  type: TimelineEntryType;
  id: string;
  createdAt: Date;
  // حقول عرض مشتركة
  title: string;
  detail: string | null;
  orderId: string | null;
  orderNumber: string | null;
  actorLabel: string | null;
  cursor: string;
};

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const PER_SOURCE_TAKE_MULTIPLIER = 2; // هامش لكل مصدر قبل الدمج — يضمن امتلاء الصفحة

export function encodeTimelineCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeTimelineCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** شرط "أقدم من المؤشر حتميًا" — createdAt < c أو (== و id <) على مستوى SQL. */
function cursorWhere(cursor: { createdAt: Date; id: string }) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: { equals: cursor.createdAt }, id: { lt: cursor.id } },
    ],
  };
}

export async function getCustomerTimeline(params: {
  customerId: string;
  cursor?: string | null;
  pageSize?: number;
}): Promise<{ items: TimelineEntry[]; nextCursor: string | null }> {
  const pageSize = Math.min(
    Math.max(1, params.pageSize ?? PAGE_SIZE_DEFAULT),
    PAGE_SIZE_MAX,
  );
  const perSourceTake = pageSize * PER_SOURCE_TAKE_MULTIPLIER;
  const cursor = params.cursor ? decodeTimelineCursor(params.cursor) : null;
  // مؤشر غير صالح = طلب تالف — نبدأ من الأول بدل فشل غامض (سلوك pagination لطيف)
  const effectiveCursor = cursor;

  // استعلام واحد لكل مصدر — بلا N+1، كل مصدر bounded ومرتب حتميًا
  const [statusHistory, attempts, communications, tasks] = await Promise.all([
    prisma.orderStatusHistory.findMany({
      where: {
        order: { customerId: params.customerId, isTest: false },
        ...(effectiveCursor
          ? cursorWhere(effectiveCursor)
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: perSourceTake,
      select: {
        id: true,
        createdAt: true,
        oldStatus: true,
        newStatus: true,
        reason: true,
        actorType: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.confirmationAttempt.findMany({
      where: {
        customerId: params.customerId,
        order: { isTest: false },
        ...(effectiveCursor ? cursorWhere(effectiveCursor) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: perSourceTake,
      select: {
        id: true,
        createdAt: true,
        outcome: true,
        note: true,
        order: { select: { id: true, orderNumber: true } },
        agent: { select: { fullName: true } },
      },
    }),
    prisma.communication.findMany({
      where: {
        customerId: params.customerId,
        order: { isTest: false },
        ...(effectiveCursor ? cursorWhere(effectiveCursor) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: perSourceTake,
      select: {
        id: true,
        createdAt: true,
        channel: true,
        status: true,
        template: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        customerId: params.customerId,
        order: { isTest: false },
        ...(effectiveCursor ? cursorWhere(effectiveCursor) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: perSourceTake,
      select: {
        id: true,
        createdAt: true,
        type: true,
        status: true,
        priority: true,
        order: { select: { id: true, orderNumber: true } },
        completedBy: { select: { fullName: true } },
      },
    }),
  ]);

  const entries: TimelineEntry[] = [
    ...statusHistory.map((h) => ({
      type: "order_status" as const,
      id: h.id,
      createdAt: h.createdAt,
      title: `حالة الطلب ${h.order.orderNumber}: ${h.oldStatus ?? "—"} → ${h.newStatus}`,
      detail: h.reason,
      orderId: h.order.id,
      orderNumber: h.order.orderNumber,
      // لا علاقة actor في OrderStatusHistory (actorId نصي بلا FK) — نوع الفاعل
      // هو المتاح حتميًا بلا استعلام إضافي، وهو كافٍ للعرض.
      actorLabel: h.actorType,
      cursor: encodeTimelineCursor(h.createdAt, h.id),
    })),
    ...attempts.map((a) => ({
      type: "confirmation_attempt" as const,
      id: a.id,
      createdAt: a.createdAt,
      title: `محاولة تأكيد ${a.order.orderNumber}: ${a.outcome}`,
      detail: a.note,
      orderId: a.order.id,
      orderNumber: a.order.orderNumber,
      actorLabel: a.agent?.fullName ?? null,
      cursor: encodeTimelineCursor(a.createdAt, a.id),
    })),
    ...communications.map((c) => ({
      type: "communication" as const,
      id: c.id,
      createdAt: c.createdAt,
      title: `اتصال ${c.channel}: ${c.status}`,
      detail: c.template,
      orderId: c.order?.id ?? null,
      orderNumber: c.order?.orderNumber ?? null,
      actorLabel: null,
      cursor: encodeTimelineCursor(c.createdAt, c.id),
    })),
    ...tasks.map((t) => ({
      type: "task" as const,
      id: t.id,
      createdAt: t.createdAt,
      title: `مهمة ${t.type}: ${t.status}`,
      detail: t.priority === "high" ? "أولوية عالية" : null,
      orderId: t.order?.id ?? null,
      orderNumber: t.order?.orderNumber ?? null,
      actorLabel: t.completedBy?.fullName ?? null,
      cursor: encodeTimelineCursor(t.createdAt, t.id),
    })),
  ];

  // الدمج الحتمي النهائي — نفس مفتاح الترتيب المعماري (createdAt DESC, id DESC)
  entries.sort((a, b) => {
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  const page = entries.slice(0, pageSize);
  const hasMore = entries.length > pageSize;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? last.cursor : null;

  return { items: page, nextCursor };
}
