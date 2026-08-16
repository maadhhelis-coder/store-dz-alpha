"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import type { Order, OrderStatus } from "@prisma/client";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import DataTablePagination from "@/components/admin/DataTablePagination";
import { ORDER_STATUS_OPTIONS } from "@/lib/orderStatus";
import { wilayas } from "@/data/delivery";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type OrderRow = Order & { isDuplicateSuspect: boolean };

export default function OrdersTable() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // الافتراضي "pending" — الطلبات الجديدة التي تحتاج تأكيد، بدل عرض كل الحالات مختلطة
  // (بما فيها المؤكَّدة والملغاة) عند فتح الصفحة لأول مرة.
  const [status, setStatus] = useState<OrderStatus | "">("pending");
  const [wilayaCode, setWilayaCode] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAllMatchingActive, setSelectAllMatchingActive] = useState(false);
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | "">("");
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (wilayaCode) params.set("wilayaCode", wilayaCode);
    if (search.trim()) params.set("search", search.trim());

    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, status, wilayaCode, search]);

  useEffect(() => {
    // جلب البيانات عند التحميل وعند تغيّر الفلاتر — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    // تحديد "كل الطلبات المطابقة" يصبح غير دقيق بمجرد تغيّر الفلتر — نُلغيه بدل تركه
    // يُطبَّق على مجموعة طلبات لم تعد هي المعروضة فعليًا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectAllMatchingActive(false);
    setSelected(new Set());
  }, [status, wilayaCode, search]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectAllMatchingActive(false);
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  }

  // يجلب معرّفات كل الطلبات المطابقة للفلتر الحالي (وليس فقط الصفحة المعروضة) — لتمكين
  // تحديد جماعي حقيقي عند تأكيد عشرات الطلبات دفعة واحدة.
  async function handleSelectAllMatching() {
    setSelectingAllMatching(true);
    setActionError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (wilayaCode) params.set("wilayaCode", wilayaCode);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/orders/ids?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(new Set(data.ids ?? []));
      setSelectAllMatchingActive(true);
    } catch {
      setActionError("تعذر تحديد كل الطلبات المطابقة، حاول من جديد");
    } finally {
      setSelectingAllMatching(false);
    }
  }

  async function handleQuickStatusChange(orderId: string, newStatus: OrderStatus) {
    const previousStatus = orders.find((o) => o.id === orderId)?.status;
    setActionError(null);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // فشل الحفظ الفعلي — نتراجع عن التحديث المتفائل بدل ما نترك المؤكِّد يظن أن
      // الحالة تغيّرت فعليًا بينما لم يُحفظ شيء (خطر ضياع طلب حقيقي بصمت).
      if (previousStatus) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: previousStatus } : o)));
      }
      setActionError("تعذر حفظ تغيير الحالة، حاول من جديد");
    }
  }

  async function handleBulkApply() {
    if (!bulkStatus || selected.size === 0) return;
    setActionError(null);
    try {
      const res = await fetch("/api/admin/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selected), status: bulkStatus }),
      });
      if (!res.ok) throw new Error();
      setSelected(new Set());
      setBulkStatus("");
      fetchOrders();
    } catch {
      setActionError("تعذر تطبيق التحديث الجماعي، حاول من جديد");
    }
  }

  return (
    <div>
      {actionError && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm px-3 py-2 flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-red-300 hover:text-red-200">
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-cream-dim" />
          <input
            type="text"
            placeholder="بحث بالاسم، الهاتف، أو رقم الطلب"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-full rounded-lg bg-ink border border-gold/25 ps-9 pe-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as OrderStatus | "");
          }}
          className="rounded-lg bg-ink border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
        >
          <option value="">كل الحالات</option>
          {ORDER_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={wilayaCode}
          onChange={(e) => {
            setPage(1);
            setWilayaCode(e.target.value);
          }}
          className="rounded-lg bg-ink border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
        >
          <option value="">كل الولايات</option>
          {wilayas.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl gold-border bg-ink">
          <span className="text-sm text-cream">{selected.size} طلب محدد</span>
          {!selectAllMatchingActive && selected.size === orders.length && total > orders.length && (
            <button
              type="button"
              onClick={handleSelectAllMatching}
              disabled={selectingAllMatching}
              className="text-xs text-gold hover:underline disabled:opacity-60 flex items-center gap-1"
            >
              {selectingAllMatching && <Loader2 className="w-3 h-3 animate-spin" />}
              تحديد كل {Math.min(total, 200)} طلب مطابق للفلتر
            </button>
          )}
          {selectAllMatchingActive && total > 200 && (
            <span className="text-[11px] text-cream-dim/80">
              (أول 200 من أصل {total} طلبًا مطابقًا — طبّق ثم كرّر للباقي)
            </span>
          )}
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as OrderStatus | "")}
            className="rounded-lg bg-black border border-gold/25 px-3 py-1.5 text-sm text-cream"
          >
            <option value="">اختر حالة جديدة</option>
            {ORDER_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkApply}
            disabled={!bulkStatus}
            className="gold-gradient text-ink text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-60"
          >
            تطبيق
          </button>
        </div>
      )}

      {/* عرض بطاقات للجوال — الجدول بتمرير أفقي غير قابل للاستخدام على شاشة صغيرة */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="p-8 text-center text-cream-dim rounded-xl gold-border bg-ink">
            <Loader2 className="w-5 h-5 animate-spin inline" />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-cream-dim rounded-xl gold-border bg-ink">لا توجد طلبات</div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className={cn(
                "rounded-xl gold-border bg-ink p-4 space-y-3",
                selected.has(order.id) && "bg-black/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(order.id)}
                    onChange={() => toggleSelected(order.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-cream font-semibold flex items-center gap-1.5">
                      {order.customerFirstName} {order.customerLastName}
                      {order.isDuplicateSuspect && <DuplicateBadge />}
                    </p>
                    <p className="text-cream-dim font-mono text-xs mt-0.5">{order.orderNumber}</p>
                  </div>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-cream-dim">
                <a href={`tel:${order.phone}`} className="hover:text-gold hover:underline" dir="ltr">
                  {order.phone}
                </a>
                <span>{order.wilayaName}</span>
                <span className="text-gold font-semibold">{formatPrice(order.totalDzd)}</span>
                <span>{new Date(order.createdAt).toLocaleDateString("ar-DZ-u-nu-latn")}</span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <select
                  value={order.status}
                  onChange={(e) => handleQuickStatusChange(order.id, e.target.value as OrderStatus)}
                  className="rounded-lg bg-black border border-gold/25 px-2.5 py-1.5 text-xs text-cream focus:outline-none focus:border-gold"
                >
                  {ORDER_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Link href={`/admin/orders/${order.id}`} className="text-gold text-xs font-semibold hover:underline">
                  عرض التفاصيل
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">
                <input
                  type="checkbox"
                  checked={orders.length > 0 && selected.size === orders.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th scope="col" className="p-3 text-start">رقم الطلب</th>
              <th scope="col" className="p-3 text-start">الزبون</th>
              <th scope="col" className="p-3 text-start">الهاتف</th>
              <th scope="col" className="p-3 text-start">الولاية</th>
              <th scope="col" className="p-3 text-start">المجموع</th>
              <th scope="col" className="p-3 text-start">الحالة</th>
              <th scope="col" className="p-3 text-start">التاريخ</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-cream-dim">
                  لا توجد طلبات
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className={cn(
                    "border-b border-gold/10 last:border-0 hover:bg-black/30",
                    selected.has(order.id) && "bg-black/30",
                  )}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleSelected(order.id)}
                    />
                  </td>
                  <td className="p-3 text-cream font-mono text-xs">{order.orderNumber}</td>
                  <td className="p-3 text-cream">
                    <span className="flex items-center gap-1.5">
                      {order.customerFirstName} {order.customerLastName}
                      {order.isDuplicateSuspect && <DuplicateBadge />}
                    </span>
                  </td>
                  <td className="p-3 text-cream-dim" dir="ltr">
                    <a href={`tel:${order.phone}`} className="hover:text-gold hover:underline">
                      {order.phone}
                    </a>
                  </td>
                  <td className="p-3 text-cream-dim">{order.wilayaName}</td>
                  <td className="p-3 text-gold font-semibold">{formatPrice(order.totalDzd)}</td>
                  <td className="p-3">
                    <select
                      value={order.status}
                      onChange={(e) => handleQuickStatusChange(order.id, e.target.value as OrderStatus)}
                      className="bg-transparent text-xs border-0 rounded focus:outline-none focus:ring-2 focus:ring-gold"
                    >
                      {ORDER_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1">
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </td>
                  <td className="p-3 text-cream-dim text-xs">
                    {new Date(order.createdAt).toLocaleDateString("ar-DZ-u-nu-latn")}
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/orders/${order.id}`} className="text-gold text-xs hover:underline">
                      عرض
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}

function DuplicateBadge() {
  return (
    <span
      title="نفس الرقم وطلب نفس المنتج خلال 48 ساعة — قد يكون طلبًا مكررًا"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 border border-amber-400/40 rounded-full px-1.5 py-0.5 shrink-0"
    >
      <AlertTriangle className="w-3 h-3" />
      مكرر محتمل
    </span>
  );
}
