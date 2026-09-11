import { prisma } from "@/server/db/prisma";
import { redactForAudit } from "@/lib/redact";
import { writeAudit } from "@/server/services/auditService";
import { notifyOwner } from "@/lib/ownerNotify";
import type { Prisma } from "@prisma/client";

// خدمة تنبيهات النظام — الرفع آمن افتراضيًا (لا يرمي أبدًا: فشل رفع تنبيه لا يُسقط
// العملية التجارية التي استدعته)، والإقرار/الحل عمليات CAS حتمية موثّقة بwriteAudit.
// توحيد العرض: الصفوف التاريخية التي حُلَّت قبل عمود status تُقرأ "resolved" عبر
// resolvedAt غير الفارغ أيا كان نص status القديم فيها (تصحيح سلوك الـmigration).

export class AlertNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("التنبيه غير موجود");
    this.name = "AlertNotFoundError";
  }
}

export class AlertInvalidTransitionError extends Error {
  readonly code = "ALERT_INVALID_TRANSITION";

  constructor(status: string) {
    super(`لا يمكن تنفيذ هذا الانتقال — حالة التنبيه الحالية: ${status}`);
    this.name = "AlertInvalidTransitionError";
  }
}

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export type RaiseAlertInput = {
  type: string;
  severity?: AlertSeverity;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const BUSINESS_ALERT_TYPES = new Set(["low_stock", "login_rate_limited"]);

/** مثل raiseSystemAlert لكن بلا تكرار: لا يرفع شيئًا ما دام تنبيه مفتوح بنفس النوع
 * والكيان — للحالات المستمرة (مخزون منخفض، webhook معطّل) التي تتكرر مع كل طلب. */
export async function raiseSystemAlertOnce(input: RaiseAlertInput & { entityId: string }) {
  try {
    const open = await prisma.systemAlert.findFirst({
      where: { type: input.type, entityId: input.entityId, resolvedAt: null },
      select: { id: true },
    });
    if (open) return null;
  } catch {
    // فشل الفحص لا يمنع الرفع — تكرار نادر أهون من فقدان التنبيه
  }
  return raiseSystemAlert(input);
}

/** رفع تنبيه نظام — الـmetadata يُنقّح مركزيًا (redactForAudit) قبل الحفظ، ولا يرمي
 * أبدًا: أي فشل يُسجَّل بصوت عالٍ ويُرجَع null، والمُستدعي (outbox/cron/integrations)
 * يواصل عمله. التنبيهات القابلة للتكرار تُترك للمستهلك — كل تنبيه صف مستقل. */
export async function raiseSystemAlert(input: RaiseAlertInput) {
  try {
    const alert = await prisma.systemAlert.create({
      data: {
        type: input.type,
        severity: input.severity ?? "medium",
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata
          ? (redactForAudit(input.metadata) as Prisma.InputJsonValue)
          : undefined,
      },
    });
    // تبويب «الإشعارات»: «التنبيهات» = ما يخص التجارة (مخزون، دخول مشبوه)، «إشعارات
    // النظام» = الأعطال التقنية وحالة الخدمات المرتبطة. الإرسال لا ينتظره أحد ولا يرمي.
    const kind = BUSINESS_ALERT_TYPES.has(input.type) ? "alerts" : "system";
    void notifyOwner(kind, `${kind === "alerts" ? "⚠️" : "🛠️"} ${input.message}`);
    return alert;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "system_alert_raise_failed",
        type: input.type,
        entityId: input.entityId ?? null,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
    return null;
  }
}

function normalizedStatus(alert: { status: string; resolvedAt: Date | null }): AlertStatus {
  if (alert.resolvedAt !== null) return "resolved";
  return alert.status as AlertStatus;
}

/** الحالة الموحَّدة كشرط استعلام — الصفوف التاريخية (resolvedAt غير فارغ) تُطابق
 * فلتر resolved أيا كان نص status القديم، ولا تُطابق open/acknowledged أبدًا. */
function statusWhere(status?: AlertStatus): Prisma.SystemAlertWhereInput {
  if (!status) return {};
  if (status === "resolved") {
    return { OR: [{ status: "resolved" }, { resolvedAt: { not: null } }] };
  }
  return { status, resolvedAt: null };
}

export type AlertListItem = {
  id: string;
  type: string;
  severity: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Prisma.JsonValue;
  status: AlertStatus;
  acknowledgedAt: Date | null;
  acknowledgedByName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByName: string | null;
};

/** قائمة التنبيهات — bounded، مرتبة بالأحدث أولًا على فهارس (status, createdAt). */
export async function listAlerts(params: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  type?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AlertListItem[]; total: number }> {
  const where: Prisma.SystemAlertWhereInput = {
    ...statusWhere(params.status),
    ...(params.severity ? { severity: params.severity } : {}),
    ...(params.type ? { type: params.type } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.systemAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        acknowledgedBy: { select: { fullName: true } },
        resolvedBy: { select: { fullName: true } },
      },
    }),
    prisma.systemAlert.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      message: row.message,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      status: normalizedStatus(row),
      acknowledgedAt: row.acknowledgedAt,
      acknowledgedByName: row.acknowledgedBy?.fullName ?? null,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      resolvedByName: row.resolvedBy?.fullName ?? null,
    })),
    total,
  };
}

/** إقرار التنبيه — CAS من open حصرًا؛ التوثيق بفاعل ووقت عبر writeAudit. */
export async function acknowledgeAlert(id: string, actorId: string) {
  const updated = await prisma.systemAlert.updateMany({
    where: { id, status: "open", resolvedAt: null },
    data: { status: "acknowledged", acknowledgedAt: new Date(), acknowledgedById: actorId },
  });
  if (updated.count === 0) {
    const alert = await prisma.systemAlert.findUnique({
      where: { id },
      select: { status: true, resolvedAt: true },
    });
    if (!alert) throw new AlertNotFoundError();
    throw new AlertInvalidTransitionError(normalizedStatus(alert));
  }

  await writeAudit({
    actorType: "admin",
    actorId,
    action: "alert_acknowledge",
    entityType: "system_alert",
    entityId: id,
    after: { status: "acknowledged" },
  });
}

/** حل التنبيه — CAS من open أو acknowledged (الحل المباشر مشروع)؛ توثيق كالإقرار. */
export async function resolveAlert(id: string, actorId: string) {
  const updated = await prisma.systemAlert.updateMany({
    where: { id, status: { in: ["open", "acknowledged"] }, resolvedAt: null },
    data: { status: "resolved", resolvedAt: new Date(), resolvedById: actorId },
  });
  if (updated.count === 0) {
    const alert = await prisma.systemAlert.findUnique({
      where: { id },
      select: { status: true, resolvedAt: true },
    });
    if (!alert) throw new AlertNotFoundError();
    throw new AlertInvalidTransitionError(normalizedStatus(alert));
  }

  await writeAudit({
    actorType: "admin",
    actorId,
    action: "alert_resolve",
    entityType: "system_alert",
    entityId: id,
    after: { status: "resolved" },
  });
}
