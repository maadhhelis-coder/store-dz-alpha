import { prisma } from "@/server/db/prisma";

// أداء مؤكِّدي الطلبات (Correction 12) — تجميعات SQL على confirmation_attempts
// (مصدر الحقيقة للاتصال) + الطلبات المسندة/المؤكدة (isTest مستثنى دائمًا).
// المقام الحاسم لمعدل التأكيد: مؤكدة + ملغاة + خاطئة + مكررة (نواتج حاسمة).

export type AgentPerformanceRow = {
  agentId: string;
  agentName: string | null;
  assignedOrders: number;
  attemptsCount: number;
  confirmedCount: number;
  cancelledCount: number;
  noAnswerCount: number;
  callBackCount: number;
  wrongNumberCount: number;
  duplicateCount: number;
  fraudSuspectedCount: number;
  confirmationRatePercent: number | null;
  confirmedRevenueDzd: number;
};

export async function getAgentPerformance(params: {
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: string;
}): Promise<AgentPerformanceRow[]> {
  const dateRange =
    params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {};

  const grouped = await prisma.confirmationAttempt.groupBy({
    by: ["agentId", "outcome"],
    where: {
      ...dateRange,
      ...(params.agentId ? { agentId: params.agentId } : {}),
    },
    _count: { _all: true },
  });

  if (grouped.length === 0) return [];

  const agentIds = Array.from(
    new Set(grouped.map((g) => g.agentId).filter((id): id is string => id !== null)),
  );
  const agents = await prisma.adminUser.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, fullName: true, email: true },
  });
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const ordersWhere = {
    isTest: false,
    assignedAgentId: { in: agentIds },
    ...dateRange,
  };

  // الإيراد المؤكَّد = الطلبات التي عبرت التأكيد (حتى delivered/returned —
  // طلب مُرجَع كان مؤكدًا فعلًا؛ تأثير الإرجاع يظهر في مقاييس الربحية وليس هنا)
  const CONFIRMED_DOWNSTREAM = [
    "confirmed", "preparing", "ready_to_ship", "shipped", "in_transit",
    "out_for_delivery", "delivered", "cod_collected", "returned",
  ] as const;

  const [assignedCounts, confirmedAgg] = await Promise.all([
    prisma.order.groupBy({ by: ["assignedAgentId"], where: ordersWhere, _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["assignedAgentId"],
      where: { ...ordersWhere, status: { in: [...CONFIRMED_DOWNSTREAM] } },
      _sum: { totalDzd: true },
    }),
  ]);
  const assignedByAgent = new Map(assignedCounts.map((r) => [r.assignedAgentId ?? "", r._count._all]));
  const revenueByAgent = new Map(confirmedAgg.map((r) => [r.assignedAgentId ?? "", r._sum.totalDzd ?? 0]));

  const byAgent = new Map<string, AgentPerformanceRow>();
  for (const g of grouped) {
    const agentId = g.agentId ?? "";
    let row = byAgent.get(agentId);
    if (!row) {
      const agent = agentById.get(agentId);
      row = {
        agentId,
        agentName: agent ? (agent.fullName ?? agent.email) : "(بدون موظف)",
        assignedOrders: assignedByAgent.get(agentId) ?? 0,
        attemptsCount: 0,
        confirmedCount: 0,
        cancelledCount: 0,
        noAnswerCount: 0,
        callBackCount: 0,
        wrongNumberCount: 0,
        duplicateCount: 0,
        fraudSuspectedCount: 0,
        confirmationRatePercent: null,
        confirmedRevenueDzd: revenueByAgent.get(agentId) ?? 0,
      };
      byAgent.set(agentId, row);
    }
    row.attemptsCount += g._count._all;
    switch (g.outcome) {
      case "confirmed": row.confirmedCount += g._count._all; break;
      case "cancelled": row.cancelledCount += g._count._all; break;
      case "no_answer": row.noAnswerCount += g._count._all; break;
      case "call_back": row.callBackCount += g._count._all; break;
      case "wrong_number": row.wrongNumberCount += g._count._all; break;
      case "duplicate": row.duplicateCount += g._count._all; break;
      case "fraud_suspected": row.fraudSuspectedCount += g._count._all; break;
      // customer_requested_change: غير حاسمة — لا تدخل البسط ولا المقام
    }
  }

  for (const row of byAgent.values()) {
    const decisive = row.confirmedCount + row.cancelledCount + row.wrongNumberCount + row.duplicateCount;
    row.confirmationRatePercent = decisive > 0 ? Math.round((row.confirmedCount / decisive) * 100) : null;
  }

  return Array.from(byAgent.values()).sort((a, b) => b.confirmedCount - a.confirmedCount);
}
