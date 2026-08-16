"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Send, X } from "lucide-react";
import type { Order, OrderItem, OrderStatus } from "@prisma/client";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import { ORDER_STATUS_OPTIONS } from "@/lib/orderStatus";
import { formatPrice } from "@/lib/format";
import { communesByWilaya } from "@/data/communes";
import { Field, inputClass as editInputClass } from "@/components/shared/FormField";

type OrderDetailFormProps = {
  order: Order & { items: OrderItem[] };
};

export default function OrderDetailForm({ order: initialOrder }: OrderDetailFormProps) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [notes, setNotes] = useState(initialOrder.notes ?? "");
  const [saving, setSaving] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerFirstName, setCustomerFirstName] = useState(initialOrder.customerFirstName);
  const [customerLastName, setCustomerLastName] = useState(initialOrder.customerLastName);
  const [phone, setPhone] = useState(initialOrder.phone);
  const [commune, setCommune] = useState(initialOrder.commune);
  const [address, setAddress] = useState(initialOrder.address ?? "");
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [communeManual, setCommuneManual] = useState(false);

  const communeOptions = communesByWilaya[order.wilayaCode] ?? [];

  function startEditingCustomer() {
    setCustomerFirstName(order.customerFirstName);
    setCustomerLastName(order.customerLastName);
    setPhone(order.phone);
    setCommune(order.commune);
    setCommuneManual(!communeOptions.includes(order.commune));
    setAddress(order.address ?? "");
    setCustomerError(null);
    setEditingCustomer(true);
  }

  async function handleSaveCustomerInfo() {
    setCustomerError(null);
    setSavingCustomer(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerFirstName,
          customerLastName,
          phone,
          commune,
          address,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCustomerError(data.error ?? "تعذر حفظ التعديلات");
        return;
      }
      setOrder(data.order);
      setEditingCustomer(false);
      router.refresh();
    } catch {
      setCustomerError("تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مجددًا");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        router.refresh();
      }
    } catch {
      // تجاهل — الحالة المعروضة تبقى كما كانت، والمسؤول يقدر يعيد المحاولة
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setSaving(true);
    try {
      await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } catch {
      // تجاهل — يقدر المسؤول يعيد الضغط على "حفظ الملاحظات"
    } finally {
      setSaving(false);
    }
  }

  // datetime-local لا يعطي مباشرة صيغة ISO كاملة (بلا ثوانٍ/منطقة زمنية) — نبني قيمة
  // ابتدائية متوافقة مع الحقل من nextCallAt المخزَّن، ونحوّلها لـISO كاملة عند الحفظ.
  const [nextCallAt, setNextCallAt] = useState(
    initialOrder.nextCallAt ? new Date(initialOrder.nextCallAt).toISOString().slice(0, 16) : "",
  );
  const [savingCallback, setSavingCallback] = useState(false);

  async function handleSaveNextCallAt() {
    setSavingCallback(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextCallAt: nextCallAt ? new Date(nextCallAt).toISOString() : null }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrder((prev) => ({ ...prev, nextCallAt: data.order.nextCallAt }));
      }
    } catch {
      // تجاهل — يقدر المسؤول يعيد الضغط
    } finally {
      setSavingCallback(false);
    }
  }

  const [editingCourier, setEditingCourier] = useState(false);
  const [courierProvider, setCourierProvider] = useState(order.courierProvider ?? "");
  const [courierTrackingId, setCourierTrackingId] = useState(order.courierTrackingId ?? "");
  const [savingCourier, setSavingCourier] = useState(false);
  const [courierError, setCourierError] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [sendingToDhd, setSendingToDhd] = useState(false);
  const [dhdCommunes, setDhdCommunes] = useState<{ name: string; hasStopDesk: boolean }[] | null>(null);
  const [loadingDhdCommunes, setLoadingDhdCommunes] = useState(false);
  const [selectedDhdCommune, setSelectedDhdCommune] = useState("");

  async function handleSendToDhd(communeOverride?: string) {
    if (!communeOverride) {
      if (!window.confirm("سيتم إنشاء شحنة حقيقية عند DHD بمبلغ COD الفعلي لهذا الطلب. متابعة؟")) return;
    }
    setCourierError(null);
    setSendingToDhd(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-to-dhd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(communeOverride ? { communeOverride } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        const message: string = data.error ?? "تعذر إرسال الشحنة إلى DHD";
        setCourierError(message);
        if (/commune/i.test(message)) {
          void loadDhdCommunes();
        }
        return;
      }
      setOrder(data.order);
      setDhdCommunes(null);
    } catch {
      setCourierError("تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مجددًا");
    } finally {
      setSendingToDhd(false);
    }
  }

  async function loadDhdCommunes() {
    setLoadingDhdCommunes(true);
    try {
      const params = new URLSearchParams({
        wilayaCode: String(order.wilayaCode),
        arabicCommune: order.commune,
      });
      const res = await fetch(`/api/admin/dhd/communes?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setDhdCommunes(data.communes ?? []);
        if (data.suggested) setSelectedDhdCommune(data.suggested);
      }
    } catch {
      // تجاهل — يبقى زر "إرسال الشحنة" متاحًا لإعادة المحاولة
    } finally {
      setLoadingDhdCommunes(false);
    }
  }

  function startEditingCourier() {
    setCourierProvider(order.courierProvider ?? "");
    setCourierTrackingId(order.courierTrackingId ?? "");
    setCourierError(null);
    setEditingCourier(true);
  }

  async function handleSaveCourier() {
    setCourierError(null);
    setSavingCourier(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierProvider: courierProvider || null,
          courierTrackingId: courierTrackingId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCourierError(data.error ?? "تعذر حفظ التعديلات");
        return;
      }
      setOrder(data.order);
      setEditingCourier(false);
    } catch {
      setCourierError("تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مجددًا");
    } finally {
      setSavingCourier(false);
    }
  }

  async function handleRefreshCourierStatus() {
    setCourierError(null);
    setRefreshingStatus(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/refresh-courier-status`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCourierError(data.error ?? "تعذر تحديث حالة الشحن");
        return;
      }
      setOrder(data.order);
    } catch {
      setCourierError("تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مجددًا");
    } finally {
      setRefreshingStatus(false);
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <div className="rounded-xl gold-border bg-ink p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-gold">معلومات الزبون</h2>
            {!editingCustomer && (
              <button
                type="button"
                onClick={startEditingCustomer}
                className="text-gold text-xs flex items-center gap-1 hover:underline"
              >
                <Pencil className="w-3.5 h-3.5" /> تعديل
              </button>
            )}
          </div>

          {editingCustomer ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="الاسم">
                  <input
                    type="text"
                    value={customerFirstName}
                    onChange={(e) => setCustomerFirstName(e.target.value)}
                    className={editInputClass}
                  />
                </Field>
                <Field label="اللقب">
                  <input
                    type="text"
                    value={customerLastName}
                    onChange={(e) => setCustomerLastName(e.target.value)}
                    className={editInputClass}
                  />
                </Field>
                <Field label="الهاتف">
                  <input
                    type="text"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={editInputClass}
                  />
                </Field>
                <Field label="البلدية">
                  {communeOptions.length > 0 && !communeManual ? (
                    <select
                      value={commune}
                      onChange={(e) => {
                        if (e.target.value === "__other__") {
                          setCommuneManual(true);
                          setCommune("");
                        } else {
                          setCommune(e.target.value);
                        }
                      }}
                      className={editInputClass}
                    >
                      <option value="">اختر البلدية</option>
                      {communeOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value="__other__">بلدية أخرى (اكتب يدويًا)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={commune}
                      onChange={(e) => setCommune(e.target.value)}
                      className={editInputClass}
                    />
                  )}
                  {communeManual && communeOptions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCommuneManual(false);
                        setCommune("");
                      }}
                      className="text-[11px] text-gold hover:underline mt-1"
                    >
                      العودة لقائمة البلديات
                    </button>
                  )}
                </Field>
                <div className="col-span-2">
                  <Field label="العنوان">
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={editInputClass}
                    />
                  </Field>
                </div>
              </div>

              {customerError && <p className="text-xs text-red-400">{customerError}</p>}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveCustomerInfo}
                  disabled={savingCustomer}
                  className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {savingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCustomer(false)}
                  disabled={savingCustomer}
                  className="text-cream-dim text-sm flex items-center gap-1 hover:text-cream"
                >
                  <X className="w-3.5 h-3.5" /> إلغاء
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-cream-dim text-xs">الاسم الكامل</dt>
                <dd className="text-cream mt-1">
                  {order.customerFirstName} {order.customerLastName}
                </dd>
              </div>
              <div>
                <dt className="text-cream-dim text-xs">الهاتف</dt>
                <dd className="text-cream mt-1" dir="ltr">
                  <a href={`tel:${order.phone}`} className="hover:text-gold hover:underline">
                    {order.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-cream-dim text-xs">الولاية</dt>
                <dd className="text-cream mt-1">{order.wilayaName}</dd>
              </div>
              <div>
                <dt className="text-cream-dim text-xs">البلدية</dt>
                <dd className="text-cream mt-1">{order.commune}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-cream-dim text-xs">العنوان</dt>
                <dd className="text-cream mt-1">{order.address || "— (لم يُحدَّد)"}</dd>
              </div>
              <div>
                <dt className="text-cream-dim text-xs">نوع التوصيل</dt>
                <dd className="text-cream mt-1">
                  {order.deliveryOption === "office" ? "توصيل للمكتب" : "توصيل للمنزل"}
                </dd>
              </div>
              <div>
                <dt className="text-cream-dim text-xs">مصدر الطلب</dt>
                <dd className="text-cream mt-1">{order.source}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <h2 className="font-display font-semibold text-gold mb-4">المنتجات</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm border-b border-gold/10 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-cream">{item.productNameSnapshot}</p>
                  {item.variantLabelSnapshot && (
                    <p className="text-cream-dim text-xs">{item.variantLabelSnapshot}</p>
                  )}
                  <p className="text-cream-dim text-xs">
                    {formatPrice(item.unitPriceDzd)} × {item.quantity}
                  </p>
                </div>
                <span className="text-gold font-semibold">{formatPrice(item.lineTotalDzd)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gold/15 space-y-1.5 text-sm">
            <div className="flex justify-between text-cream-dim">
              <span>مجموع المنتجات</span>
              <span>{formatPrice(order.itemsSubtotalDzd)}</span>
            </div>
            <div className="flex justify-between text-cream-dim">
              <span>سعر التوصيل</span>
              <span>{formatPrice(order.deliveryPriceDzd)}</span>
            </div>
            <div className="flex justify-between font-bold text-gold pt-1.5 border-t border-gold/10">
              <span>المجموع الكلي</span>
              <span>{formatPrice(order.totalDzd)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <h2 className="font-display font-semibold text-gold mb-4">ملاحظات داخلية</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
          />
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={saving}
            className="mt-3 gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ الملاحظات"}
          </button>
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-gold">جدولة إعادة الاتصال</h2>
            <span className="text-xs text-cream-dim">
              محاولات الاتصال: <span className="text-cream font-semibold">{order.callAttempts}</span>
            </span>
          </div>
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">موعد إعادة الاتصال التالي (اختياري)</span>
            <input
              type="datetime-local"
              value={nextCallAt}
              onChange={(e) => setNextCallAt(e.target.value)}
              className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
            />
          </label>
          <button
            type="button"
            onClick={handleSaveNextCallAt}
            disabled={savingCallback}
            className="mt-3 gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {savingCallback ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ الموعد"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl gold-border bg-ink p-5">
          <h2 className="font-display font-semibold text-gold mb-3">الحالة</h2>
          <OrderStatusBadge status={order.status} />
          <select
            value={order.status}
            onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
            disabled={saving}
            data-testid="order-status-select"
            className="w-full mt-3 rounded-lg bg-black border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
          >
            {ORDER_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-gold">التوصيل / شركة الشحن</h2>
            {!editingCourier && (
              <button
                type="button"
                onClick={startEditingCourier}
                className="text-gold text-xs flex items-center gap-1 hover:underline"
              >
                <Pencil className="w-3.5 h-3.5" /> تعديل
              </button>
            )}
          </div>

          {editingCourier ? (
            <div className="space-y-3">
              <Field label="الشركة">
                <input
                  type="text"
                  value={courierProvider}
                  onChange={(e) => setCourierProvider(e.target.value)}
                  placeholder="مثال: DHD"
                  className={editInputClass}
                />
              </Field>
              <Field label="رقم التتبع">
                <input
                  type="text"
                  dir="ltr"
                  value={courierTrackingId}
                  onChange={(e) => setCourierTrackingId(e.target.value)}
                  className={editInputClass}
                />
              </Field>

              {courierError && <p className="text-xs text-red-400">{courierError}</p>}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveCourier}
                  disabled={savingCourier}
                  className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {savingCourier ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCourier(false)}
                  disabled={savingCourier}
                  className="text-cream-dim text-sm flex items-center gap-1 hover:text-cream"
                >
                  <X className="w-3.5 h-3.5" /> إلغاء
                </button>
              </div>
            </div>
          ) : (
            <>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between text-cream-dim">
                  <dt>الشركة</dt>
                  <dd>{order.courierProvider ?? "—"}</dd>
                </div>
                <div className="flex justify-between text-cream-dim">
                  <dt>رقم التتبع</dt>
                  <dd dir="ltr">{order.courierTrackingId ?? "—"}</dd>
                </div>
                <div className="flex justify-between text-cream-dim">
                  <dt>حالة الشحن</dt>
                  <dd>{order.courierStatus ?? "—"}</dd>
                </div>
              </dl>

              {order.courierProvider === "DHD" && order.courierTrackingId && (
                <button
                  type="button"
                  onClick={handleRefreshCourierStatus}
                  disabled={refreshingStatus}
                  className="mt-3 w-full border border-gold/25 text-gold text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5 hover:bg-gold/10"
                >
                  {refreshingStatus ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  تحديث حالة الشحن
                </button>
              )}

              {!order.courierTrackingId && (
                <button
                  type="button"
                  onClick={() => handleSendToDhd()}
                  disabled={sendingToDhd}
                  className="mt-3 w-full gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {sendingToDhd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  إرسال الشحنة إلى DHD
                </button>
              )}
              {courierError && <p className="text-xs text-red-400 mt-2">{courierError}</p>}

              {loadingDhdCommunes && (
                <p className="text-xs text-cream-dim mt-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري جلب البلديات المقبولة عند DHD...
                </p>
              )}

              {dhdCommunes && (
                <div className="mt-3 space-y-2 rounded-lg border border-gold/15 p-3">
                  <p className="text-xs text-cream-dim">
                    بلديات DHD مسجّلة بالحروف اللاتينية فقط. {selectedDhdCommune
                      ? `اقترحنا "${selectedDhdCommune}" كمطابقة لـ "${order.commune}" — تأكد منها أو غيّرها،`
                      : `اختر البلدية المطابقة لـ "${order.commune}"،`}{" "}
                    وسيتم حفظها تلقائيًا فلن تُسأل عنها مرة أخرى لنفس البلدية:
                  </p>
                  <select
                    value={selectedDhdCommune}
                    onChange={(e) => setSelectedDhdCommune(e.target.value)}
                    className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
                  >
                    <option value="">اختر بلدية...</option>
                    {dhdCommunes.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                        {c.hasStopDesk ? " (يوجد مكتب استلام)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => selectedDhdCommune && handleSendToDhd(selectedDhdCommune)}
                    disabled={!selectedDhdCommune || sendingToDhd}
                    className="w-full gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {sendingToDhd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    إعادة الإرسال بهذه البلدية
                  </button>
                </div>
              )}

              {!order.courierProvider && !order.courierTrackingId && (
                <p className="text-xs text-cream-dim/80 leading-relaxed mt-3">
                  اضغط &quot;إرسال الشحنة إلى DHD&quot; لإنشاء شحنة حقيقية تلقائيًا، أو &quot;تعديل&quot; لإدخال رقم تتبع شحنة أُنشئت يدويًا.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
