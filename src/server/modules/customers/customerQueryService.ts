import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";
import { normalizeAlgerianPhone, maskPhoneForDisplay } from "@/lib/phone";
import { getCustomerMetrics } from "@/server/modules/customers/customerMetricsService";
import { getCustomerTimeline, type TimelineEntry } from "@/server/modules/customers/customerTimelineService";

// ===========================================================================
// استعلامات العملاء — مصدر واحد تستهلكه صفحة الأدمن وواجهة الـAPI معًا
// ===========================================================================
// وجود نسختين من نفس الاستعلام (صفحة + route) هو أسرع طريق لاختلاف الأرقام
// والترتيب بين الشاشتين، فالاستعلام يعيش هنا حصرًا.
//
// الترتيب حتمي دائمًا: مفتاح العمل ثم id كـtie-breaker — بلا هذا تتذبذب
// الصفحات عند تساوي المفتاح. الحجم محدود دائمًا (PAGE_SIZE_MAX) — لا استعلام
// بلا سقف مهما طلب المستدعي.
// الهاتف يُبحَث في customer_phones (الهوية الرسمية) لا في primaryPhone وحده،
// فالهواتف البديلة جزء من هوية العميل نفسها.
// isTest: العملاء لا يُنشأون من طلبات isTest أصلًا (قيد قاعدة بيانات)، وكل
// حساب مالي هنا يمر عبر getCustomerMetrics الذي يفلتره صراحة.

export const CUSTOMERS_PAGE_SIZE_DEFAULT = 20;
export const CUSTOMERS_PAGE_SIZE_MAX = 100;

export type CustomerListFilters = {
  search?: string | null;
  riskLevel?: string | null;
  status?: string | null;
  segment?: string | null;
};

export type CustomerListItem = {
  id: string;
  fullName: string;
  phoneMasked: string;
  commune: string | null;
  status: string;
  riskLevel: string;
  riskScore: number;
  ordersCount: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  segments: string[];
};

export function buildCustomerListWhere(filters: CustomerListFilters): Prisma.CustomerWhereInput {
  const search = filters.search?.trim();
  const and: Prisma.CustomerWhereInput[] = [];

  if (search) {
    const phone = normalizeAlgerianPhone(search);
    and.push({
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        ...(phone
          ? [
              { primaryPhone: phone } as Prisma.CustomerWhereInput,
              { phones: { some: { phoneNormalized: phone } } } as Prisma.CustomerWhereInput,
            ]
          : []),
      ],
    });
  }
  if (filters.riskLevel) and.push({ riskLevel: filters.riskLevel as never });
  if (filters.status) and.push({ status: filters.status as never });
  if (filters.segment) and.push({ segments: { some: { segment: filters.segment as never } } });

  return and.length > 0 ? { AND: and } : {};
}

export async function listCustomers(params: {
  filters?: CustomerListFilters;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: CustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    Math.max(1, Math.trunc(params.pageSize ?? CUSTOMERS_PAGE_SIZE_DEFAULT)),
    CUSTOMERS_PAGE_SIZE_MAX,
  );
  const where = buildCustomerListWhere(params.filters ?? {});

  // استعلامان فقط مهما بلغ حجم الصفحة — العدّادات والقطاعات ضمن نفس الجلب (بلا N+1)
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        primaryPhone: true,
        commune: true,
        status: true,
        riskLevel: true,
        riskScore: true,
        firstOrderAt: true,
        lastOrderAt: true,
        segments: { select: { segment: true, isPrimary: true } },
        _count: { select: { orders: { where: { isTest: false } } } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      phoneMasked: maskPhoneForDisplay(row.primaryPhone),
      commune: row.commune,
      status: row.status,
      riskLevel: row.riskLevel,
      riskScore: row.riskScore,
      ordersCount: row._count.orders,
      firstOrderAt: row.firstOrderAt,
      lastOrderAt: row.lastOrderAt,
      // الأساسي أولًا ليقرأه العرض مباشرة بلا ترتيب إضافي
      segments: [...row.segments]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((s) => s.segment),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const CUSTOMER_360_ORDERS_LIMIT = 50;

export type Customer360 = Awaited<ReturnType<typeof getCustomer360>>;

/** Customer 360 — كل الأرقام المالية من metrics/definitions.ts حصرًا عبر
 * getCustomerMetrics؛ لا حساب مالي هنا. الطلبات من اللقطات التاريخية
 * (totalDzd المخزّن) لا من أسعار المنتجات الحالية. */
export async function getCustomer360(params: { customerId: string; timelineCursor?: string | null }) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.customerId },
    select: {
      id: true,
      fullName: true,
      primaryPhone: true,
      status: true,
      wilayaCode: true,
      commune: true,
      address: true,
      customerNote: true,
      notesInternal: true,
      tags: true,
      riskScore: true,
      riskLevel: true,
      riskFactors: true,
      riskCalculatedAt: true,
      riskEngineVersion: true,
      firstOrderAt: true,
      lastOrderAt: true,
      createdAt: true,
      phones: {
        select: { phoneNormalized: true, phoneType: true, isVerified: true },
        orderBy: [{ phoneType: "asc" }, { phoneNormalized: "asc" }],
      },
      segments: {
        select: { segment: true, isPrimary: true, computedAt: true },
        orderBy: [{ segment: "asc" }],
      },
    },
  });
  if (!customer) return null;

  const [metrics, orders, fraudSignals, timeline, mergeHistory] = await Promise.all([
    getCustomerMetrics(params.customerId),
    prisma.order.findMany({
      where: { customerId: params.customerId, isTest: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CUSTOMER_360_ORDERS_LIMIT,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalDzd: true,
        itemsSubtotalDzd: true,
        deliveryPriceDzd: true,
        discountDzd: true,
        createdAt: true,
        deliveredAt: true,
        returnedAt: true,
        codCollectedAt: true,
      },
    }),
    prisma.fraudSignal.findMany({
      where: { customerId: params.customerId },
      orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        signal: true,
        severity: true,
        status: true,
        detectedAt: true,
        engineVersion: true,
      },
    }),
    getCustomerTimeline({ customerId: params.customerId, cursor: params.timelineCursor ?? null }),
    prisma.customerMerge.findMany({
      where: { OR: [{ survivorId: params.customerId }, { mergedId: params.customerId }] },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      select: { id: true, survivorId: true, mergedId: true, createdAt: true },
    }),
  ]);

  return {
    customer: {
      ...customer,
      phoneMasked: maskPhoneForDisplay(customer.primaryPhone),
      phones: customer.phones.map((p) => ({
        phoneMasked: maskPhoneForDisplay(p.phoneNormalized),
        phoneType: p.phoneType,
        isVerified: p.isVerified,
      })),
    },
    metrics,
    orders,
    fraudSignals,
    timeline: timeline.items as TimelineEntry[],
    timelineNextCursor: timeline.nextCursor,
    mergeHistory,
  };
}
