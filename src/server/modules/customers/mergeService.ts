import { prisma } from "@/server/db/prisma";
import { executeIdempotent } from "@/server/modules/idempotency/durableIdempotency";
import { writeAudit } from "@/server/services/auditService";
import { recomputeCustomerSegments } from "@/server/modules/customers/segmentationService";
import { CustomerStatus, type Prisma } from "@prisma/client";

// ===========================================================================
// Customer Merge / Unmerge — وفق Blueprint (قفل تصاعدي، manifest غير قابل
// للتعديل، نقل ذري، idempotency، وأمان فشل حتمي عند أي تعارض)
// ===========================================================================
// قواعد مقفلة:
// - القفل بترتيب id تصاعديًا حصرًا (SELECT FOR UPDATE) — منع deadlocks حتميًا.
// - هواتف customer_phones فريدة عالميًا → نقلها للـsurvivor يجعل المدموج
//   مستحيل المطابقة تلقائيًا، وكل الكتابات الجديدة (بنفس الأرقام) تذهب
//   للـsurvivor حصرًا بعد الدمج.
// - التعارض (هاتف متطابق نصيًا، عميل غير نشط، سباق دمج) → فشل آمن بلا أي نقل
//   جزئي (المعاملة تُلغى كاملة) + 409 حتمي للمستدعي.
// - الـmanifest (idMap) يخزن هويات كل علاقة منقولة — الـunmerge يستعيد هذه
//   الحصرًا؛ البيانات الجديدة post-merge تبقى مع الـsurvivor دائمًا.
// - manifest غير قابل للتعديل: لا API كتابة بعد الإنشاء إطلاقًا.

export class CustomerMergeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CustomerMergeError";
    this.code = code;
  }
}

const RELATION_TABLES = [
  "orders",
  "confirmationAttempts",
  "tasks",
  "communications",
  "financialAdjustments",
  "fraudSignals",
] as const;

type RelationTable = (typeof RELATION_TABLES)[number];

type MergeManifest = {
  version: 1;
  movedPhoneIds: string[];
  movedRelationIds: Record<RelationTable, string[]>;
  mergedSnapshot: {
    id: string;
    fullName: string;
    primaryPhone: string;
    status: string;
    tags: string[];
    customerNote: string | null;
  };
};

async function lockCustomersInTx(
  tx: Prisma.TransactionClient,
  ids: [string, string],
): Promise<void> {
  // قفل صفين بترتيب id تصاعدي — نفس الترتيب في كل مسار استدعاء = لا deadlocks
  const sorted = [...ids].sort();
  await tx.$queryRaw`
    SELECT id FROM customers WHERE id IN (${sorted[0]}, ${sorted[1]}) ORDER BY id ASC FOR UPDATE
  `;
}

/** دمج عميلين — survivor يستقبل كل العلاقات والهواتف؛ المدموج يُؤرشف.
 * idempotent بمفتاح العميل؛ سباق دمج نفس الزوج (بأي ترتيب) → فائز واحد
 * والثاني 409 حتميًا. */
export async function mergeCustomers(input: {
  survivorId: string;
  mergedId: string;
  actorId: string;
  reason?: string | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
}): Promise<{ mergeId: string; movedCounts: Record<string, number> }> {
  if (input.survivorId === input.mergedId) {
    throw new CustomerMergeError("SAME_CUSTOMER", "لا يمكن دمج العميل مع نفسه");
  }

  const execute = () =>
    prisma.$transaction(async (tx) => {
      // 1) قفل بترتيب تصاعدي ثم قراءة حديثة داخل القفل
      await lockCustomersInTx(tx, [input.survivorId, input.mergedId]);
      const [survivor, merged] = await Promise.all([
        tx.customer.findUnique({ where: { id: input.survivorId } }),
        tx.customer.findUnique({ where: { id: input.mergedId } }),
      ]);

      if (!survivor || !merged) {
        throw new CustomerMergeError("NOT_FOUND", "أحد العميلين غير موجود");
      }
      if (survivor.status !== "active") {
        throw new CustomerMergeError(
          "SURVIVOR_NOT_ACTIVE",
          `العميل المستقبِل غير نشط (حالته: ${survivor.status})`,
        );
      }
      if (merged.status !== "active") {
        throw new CustomerMergeError(
          "MERGED_NOT_ACTIVE",
          `العميل المراد دمجه غير نشط (حالته: ${merged.status}) — مدموج/مؤرشف مسبقًا`,
        );
      }
      // دفاعية تعارض الهاتف: تطابق نصي للأساسي (لا يحدث عبر المطابقة الطبيعية —
      // customer_phones فريد عالميًا — لكن القاعدة الأمنية: تعارض = فشل بلا دمج تلقائي)
      if (survivor.primaryPhone === merged.primaryPhone) {
        throw new CustomerMergeError(
          "PHONE_COLLISION",
          "تعارض هاتف أساسي بين العميلين — دمج يدوي مطلوب",
        );
      }

      // 2) جمع هويات العلاقات المنقولة (للـmanifest — أساس الـunmerge الحصرم)
      const [orders, attempts, tasks, communications, adjustments, fraudSignals, phones] =
        await Promise.all([
          tx.order.findMany({ where: { customerId: merged.id }, select: { id: true } }),
          tx.confirmationAttempt.findMany({ where: { customerId: merged.id }, select: { id: true } }),
          tx.task.findMany({ where: { customerId: merged.id }, select: { id: true } }),
          tx.communication.findMany({ where: { customerId: merged.id }, select: { id: true } }),
          tx.financialAdjustment.findMany({ where: { customerId: merged.id }, select: { id: true } }),
          tx.fraudSignal.findMany({ where: { customerId: merged.id }, select: { id: true } }),
          tx.customerPhone.findMany({ where: { customerId: merged.id }, select: { id: true } }),
        ]);

      const movedRelationIds = {
        orders: orders.map((r) => r.id),
        confirmationAttempts: attempts.map((r) => r.id),
        tasks: tasks.map((r) => r.id),
        communications: communications.map((r) => r.id),
        financialAdjustments: adjustments.map((r) => r.id),
        fraudSignals: fraudSignals.map((r) => r.id),
      };

      const manifest: MergeManifest = {
        version: 1,
        movedPhoneIds: phones.map((p) => p.id),
        movedRelationIds,
        mergedSnapshot: {
          id: merged.id,
          fullName: merged.fullName,
          primaryPhone: merged.primaryPhone,
          status: merged.status,
          tags: merged.tags,
          customerNote: merged.customerNote,
        },
      };

      // 3) النقل الذري — كل شيء داخل نفس المعاملة (فشل واحد = إلغاء كامل)
      // الهواتف الأساسية المنقولة تُخفَّض لبديلة — survivor يحتفظ بأساسيه حصرًا
      await tx.customerPhone.updateMany({
        where: { id: { in: manifest.movedPhoneIds } },
        data: { customerId: survivor.id, phoneType: "alternative" },
      });

      await tx.order.updateMany({
        where: { id: { in: movedRelationIds.orders } },
        data: { customerId: survivor.id },
      });
      await tx.confirmationAttempt.updateMany({
        where: { id: { in: movedRelationIds.confirmationAttempts } },
        data: { customerId: survivor.id },
      });
      await tx.task.updateMany({
        where: { id: { in: movedRelationIds.tasks } },
        data: { customerId: survivor.id },
      });
      await tx.communication.updateMany({
        where: { id: { in: movedRelationIds.communications } },
        data: { customerId: survivor.id },
      });
      await tx.financialAdjustment.updateMany({
        where: { id: { in: movedRelationIds.financialAdjustments } },
        data: { customerId: survivor.id },
      });
      await tx.fraudSignal.updateMany({
        where: { id: { in: movedRelationIds.fraudSignals } },
        data: { customerId: survivor.id },
      });

      // قطع customer_segments للمدموج (فريد لكل عميل×نوع — إعادة الحساب تعيد
      // بناء survivor) وتحديث الطوابع الزمنية المجمعة على survivor
      await tx.customerSegment.deleteMany({ where: { customerId: merged.id } });

      const earliestOrder = await tx.order.findFirst({
        where: { customerId: survivor.id },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      await tx.customer.update({
        where: { id: merged.id },
        data: { status: "archived", tags: [], customerNote: null },
      });
      await tx.customer.update({
        where: { id: survivor.id },
        data: {
          firstOrderAt: earliestOrder?.createdAt ?? survivor.firstOrderAt,
          lastOrderAt: survivor.lastOrderAt,
        },
      });

      // 4) manifest غير قابل للتعديل — صف واحد إلحاقي فقط
      const mergeRecord = await tx.customerMerge.create({
        data: {
          survivorId: survivor.id,
          mergedId: merged.id,
          idMap: manifest as unknown as Prisma.InputJsonValue,
          performedBy: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: input.actorId,
          action: "customer_merge",
          entityType: "customer",
          entityId: survivor.id,
          after: {
            mergeId: mergeRecord.id,
            survivorId: survivor.id,
            mergedId: merged.id,
            movedCounts: {
              orders: movedRelationIds.orders.length,
              confirmationAttempts: movedRelationIds.confirmationAttempts.length,
              tasks: movedRelationIds.tasks.length,
              communications: movedRelationIds.communications.length,
              financialAdjustments: movedRelationIds.financialAdjustments.length,
              fraudSignals: movedRelationIds.fraudSignals.length,
              phones: manifest.movedPhoneIds.length,
            },
          },
          reason: input.reason ?? null,
          correlationId: input.correlationId ?? null,
        },
      });

      const movedCounts = {
        orders: movedRelationIds.orders.length,
        confirmationAttempts: movedRelationIds.confirmationAttempts.length,
        tasks: movedRelationIds.tasks.length,
        communications: movedRelationIds.communications.length,
        financialAdjustments: movedRelationIds.financialAdjustments.length,
        fraudSignals: movedRelationIds.fraudSignals.length,
        phones: manifest.movedPhoneIds.length,
      };
      return { mergeId: mergeRecord.id, survivorId: survivor.id, movedCounts };
    });

  const result = input.idempotencyKey
    ? (
        await executeIdempotent(
          {
            actorId: input.actorId,
            operation: "customer.merge",
            idempotencyKey: input.idempotencyKey,
            payload: { survivorId: input.survivorId, mergedId: input.mergedId },
          },
          execute,
        )
      ).value
    : await execute();

  // إعادة حساب قطع الـsurvivor بعد الدمج — خارج المعاملة (fire-and-forget آمن)
  await recomputeCustomerSegments(input.survivorId).catch(() => {});

  return { mergeId: result.mergeId, movedCounts: result.movedCounts };
}

/** فصل دمج — يستعيد حصرًا العلاقات الموجودة في الـmanifest ولا يلمس أي بيانات
 * جديدة post-merge (تبقى مع الـsurvivor). أي تعارض = فشل آمن + مهمة مراجعة يدوية. */
export async function unmergeCustomer(input: {
  mergedId: string;
  actorId: string;
  reason?: string | null;
  correlationId?: string | null;
}): Promise<{ restoredCounts: Record<string, number> }> {
  const result = await prisma.$transaction(async (tx) => {
    // قراءة أولية لتحديد الطرفين ثم قفلهما بترتيب تصاعدي (نفس نمط الدمج)
    const preRecord = await tx.customerMerge.findFirst({
      where: { mergedId: input.mergedId },
      orderBy: { createdAt: "desc" },
    });
    if (!preRecord) {
      throw new CustomerMergeError("NO_MERGE_RECORD", "لا يوجد سجل دمج لهذا العميل");
    }
    await lockCustomersInTx(tx, [preRecord.survivorId, input.mergedId]);

    const mergeRecord = await tx.customerMerge.findFirst({
      where: { mergedId: input.mergedId },
      orderBy: { createdAt: "desc" },
    });
    if (!mergeRecord) {
      throw new CustomerMergeError("NO_MERGE_RECORD", "لا يوجد سجل دمج لهذا العميل");
    }

    const [survivor, merged] = await Promise.all([
      tx.customer.findUnique({ where: { id: mergeRecord.survivorId } }),
      tx.customer.findUnique({ where: { id: input.mergedId } }),
    ]);
    if (!survivor || !merged) {
      throw new CustomerMergeError("NOT_FOUND", "أحد الطرفين غير موجود");
    }
    if (merged.status !== "archived") {
      // فصل مسبقًا (idempotent بالرفض) أو عميل غير ناتج عن دمج — فشل آمن
      throw new CustomerMergeError("ALREADY_RESTORED", "العميل غير في حالة دمج قائمة");
    }
    if (survivor.status !== "active") {
      throw new CustomerMergeError(
        "SURVIVOR_NOT_ACTIVE",
        "العميل المستقبِل غير نشط — فصل غير آمن، مراجعة يدوية مطلوبة",
      );
    }

    const manifest = mergeRecord.idMap as unknown as MergeManifest;
    if (manifest.version !== 1) {
      throw new CustomerMergeError("UNKNOWN_MANIFEST", "نسخة manifest غير معروفة");
    }

    // الاستعادة الحصرية: العلاقات المذكورة في الـmanifest والتي ما تزال على
    // الـsurvivor فعلًا — أي عدّاد غير مطابق = تعارض (بيانات انتقلت/حُذفت
    // post-merge) → فشل آمن بلا نقل جزئي (المعاملة تُلغى)
    const restoredCounts: Record<string, number> = {};
    const verifyAllOnSurvivor = async (
      table: RelationTable,
      count: (where: { id: { in: string[] }; customerId: string }) => Promise<number>,
    ) => {
      const ids = manifest.movedRelationIds[table];
      const onSurvivor = await count({ id: { in: ids }, customerId: survivor.id });
      if (onSurvivor !== ids.length) {
        throw new CustomerMergeError(
          "UNMERGE_CONFLICT",
          `تعارض أثناء الفصل في ${table}: ${ids.length - onSurvivor} علاقة لم تعد على الـsurvivor`,
        );
      }
      return ids;
    };

    const orderIds = await verifyAllOnSurvivor("orders", (w) =>
      tx.order.count({ where: w }),
    );
    const attemptIds = await verifyAllOnSurvivor("confirmationAttempts", (w) =>
      tx.confirmationAttempt.count({ where: w }),
    );
    const taskIds = await verifyAllOnSurvivor("tasks", (w) => tx.task.count({ where: w }));
    const communicationIds = await verifyAllOnSurvivor("communications", (w) =>
      tx.communication.count({ where: w }),
    );
    const adjustmentIds = await verifyAllOnSurvivor("financialAdjustments", (w) =>
      tx.financialAdjustment.count({ where: w }),
    );
    const fraudIds = await verifyAllOnSurvivor("fraudSignals", (w) =>
      tx.fraudSignal.count({ where: w }),
    );

    const [rOrders, rAttempts, rTasks, rComms, rAdjustments, rFraud] = await Promise.all([
      tx.order.updateMany({ where: { id: { in: orderIds } }, data: { customerId: merged.id } }),
      tx.confirmationAttempt.updateMany({
        where: { id: { in: attemptIds } },
        data: { customerId: merged.id },
      }),
      tx.task.updateMany({ where: { id: { in: taskIds } }, data: { customerId: merged.id } }),
      tx.communication.updateMany({
        where: { id: { in: communicationIds } },
        data: { customerId: merged.id },
      }),
      tx.financialAdjustment.updateMany({
        where: { id: { in: adjustmentIds } },
        data: { customerId: merged.id },
      }),
      tx.fraudSignal.updateMany({ where: { id: { in: fraudIds } }, data: { customerId: merged.id } }),
    ]);
    restoredCounts.orders = rOrders.count;
    restoredCounts.confirmationAttempts = rAttempts.count;
    restoredCounts.tasks = rTasks.count;
    restoredCounts.communications = rComms.count;
    restoredCounts.financialAdjustments = rAdjustments.count;
    restoredCounts.fraudSignals = rFraud.count;

    // الهواتف: استعادة حصرية بid الـmanifest — أي نقص = تعارض
    const phonesStillOnSurvivor = await tx.customerPhone.count({
      where: { id: { in: manifest.movedPhoneIds }, customerId: survivor.id },
    });
    if (phonesStillOnSurvivor !== manifest.movedPhoneIds.length) {
      throw new CustomerMergeError(
        "UNMERGE_CONFLICT",
        "تعارض أثناء استعادة الهواتف — حالة تغيرت بعد الدمج",
      );
    }
    await tx.customerPhone.updateMany({
      where: { id: { in: manifest.movedPhoneIds } },
      data: { customerId: merged.id },
    });

    // إعادة حالة المدموج من اللقطة + استعادة أساسيّته
    const primaryRestored = await tx.customerPhone.updateMany({
      where: { phoneNormalized: manifest.mergedSnapshot.primaryPhone },
      data: { phoneType: "primary" },
    });
    if (primaryRestored.count !== 1) {
      throw new CustomerMergeError(
        "UNMERGE_CONFLICT",
        "الهاتف الأساسي من اللقطة غير موجود — تعارض استعادة",
      );
    }
    // الـmanifest يُخزَّن JSON فالحالة تصل كنص — نتحقق منها مقابل التعداد الرسمي
    // بدل الوثوق بها. قيمة غير معروفة (manifest قديم/تالف) = تعارض استعادة وفشل
    // آمن، تمامًا كبقية تعارضات الـunmerge — لا كتابة حالة مجهولة على عميل حقيقي.
    if (!(manifest.mergedSnapshot.status in CustomerStatus)) {
      throw new CustomerMergeError(
        "UNMERGE_CONFLICT",
        `حالة العميل في اللقطة غير معروفة (${manifest.mergedSnapshot.status}) — تعارض استعادة`,
      );
    }
    await tx.customer.update({
      where: { id: merged.id },
      data: {
        status: manifest.mergedSnapshot.status as CustomerStatus,
        primaryPhone: manifest.mergedSnapshot.primaryPhone,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "admin",
        actorId: input.actorId,
        action: "customer_unmerge",
        entityType: "customer",
        entityId: merged.id,
        after: { mergeId: mergeRecord.id, restoredCounts },
        reason: input.reason ?? null,
        correlationId: input.correlationId ?? null,
      },
    });

    return { restoredCounts };
  });

  return { restoredCounts: result.restoredCounts };
}

/** فشل الفصل الآمن يستدعيها الroute — إنشاء مهمة مراجعة يدوية + تنبيه. */
export async function raiseUnmergeReviewTask(input: {
  mergedId: string;
  actorId: string;
  error: CustomerMergeError;
}): Promise<void> {
  const merged = await prisma.customer.findUnique({
    where: { id: input.mergedId },
    select: { id: true },
  });
  if (!merged) return;
  await prisma.task.create({
    data: {
      type: "manual_review",
      customerId: merged.id,
      priority: "high",
      source: "automation",
      payload: {
        kind: "unmerge_conflict",
        code: input.error.code,
        detail: input.error.message,
      },
      createdById: input.actorId,
    },
  });
  await writeAudit({
    actorType: "admin",
    actorId: input.actorId,
    action: "customer_unmerge_failed",
    entityType: "customer",
    entityId: input.mergedId,
    after: { code: input.error.code, message: input.error.message },
  });
}
