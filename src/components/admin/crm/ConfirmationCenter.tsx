"use client";

import { useCallback, useEffect, useState } from "react";
import DataTablePagination from "@/components/admin/DataTablePagination";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import { formatPrice } from "@/lib/format";

// مركز التأكيد — قائمة العمل المرتبة (مستحق→SLA→مخاطرة→قيمة→أقدمية)،
// إسناد ذاتي CAS، وتسجيل نتيجة الاتصال. keyboard-friendly، أخطاء inline،
// data-testid لاختبارات E2E.

type QueueItem = {
  id: string;
  orderNumber: string;
  status: string;
  customerFirstName: string;
  customerLastName: string;
  phone: string;
  wilayaName: string;
  commune: string;
  deliveryOption: string;
  totalDzd: number;
  createdAt: string;
  nextCallAt: string | null;
  callAttempts: number;
  assignedAgentId: string | null;
  riskLevel: string | null;
  productSummary: string;
  attemptsCount: number;
  followUpDue: boolean;
  slaOverdueMinutes: number | null;
};

const OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: "confirmed", label: "أكّد الطلب" },
  { value: "no_answer", label: "لم يرد" },
  { value: "call_back", label: "أعد الاتصال لاحقًا" },
  { value: "wrong_number", label: "رقم خاطئ" },
  { value: "cancelled", label: "ألغى الزبون" },
  { value: "duplicate", label: "طلب مكرر" },
  { value: "fraud_suspected", label: "اشتباه احتيال" },
  { value: "customer_requested_change", label: "طلب تعديلًا" },
];

const RISK_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "مرتفعة",
  very_high: "مرتفعة جدًا",
};

const PAGE_SIZE = 20;

export default function ConfirmationCenter() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [openOutcomeId, setOpenOutcomeId] = useState<string | null>(null);

  // منطق الجلب المشترك — دالة عادية بلا setState يستعملها الـeffect والمعالجات.
  async function loadQueue(p: number, m: boolean) {
    const res = await fetch(`/api/admin/crm/confirmation/queue?page=${p}&pageSize=${PAGE_SIZE}${m ? "&mine=true" : ""}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "تعذر جلب القائمة");
    return data as { items?: QueueItem[]; total?: number };
  }

  // الجلب في الeffect وفق النمط الموصى به: كل setState بعد await وبعلم إلغاء —
  // لا setState متزامن في جسم الeffect (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadQueue(page, mine);
        if (cancelled) return;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, mine]);

  // إعادة الجلب من معالجات الأحداث (مسموح فيها setState) — تحديث القائمة في مكانها
  const refetch = useCallback(async () => {
    try {
      const data = await loadQueue(page, mine);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    }
  }, [page, mine]);

  async function handleAssign(orderId: string) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch("/api/admin/crm/confirmation/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذر الإسناد");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleAttempt(orderId: string, outcome: string, note: string) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch("/api/admin/crm/confirmation/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          outcome,
          note: note || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذر تسجيل النتيجة");
      setOpenOutcomeId(null);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">مركز التأكيد</h1>
          <p className="text-sm text-neutral-500">
            {total} طلب بانتظار التأكيد — مرتّب: مستحق الاتصال ← متجاوز SLA ← مخاطرة ← قيمة ← أقدمية
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setLoading(true);
              setMine(e.target.checked);
              setPage(1);
            }}
          />
          طلباتي المسندة فقط
        </label>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ms-3 underline">
            إخفاء
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-500">جارٍ التحميل…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          لا توجد طلبات بانتظار التأكيد — عمل رائع ✨
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((order) => (
            <li
              key={order.id}
              data-testid={`queue-item-${order.orderNumber}`}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                order.followUpDue || order.slaOverdueMinutes !== null
                  ? "border-amber-300"
                  : "border-neutral-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold" dir="ltr">
                      {order.orderNumber}
                    </span>
                    <OrderStatusBadge status={order.status as never} />
                    {(order.followUpDue || order.slaOverdueMinutes !== null) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {order.followUpDue
                          ? "موعد الاتصال مستحق"
                          : `تجاوز SLA (${order.slaOverdueMinutes} د)`}
                      </span>
                    )}
                    {order.riskLevel && order.riskLevel !== "low" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          order.riskLevel === "very_high" || order.riskLevel === "high"
                            ? "bg-red-100 text-red-700"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        مخاطرة {RISK_LABELS[order.riskLevel] ?? order.riskLevel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">
                    {order.customerFirstName} {order.customerLastName} —{" "}
                    <a href={`tel:${order.phone}`} dir="ltr" className="font-mono hover:underline">
                      {order.phone}
                    </a>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {order.wilayaName} / {order.commune} • {order.productSummary} •{" "}
                    {order.deliveryOption === "home" ? "توصيل للمنزل" : "استلام من المكتب"} •{" "}
                    {order.attemptsCount} محاولة سابقة
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-bold text-yellow-700">
                    {formatPrice(order.totalDzd)}
                  </span>
                  {order.assignedAgentId === null ? (
                    <button
                      data-testid={`assign-${order.orderNumber}`}
                      onClick={() => handleAssign(order.id)}
                      disabled={busyOrderId === order.id}
                      className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busyOrderId === order.id ? "…" : "أسند لي"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setOpenOutcomeId(openOutcomeId === order.id ? null : order.id)}
                      disabled={busyOrderId === order.id}
                      data-testid={`open-outcome-${order.orderNumber}`}
                      className="rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {openOutcomeId === order.id ? "إغلاق" : "تسجيل نتيجة"}
                    </button>
                  )}
                </div>
              </div>

              {openOutcomeId === order.id && (
                <OutcomePanel
                  onDone={(outcome, note) => handleAttempt(order.id, outcome, note)}
                  busy={busyOrderId === order.id}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* التوقيع الفعلي للمكوّن الموجود: {page, pageSize, total, onPageChange} */}
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={(p) => {
          setLoading(true);
          setPage(p);
        }}
      />
    </div>
  );
}

function OutcomePanel({
  onDone,
  busy,
}: {
  onDone: (outcome: string, note: string) => void;
  busy: boolean;
}) {
  const [outcome, setOutcome] = useState("confirmed");
  const [note, setNote] = useState("");

  return (
    <div className="mt-4 rounded-lg bg-neutral-50 p-3" data-testid="outcome-panel">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">نتيجة الاتصال</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1 text-sm">
          <span className="mb-1 block text-xs text-neutral-500">ملاحظة (اختياري)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            placeholder="مثال: الطلب مقاس L ويشحن يوم الخميس"
          />
        </label>
        <button
          onClick={() => onDone(outcome, note)}
          disabled={busy}
          data-testid="submit-outcome"
          className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "حفظ النتيجة"}
        </button>
      </div>
    </div>
  );
}
