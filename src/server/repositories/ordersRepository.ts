import { prisma } from "@/server/db/prisma";
import type { OrderStatus, Prisma } from "@prisma/client";

export type OrdersFilter = {
  status?: OrderStatus;
  wilayaCode?: number;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
};

export type ListOrdersParams = OrdersFilter & {
  page: number;
  pageSize: number;
};

const orderWithItems = {
  include: { items: true, wilaya: true },
} satisfies Prisma.OrderDefaultArgs;

function buildOrdersWhere(params: OrdersFilter): Prisma.OrderWhereInput {
  return {
    ...(params.status ? { status: params.status } : {}),
    ...(params.wilayaCode ? { wilayaCode: params.wilayaCode } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {}),
    ...(params.search
      ? {
          OR: [
            { phone: { contains: params.search } },
            { orderNumber: { contains: params.search, mode: "insensitive" } },
            { customerFirstName: { contains: params.search, mode: "insensitive" } },
            { customerLastName: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listOrders(params: ListOrdersParams) {
  const where = buildOrdersWhere(params);

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      ...orderWithItems,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  const duplicateIds = await findDuplicateOrderIds(items);
  const itemsWithDuplicateFlag = items.map((order) => ({
    ...order,
    isDuplicateSuspect: duplicateIds.has(order.id),
  }));

  return { items: itemsWithDuplicateFlag, total };
}

// معرّفات كل الطلبات المطابقة للفلتر (بلا حد صفحة) — تخدم "تحديد الكل" الجماعي فالواجهة،
// بحد أقصى أمان يطابق سقف bulkUpdateOrderStatus (200) حتى لا يُرسل طلب تحديث ضخم بلا داعٍ.
const MAX_BULK_SELECTABLE = 200;

export async function listOrderIds(filter: OrdersFilter): Promise<{ ids: string[]; total: number }> {
  const where = buildOrdersWhere(filter);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_BULK_SELECTABLE,
    }),
    prisma.order.count({ where }),
  ]);
  return { ids: rows.map((r) => r.id), total };
}

const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;

// يعلّم الطلبات التي يُحتمل تكرارها: نفس رقم الهاتف + نفس المنتج خلال 48 ساعة —
// مؤشر شائع لزبون طلب مرتين بالخطأ (نقر مضاعف، إعادة إرسال النموذج) أو طلب وهمي مكرر.
// مجرد تنبيه بصري للمؤكِّد، لا يمنع أو يغيّر أي طلب تلقائيًا.
async function findDuplicateOrderIds(
  orders: Array<{ id: string; phone: string; createdAt: Date; items: { productSlugSnapshot: string }[] }>,
): Promise<Set<string>> {
  if (orders.length === 0) return new Set();

  const phones = Array.from(new Set(orders.map((o) => o.phone)));
  const timestamps = orders.map((o) => o.createdAt.getTime());
  const minDate = new Date(Math.min(...timestamps) - DUPLICATE_WINDOW_MS);
  const maxDate = new Date(Math.max(...timestamps) + DUPLICATE_WINDOW_MS);

  const candidates = await prisma.order.findMany({
    where: { phone: { in: phones }, createdAt: { gte: minDate, lte: maxDate } },
    select: { id: true, phone: true, createdAt: true, items: { select: { productSlugSnapshot: true } } },
  });

  const duplicateIds = new Set<string>();
  for (const order of orders) {
    const orderSlugs = new Set(order.items.map((i) => i.productSlugSnapshot));
    const hasDuplicate = candidates.some(
      (c) =>
        c.id !== order.id &&
        c.phone === order.phone &&
        Math.abs(c.createdAt.getTime() - order.createdAt.getTime()) <= DUPLICATE_WINDOW_MS &&
        c.items.some((i) => orderSlugs.has(i.productSlugSnapshot)),
    );
    if (hasDuplicate) duplicateIds.add(order.id);
  }
  return duplicateIds;
}

export function findOrderById(id: string) {
  return prisma.order.findUnique({ where: { id }, ...orderWithItems });
}

// confirmedAt يُسجَّل عند التأكيد، ويبقى محفوظًا عبر التقدّم الطبيعي بعدها (shipped/delivered/
// returned — طلب أُرجِع كان بالضرورة مؤكَّدًا ومُسلَّمًا قبل ذلك، فهي حقيقة تاريخية لا تُمحى)
// لأنه يمثّل "متى تأكد الطلب فعليًا" — لكن يُصفَّر عند رجوع الحالة فعليًا عن التأكيد (مثلاً
// إلغاء طلب كان مؤكَّدًا)، وإلا يبقى تحليل "زمن التأكيد" مشوّهًا بتواريخ قديمة غير صحيحة.
const DOWNSTREAM_OF_CONFIRMED: OrderStatus[] = ["confirmed", "shipped", "delivered", "returned"];

// مُصدَّرة أيضًا لأن ordersService.ts تحتاجها عند بناء تحديث الحالة يدويًا داخل معاملة
// (Transaction) خاصة بتعديل المخزون — بدل تكرار نفس المنطق فمكانين قد ينحرفان لاحقًا.
export function confirmedAtUpdate(status: OrderStatus) {
  if (status === "confirmed") return { confirmedAt: new Date() };
  if (DOWNSTREAM_OF_CONFIRMED.includes(status)) return {};
  return { confirmedAt: null };
}

// نفس منطق confirmedAt أعلاه لكل من deliveredAt/cancelledAt/returnedAt — تُستعمل لمقاييس
// الأداء الحقيقية حسب الفترة الزمنية الفعلية (لوحة الأداء الشاملة) بدل الاعتماد على createdAt
// وحده الذي قد يعكس تاريخ إنشاء الطلب لا تاريخ تسليمه/إلغائه/إرجاعه الفعلي.
//
// deliveredAt يبقى محفوظًا عند الانتقال لاحقًا إلى returned (الطلب "تم تسليمه فعليًا" ثم
// أُرجِع — حقيقة تاريخية منفصلة عن كونه مُرجَعًا الآن)، تمامًا كمنطق confirmedAt مع shipped/
// delivered أعلاه.
const DOWNSTREAM_OF_DELIVERED: OrderStatus[] = ["delivered", "returned"];

export function deliveredAtUpdate(status: OrderStatus) {
  if (status === "delivered") return { deliveredAt: new Date() };
  if (DOWNSTREAM_OF_DELIVERED.includes(status)) return {};
  return { deliveredAt: null };
}

export function cancelledAtUpdate(status: OrderStatus) {
  if (status === "cancelled") return { cancelledAt: new Date() };
  return { cancelledAt: null };
}

export function returnedAtUpdate(status: OrderStatus) {
  if (status === "returned") return { returnedAt: new Date() };
  return { returnedAt: null };
}

// حالات "يحتاج إعادة اتصال" — كل مرة يتحول الطلب لإحداها تُزاد callAttempts تلقائيًا،
// فيعرف المؤكِّد كم مرة حاول الاتصال بهذا الزبون بدل الاعتماد على الذاكرة فقط.
const CALLBACK_STATUSES: OrderStatus[] = ["callback", "no_answer", "voicemail"];

export function callAttemptsUpdate(status: OrderStatus) {
  return CALLBACK_STATUSES.includes(status) ? { callAttempts: { increment: 1 } } : {};
}

export function updateOrderStatus(id: string, status: OrderStatus, notes?: string) {
  return prisma.order.update({
    where: { id },
    data: {
      status,
      ...(notes !== undefined ? { notes } : {}),
      ...confirmedAtUpdate(status),
      ...deliveredAtUpdate(status),
      ...cancelledAtUpdate(status),
      ...returnedAtUpdate(status),
      ...callAttemptsUpdate(status),
    },
    ...orderWithItems,
  });
}

export function updateOrderFields(
  id: string,
  data: Pick<
    Prisma.OrderUpdateInput,
    | "customerFirstName"
    | "customerLastName"
    | "phone"
    | "commune"
    | "address"
    | "notes"
    | "courierProvider"
    | "courierTrackingId"
    | "courierStatus"
    | "nextCallAt"
  >,
) {
  return prisma.order.update({ where: { id }, data });
}
