import { prisma } from "@/server/db/prisma";
import { redactForAudit } from "@/lib/redact";
import type { Prisma, AuditLog } from "@prisma/client";

// خدمة السجل التدقيقي — إلحاقي فقط (append-only): لا API للتعديل أو الحذف إطلاقًا.
// قبل/بعد يُمرَّران خام ويُنقَّحان مركزيًا هنا (لا يثق بأي مستدعٍ أن ينقّح بنفسه).
// الأنواع المرجعية نصية بلا FK كي يبقى السجل شاهدًا بعد أي حذف لاحق للصفوف.

export type AuditActorType = "admin" | "system" | "api" | "carrier";

export type WriteAuditInput = {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  correlationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** إلحاق سجل تدقيق مستقل (خارج معاملة) — للأحداث غير الحرجة حرجة الأداء. */
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  try {
    await auditLogCreate(input);
  } catch (error) {
    // فشل كتابة السجل لا يُسقط العملية التجارية أبدًا، لكنه يُسجَّل بصوت عالٍ —
    // نمط fail-open الموثّق نفسه المعتمد في safeRateLimit مع SystemAlert.
    console.error(
      JSON.stringify({
        event: "audit_write_failed",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/** إلحاق سجل تدقيق داخل نفس معاملة العملية التجارية (إلزامي للعمليات المالية
 * وتغييرات الحالة — التسجيل والعملية يلتزمان معًا أو تُلغيان معًا). */
export function writeAuditInTx(tx: Prisma.TransactionClient, input: WriteAuditInput): Prisma.PrismaPromise<AuditLog> {
  return auditLogCreateInternal(tx, input);
}

async function auditLogCreate(input: WriteAuditInput) {
  return auditLogCreateInternal(prisma, input);
}

function auditLogCreateInternal(db: Prisma.TransactionClient | typeof prisma, input: WriteAuditInput) {
  return db.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before === undefined ? undefined : (redactForAudit(input.before) as Prisma.InputJsonValue),
      after: input.after === undefined ? undefined : (redactForAudit(input.after) as Prisma.InputJsonValue),
      reason: input.reason ?? null,
      correlationId: input.correlationId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

/** قراءة السجل — يتطلب صلاحية audit.read على مستوى الـroute (guard خارجي). */
export async function listAuditLogs(params: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.AuditLogWhereInput = {
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.entityId ? { entityId: params.entityId } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.action ? { action: params.action } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      // فاصل تعادل بالـid: بدونه صفّان بنفس الطابع الزمني يتذبذب ترتيبهما بين
      // الصفحات فيتكرر صف ويختفي آخر — نفس سياسة الترتيب الحتمي في بقية الخدمات.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}
