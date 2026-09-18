import { createHash } from "crypto";
import { prisma } from "@/server/db/prisma";
import { writeAuditInTx } from "@/server/services/auditService";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import { isUniqueViolation } from "@/server/modules/shipping/shipmentService";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { sumAdjustments } from "@/server/modules/metrics/definitions";
import type { CodSettlementStatus, Prisma } from "@prisma/client";

// تسوية COD (P6) — طبقة مستقلة تمامًا عن دورة حياة الطلب.
//
// الهوية: provider + reconciliationKey حيث reconciliationKey = تاريخ التسوية +
// مرجع الدفعة (إن وُجد) وإلا بصمة هويات السطور (trackingNumber أو orderNumber).
// - نفس المفتاح ونفس المحتوى (contentHash) = إعادة استيراد: تُعاد التسوية الموجودة
//   بلا أي أثر مالي جديد (idempotent، قابل لإعادة المحاولة).
// - نفس المفتاح بمحتوى مختلف = تعارض: 409 + SystemAlert، ولا يُكتب فوق القديم أبدًا.
// - UNIQUE(provider, reconciliation_key) في القاعدة يحسم سباق استيرادين متزامنين.
//
// المبلغ القابل للتحصيل (collectible) = totalDzd + صافي التعديلات المالية للطلب.
// المحصَّل > collectible بلا تعديل موثّق = فرق يُرفع ولا يُكتب على الطلب.
// codCollectedAt = وقت التحصيل الفعلي (تاريخ السطر أو تاريخ التسوية) — يُكتب مرة
// واحدة فقط؛ أي قيمة سابقة لا تُدهس (تعارض يظهر على سطر التسوية).

export type SettlementErrorCode =
  | "SETTLEMENT_NOT_FOUND"
  | "SETTLEMENT_ITEM_NOT_FOUND"
  | "SETTLEMENT_CONFLICT"
  | "INVALID_LINES"
  | "ALREADY_RESOLVED";

export class SettlementError extends Error {
  constructor(
    readonly code: SettlementErrorCode,
    message: string,
    readonly settlementId?: string,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

export const SETTLEMENT_ERROR_STATUS: Record<SettlementErrorCode, number> = {
  SETTLEMENT_NOT_FOUND: 404,
  SETTLEMENT_ITEM_NOT_FOUND: 404,
  SETTLEMENT_CONFLICT: 409,
  ALREADY_RESOLVED: 409,
  INVALID_LINES: 400,
};

export type SettlementActor = { type: "admin" | "system" | "api"; id?: string | null };

export type SettlementLineInput = {
  trackingNumber?: string | null;
  orderNumber?: string | null;
  collectedDzd: number;
  collectedAt?: Date | null;
  note?: string | null;
};

export type ImportSettlementInput = {
  provider: string;
  settlementDate: Date;
  /** مرجع دفعة الناقل (رقم الحوالة/الكشف) — يفضَّل دائمًا لهوية حتمية */
  reference?: string | null;
  lines: SettlementLineInput[];
  actor: SettlementActor;
  correlationId?: string | null;
};

export type UnmatchedLine = { identity: string; collectedDzd: number; reason: string };

export type ImportSettlementResult = {
  settlementId: string;
  status: CodSettlementStatus;
  replayed: boolean;
  matched: number;
  discrepancies: number;
  unmatched: UnmatchedLine[];
};

function lineIdentity(line: SettlementLineInput): string | null {
  const tracking = line.trackingNumber?.trim();
  if (tracking) return `trk:${tracking}`;
  const orderNumber = line.orderNumber?.trim();
  if (orderNumber) return `ord:${orderNumber}`;
  return null;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** بصمة محتوى حتمية: السطور مرتبة بهويتها — نفس الكشف بأي ترتيب = نفس البصمة. */
export function settlementContentHash(lines: readonly SettlementLineInput[]): string {
  const normalized = lines
    .map((l) => `${lineIdentity(l) ?? "?"}=${l.collectedDzd}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}

export function settlementReconciliationKey(input: {
  settlementDate: Date;
  reference?: string | null;
  lines: readonly SettlementLineInput[];
}): string {
  const ref = input.reference?.trim();
  const tail = ref ? `ref:${ref}` : `auto:${settlementContentHash(input.lines).slice(0, 24)}`;
  return `${dayKey(input.settlementDate)}:${tail}`;
}

type ExistingSettlement = {
  id: string;
  status: CodSettlementStatus;
  contentHash: string | null;
  items: { state: string }[];
};

export async function importCodSettlement(input: ImportSettlementInput): Promise<ImportSettlementResult> {
  if (input.lines.length === 0) throw new SettlementError("INVALID_LINES", "كشف التسوية بلا سطور");
  for (const l of input.lines) {
    if (!Number.isInteger(l.collectedDzd) || l.collectedDzd < 0) {
      throw new SettlementError("INVALID_LINES", "المبلغ المحصَّل يجب أن يكون عددًا صحيحًا دج ≥ 0");
    }
    if (!lineIdentity(l)) throw new SettlementError("INVALID_LINES", "كل سطر يحتاج رقم تتبّع أو رقم طلب");
  }
  const provider = input.provider.trim().toLowerCase();
  const reconciliationKey = settlementReconciliationKey(input);
  const contentHash = settlementContentHash(input.lines);

  const existing = await prisma.codSettlement.findUnique({
    where: { provider_reconciliationKey: { provider, reconciliationKey } },
    select: { id: true, status: true, contentHash: true, items: { select: { state: true } } },
  });
  if (existing) return replayOrConflict(existing, contentHash, provider, reconciliationKey);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const { resolved, unmatched } = await resolveLines(tx, provider, input.lines);

      let matched = 0;
      let discrepancies = 0;
      let expectedTotal = 0;
      let collectedTotal = 0;
      const itemsData: Prisma.CodSettlementItemCreateWithoutSettlementInput[] = [];
      const collectedWrites: { orderId: string; amount: number; at: Date; status: string }[] = [];

      for (const r of resolved) {
        const expected = r.collectible;
        const discrepancy = r.line.collectedDzd - expected;
        expectedTotal += expected;
        collectedTotal += r.line.collectedDzd;
        let state = discrepancy === 0 ? "matched" : "discrepancy";
        let reason: string | null = r.line.note ?? null;

        if (r.order.isTest) {
          state = "excluded";
          reason = "طلب اختبار — مستثنى من كل أثر مالي";
        } else if (r.order.codCollectedAt !== null) {
          // تحصيل مسجَّل سابقًا: لا دهس — مطابقة إن تساوى المبلغ، وإلا فرق يُراجَع
          const previous = r.order.codCollectedAmountDzd ?? r.order.totalDzd;
          if (previous === r.line.collectedDzd) reason = reason ?? "مسجَّل سابقًا بنفس المبلغ";
          else {
            state = "discrepancy";
            reason = `تحصيل سابق مسجَّل بمبلغ مختلف (${previous} دج) — لا يُكتب فوقه`;
          }
        } else if (r.line.collectedDzd > expected) {
          state = "discrepancy";
          reason = `المحصَّل (${r.line.collectedDzd}) يتجاوز القابل للتحصيل (${expected}) — يتطلب تعديلًا ماليًا موثّقًا قبل التسجيل`;
        } else {
          collectedWrites.push({
            orderId: r.order.id,
            amount: r.line.collectedDzd,
            at: r.line.collectedAt ?? input.settlementDate,
            status: r.order.status,
          });
        }
        if (state === "matched") matched++;
        else if (state === "discrepancy") discrepancies++;
        itemsData.push({
          order: { connect: { id: r.order.id } },
          trackingNumber: r.line.trackingNumber?.trim() || null,
          orderNumber: r.order.orderNumber,
          expectedDzd: expected,
          collectedDzd: r.line.collectedDzd,
          discrepancyDzd: discrepancy,
          state,
          reason,
        });
      }

      const status: CodSettlementStatus =
        discrepancies === 0 && unmatched.length === 0 ? "matched" : "discrepancy";
      const settlement = await tx.codSettlement.create({
        data: {
          provider,
          settlementDate: input.settlementDate,
          reconciliationKey,
          contentHash,
          expectedDzd: expectedTotal,
          collectedDzd: collectedTotal,
          discrepancyDzd: collectedTotal - expectedTotal,
          status,
          reason:
            unmatched.length > 0
              ? `${unmatched.length} سطر بلا طلب مطابق: ${unmatched.map((u) => u.identity).join(", ")}`
              : null,
          createdById: input.actor.type === "admin" ? (input.actor.id ?? null) : null,
          items: { create: itemsData },
        },
        select: { id: true, status: true },
      });

      // الأثر المالي الوحيد على الطلب: وقت التحصيل الفعلي والمبلغ — مرة واحدة
      for (const w of collectedWrites) {
        await tx.order.updateMany({
          where: { id: w.orderId, codCollectedAt: null },
          data: { codCollectedAt: w.at, codCollectedAmountDzd: w.amount },
        });
        await writeAuditInTx(tx, {
          actorType: input.actor.type,
          actorId: input.actor.id ?? null,
          action: "cod_collected",
          entityType: "order",
          entityId: w.orderId,
          before: { codCollectedAt: null, codCollectedAmountDzd: null },
          after: { codCollectedAt: w.at, codCollectedAmountDzd: w.amount, settlementId: settlement.id },
          reason: `تسوية ${provider} ${reconciliationKey}`,
          correlationId: input.correlationId ?? null,
        });
      }

      await writeAuditInTx(tx, {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "cod_settlement_import",
        entityType: "cod_settlement",
        entityId: settlement.id,
        after: {
          provider,
          reconciliationKey,
          contentHash,
          lines: input.lines.length,
          matched,
          discrepancies,
          unmatched: unmatched.length,
          expectedDzd: expectedTotal,
          collectedDzd: collectedTotal,
        },
        reason: input.reference ?? null,
        correlationId: input.correlationId ?? null,
      });

      return { settlement, matched, discrepancies, unmatched, collectedWrites };
    });

    // دورة حياة الطلب: delivered → cod_collected عبر آلة الحالات (CAS) — خارج معاملة
    // التسوية. طلب ليس delivered في سجلاتنا يبقى كما هو؛ التسوية تشهد على التحصيل.
    for (const w of result.collectedWrites) {
      if (w.status !== "delivered") continue;
      try {
        await transitionOrderStatus(w.orderId, "cod_collected", {
          actor: input.actor,
          reason: `تسوية COD ${provider} ${reconciliationKey}`,
          correlationId: input.correlationId ?? null,
        });
      } catch (error) {
        if (!(error instanceof InvalidTransitionError)) throw error;
      }
    }

    if (result.discrepancies > 0 || result.unmatched.length > 0) {
      await raiseSystemAlert({
        type: "cod_settlement_discrepancy",
        severity: "medium",
        message: `تسوية ${provider} ${reconciliationKey}: ${result.discrepancies} فرق و${result.unmatched.length} سطر بلا طلب`,
        entityType: "cod_settlement",
        entityId: result.settlement.id,
        metadata: { unmatched: result.unmatched },
      });
    }

    return {
      settlementId: result.settlement.id,
      status: result.settlement.status,
      replayed: false,
      matched: result.matched,
      discrepancies: result.discrepancies,
      unmatched: result.unmatched,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      // سباق استيرادين متزامنين: الخاسر يقرأ الفائز ويقرّر إعادة/تعارض
      const winner = await prisma.codSettlement.findUnique({
        where: { provider_reconciliationKey: { provider, reconciliationKey } },
        select: { id: true, status: true, contentHash: true, items: { select: { state: true } } },
      });
      if (winner) return replayOrConflict(winner, contentHash, provider, reconciliationKey);
    }
    if (!(error instanceof SettlementError)) {
      await raiseSystemAlert({
        type: "cod_settlement_import_failed",
        severity: "high",
        message: `فشل استيراد تسوية ${provider} ${reconciliationKey}`,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
    }
    throw error;
  }
}

async function replayOrConflict(
  existing: ExistingSettlement,
  contentHash: string,
  provider: string,
  reconciliationKey: string,
): Promise<ImportSettlementResult> {
  if (existing.contentHash === contentHash) {
    return {
      settlementId: existing.id,
      status: existing.status,
      replayed: true,
      matched: existing.items.filter((i) => i.state === "matched").length,
      discrepancies: existing.items.filter((i) => i.state === "discrepancy").length,
      unmatched: [],
    };
  }
  await raiseSystemAlert({
    type: "cod_settlement_conflict",
    severity: "high",
    message: `تعارض تسوية ${provider} ${reconciliationKey}: نفس المفتاح بمحتوى مختلف — لم يُكتب شيء`,
    entityType: "cod_settlement",
    entityId: existing.id,
  });
  throw new SettlementError(
    "SETTLEMENT_CONFLICT",
    "توجد تسوية بنفس الهوية بمحتوى مختلف — راجعها بدل إعادة الاستيراد",
    existing.id,
  );
}

type ResolvedLine = {
  line: SettlementLineInput;
  order: {
    id: string;
    orderNumber: string;
    totalDzd: number;
    status: string;
    isTest: boolean;
    codCollectedAt: Date | null;
    codCollectedAmountDzd: number | null;
  };
  collectible: number;
};

/** ربط كل سطر بطلب: رقم التتبّع (shipments) أولًا ثم رقم الطلب. طلب مكرَّر في نفس
 * الكشف = السطر الثاني بلا طلب (UNIQUE(settlement_id, order_id) يمنعه أصلًا). */
async function resolveLines(
  tx: Prisma.TransactionClient,
  provider: string,
  lines: readonly SettlementLineInput[],
): Promise<{ resolved: ResolvedLine[]; unmatched: UnmatchedLine[] }> {
  const trackings = lines.map((l) => l.trackingNumber?.trim()).filter((t): t is string => Boolean(t));
  const orderNumbers = lines.map((l) => l.orderNumber?.trim()).filter((n): n is string => Boolean(n));
  const [shipments, orders] = await Promise.all([
    trackings.length
      ? tx.shipment.findMany({
          where: { provider, trackingNumber: { in: trackings } },
          select: { trackingNumber: true, orderId: true },
        })
      : Promise.resolve([]),
    orderNumbers.length
      ? tx.order.findMany({ where: { orderNumber: { in: orderNumbers } }, select: { id: true, orderNumber: true } })
      : Promise.resolve([]),
  ]);
  const byTracking = new Map(shipments.map((s) => [s.trackingNumber!, s.orderId]));
  const byNumber = new Map(orders.map((o) => [o.orderNumber, o.id]));

  const orderIds = new Set<string>();
  const pairs = lines.map((line) => {
    const identity = lineIdentity(line)!;
    const tracking = line.trackingNumber?.trim();
    const orderId =
      (tracking && byTracking.get(tracking)) || byNumber.get(line.orderNumber?.trim() ?? "") || null;
    if (orderId) orderIds.add(orderId);
    return { line, orderId, identity };
  });

  const fullOrders = await tx.order.findMany({
    where: { id: { in: [...orderIds] } },
    select: {
      id: true,
      orderNumber: true,
      totalDzd: true,
      status: true,
      isTest: true,
      codCollectedAt: true,
      codCollectedAmountDzd: true,
      financialAdjustments: { select: { amountDzd: true, direction: true } },
    },
  });
  const orderById = new Map(fullOrders.map((o) => [o.id, o]));

  const resolved: ResolvedLine[] = [];
  const unmatched: UnmatchedLine[] = [];
  const seenOrders = new Set<string>();
  for (const p of pairs) {
    const order = p.orderId ? orderById.get(p.orderId) : undefined;
    if (!order) {
      unmatched.push({ identity: p.identity, collectedDzd: p.line.collectedDzd, reason: "لا طلب مطابق" });
      continue;
    }
    if (seenOrders.has(order.id)) {
      unmatched.push({
        identity: p.identity,
        collectedDzd: p.line.collectedDzd,
        reason: `الطلب ${order.orderNumber} مكرَّر في الكشف`,
      });
      continue;
    }
    seenOrders.add(order.id);
    resolved.push({
      line: p.line,
      order,
      collectible: Math.max(0, order.totalDzd + sumAdjustments(order.financialAdjustments)),
    });
  }
  return { resolved, unmatched };
}

// ===================== الحل =====================

export async function resolveSettlementItem(params: {
  itemId: string;
  /** حين يُمرَّر: يجب أن ينتمي السطر لهذه التسوية (حارس المسار) */
  settlementId?: string;
  reason: string;
  actor: SettlementActor;
  correlationId?: string | null;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new SettlementError("INVALID_LINES", "سبب الحل إلزامي");
  return prisma.$transaction(async (tx) => {
    const item = await tx.codSettlementItem.findUnique({ where: { id: params.itemId } });
    if (!item || (params.settlementId && item.settlementId !== params.settlementId)) {
      throw new SettlementError("SETTLEMENT_ITEM_NOT_FOUND", "سطر التسوية غير موجود في هذه التسوية");
    }
    if (item.state === "resolved") throw new SettlementError("ALREADY_RESOLVED", "هذا السطر محلول بالفعل");
    const guarded = await tx.codSettlementItem.updateMany({
      where: { id: item.id, state: item.state },
      data: { state: "resolved", reason },
    });
    if (guarded.count === 0) {
      throw new SettlementError("ALREADY_RESOLVED", "تغيّر السطر أثناء الطلب — أعد التحميل");
    }
    await writeAuditInTx(tx, {
      actorType: params.actor.type,
      actorId: params.actor.id ?? null,
      action: "cod_settlement_item_resolve",
      entityType: "cod_settlement_item",
      entityId: item.id,
      before: { state: item.state, reason: item.reason },
      after: { state: "resolved", reason },
      reason,
      correlationId: params.correlationId ?? null,
    });
    await maybeResolveSettlement(tx, item.settlementId, params.actor, reason);
    return tx.codSettlementItem.findUniqueOrThrow({ where: { id: item.id } });
  });
}

/** التسوية تصبح resolved حين لا يبقى سطر discrepancy/pending فيها. */
async function maybeResolveSettlement(
  tx: Prisma.TransactionClient,
  settlementId: string,
  actor: SettlementActor,
  reason: string,
) {
  const open = await tx.codSettlementItem.count({
    where: { settlementId, state: { in: ["pending", "discrepancy"] } },
  });
  if (open > 0) return;
  const settlement = await tx.codSettlement.findUniqueOrThrow({
    where: { id: settlementId },
    select: { status: true },
  });
  if (settlement.status === "resolved") return;
  await tx.codSettlement.update({
    where: { id: settlementId },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedById: actor.type === "admin" ? (actor.id ?? null) : null,
    },
  });
  await writeAuditInTx(tx, {
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: "cod_settlement_resolve",
    entityType: "cod_settlement",
    entityId: settlementId,
    before: { status: settlement.status },
    after: { status: "resolved" },
    reason,
  });
}

// ===================== قراءة =====================

export async function listSettlements(params: {
  status?: CodSettlementStatus;
  page: number;
  pageSize: number;
}) {
  const pageSize = Math.min(Math.max(1, params.pageSize), 100);
  const where: Prisma.CodSettlementWhereInput = params.status ? { status: params.status } : {};
  const [items, total] = await Promise.all([
    prisma.codSettlement.findMany({
      where,
      orderBy: [{ settlementDate: "desc" }, { createdAt: "desc" }],
      skip: (Math.max(1, params.page) - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } } },
    }),
    prisma.codSettlement.count({ where }),
  ]);
  return { items, total, pageSize };
}

export async function getSettlement(id: string) {
  return prisma.codSettlement.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: [{ state: "asc" }, { orderNumber: "asc" }],
        include: { order: { select: { id: true, orderNumber: true, status: true, codCollectedAt: true } } },
      },
    },
  });
}
