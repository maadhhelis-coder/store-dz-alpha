import { prisma } from "@/server/db/prisma";
import { writeAudit } from "@/server/services/auditService";
import { maskPhoneForDisplay } from "@/lib/phone";

// استعلامات إشارات الاحتيال ومراجعتها — مصدر واحد يخدم الـroutes.
// الترتيب حتمي (detectedAt DESC ثم id DESC) والحجم مسقوف دائمًا.
// الهاتف يُعاد مقنّعًا كما في بقية شاشات CRM.

export class FraudSignalNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("إشارة الاحتيال غير موجودة أو مراجَعة مسبقًا");
    this.name = "FraudSignalNotFoundError";
  }
}

export async function listFraudSignals(params: {
  status?: "open" | "reviewed" | "dismissed";
  severity?: "low" | "medium" | "high";
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.fraudSignal.findMany({
      where,
      orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        signal: true,
        severity: true,
        status: true,
        evidence: true,
        engineVersion: true,
        detectedAt: true,
        reviewedAt: true,
        reviewReason: true,
        customer: { select: { id: true, fullName: true, primaryPhone: true, riskLevel: true } },
      },
    }),
    prisma.fraudSignal.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      customer: row.customer
        ? {
            id: row.customer.id,
            fullName: row.customer.fullName,
            phoneMasked: maskPhoneForDisplay(row.customer.primaryPhone),
            riskLevel: row.customer.riskLevel,
          }
        : null,
    })),
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** قرار المراجعة — CAS على الحالة المفتوحة: مراجعة مزدوجة مرفوضة حتميًا،
 * ولا يُمس أي طلب (تغيير حالة الطلب يمر بآلة الحالات وحدها). */
export async function reviewFraudSignal(input: {
  signalId: string;
  status: "reviewed" | "dismissed";
  reason: string;
  actorId: string;
}) {
  const updated = await prisma.fraudSignal.updateMany({
    where: { id: input.signalId, status: "open" },
    data: {
      status: input.status,
      reviewedById: input.actorId,
      reviewReason: input.reason,
      reviewedAt: new Date(),
    },
  });
  if (updated.count === 0) throw new FraudSignalNotFoundError();

  await writeAudit({
    actorType: "admin",
    actorId: input.actorId,
    action: "fraud_signal_reviewed",
    entityType: "fraud_signal",
    entityId: input.signalId,
    before: { status: "open" },
    after: { status: input.status },
    reason: input.reason,
  });

  return { signalId: input.signalId, status: input.status };
}
