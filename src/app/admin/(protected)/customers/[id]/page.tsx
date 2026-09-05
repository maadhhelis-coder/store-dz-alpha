import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth/requirePermission";
import { formatDate, formatPrice } from "@/lib/format";
import { getCustomer360 } from "@/server/modules/customers/customerQueryService";
import { METRIC_BASIS_LABELS, type CustomerMetrics } from "@/server/modules/metrics/definitions";
import {
  RISK_LABELS,
  STATUS_LABELS,
  SEGMENT_LABELS,
  TIMELINE_TYPE_LABELS,
} from "@/components/admin/crm/customerLabels";

export const metadata: Metadata = {
  title: "ملف العميل — إدارة المتجر",
  robots: { index: false, follow: false },
};

// Customer 360 — customers.read. لا حساب مالي في هذه الصفحة إطلاقًا: كل رقم
// يأتي محسوبًا من getCustomer360 (‏metrics/definitions.ts)، والعرض يمر على
// مفاتيح METRIC_BASIS_LABELS نفسها كي يستحيل عرض رقم بلا أساس معلن.
// loading/error: حدود (protected)/loading.tsx و error.tsx القائمة تغطي الصفحة.

// ordersCount عدّاد لا مبلغ — بقية مفاتيح الأساس كلها DZD
const COUNT_METRIC_KEYS = new Set(["ordersCount"]);

const METRIC_ORDER = Object.keys(METRIC_BASIS_LABELS) as (keyof typeof METRIC_BASIS_LABELS)[];

export default async function Customer360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tl?: string }>;
}) {
  await requirePermission("customers.read");

  const { id } = await params;
  const { tl } = await searchParams;
  const data = await getCustomer360({ customerId: id, timelineCursor: tl ?? null });
  if (!data) notFound();

  const { customer, metrics, orders, fraudSignals, timeline, timelineNextCursor, mergeHistory } =
    data;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للعملاء
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{customer.fullName}</h1>
          <p className="font-mono text-sm text-neutral-500" dir="ltr">
            {customer.phoneMasked}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-neutral-300 px-3 py-1">
            {STATUS_LABELS[customer.status] ?? customer.status}
          </span>
          <span className="rounded-full border border-neutral-300 px-3 py-1">
            مخاطرة: {RISK_LABELS[customer.riskLevel] ?? customer.riskLevel} ({customer.riskScore})
          </span>
          {customer.segments.map((s) => (
            <span
              key={s.segment}
              className={`rounded-full px-3 py-1 ${s.isPrimary ? "bg-black text-white" : "border border-neutral-300"}`}
            >
              {SEGMENT_LABELS[s.segment] ?? s.segment}
            </span>
          ))}
        </div>
      </header>

      {/* KPI strip — أساس كل رقم معروض تحته حرفيًا من المصدر الرسمي */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_ORDER.map((key) => {
          const value = metrics[key as keyof CustomerMetrics];
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-lg font-bold">
                {COUNT_METRIC_KEYS.has(key) ? value : formatPrice(value)}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                {METRIC_BASIS_LABELS[key]}
              </p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <span className="text-neutral-500">طلبات معترف بها</span>
          <div className="font-semibold">{metrics.recognizedOrdersCount}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <span className="text-neutral-500">طلبات مرتجعة بعد التسليم</span>
          <div className="font-semibold">{metrics.returnedOrdersCount}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <span className="text-neutral-500">بنود بتكلفة غير معلومة</span>
          <div className="font-semibold">{metrics.ordersWithUnknownItemCost}</div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-3 font-bold">معلومات العميل</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <Field label="الولاية">{customer.wilayaCode ?? "—"}</Field>
          <Field label="البلدية">{customer.commune ?? "—"}</Field>
          <Field label="العنوان">{customer.address ?? "—"}</Field>
          <Field label="أول طلب">
            {customer.firstOrderAt ? formatDate(customer.firstOrderAt.toISOString()) : "—"}
          </Field>
          <Field label="آخر طلب">
            {customer.lastOrderAt ? formatDate(customer.lastOrderAt.toISOString()) : "—"}
          </Field>
          <Field label="الوسوم">{customer.tags.length > 0 ? customer.tags.join("، ") : "—"}</Field>
          <Field label="الهواتف">
            <span className="font-mono" dir="ltr">
              {customer.phones.length > 0
                ? customer.phones.map((p) => p.phoneMasked).join(" / ")
                : customer.phoneMasked}
            </span>
          </Field>
          <Field label="ملاحظة داخلية">{customer.notesInternal ?? "—"}</Field>
        </dl>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-3 font-bold">المخاطرة والاحتيال</h2>
        <p className="text-xs text-neutral-500">
          محرك {customer.riskEngineVersion ?? "—"} —{" "}
          {customer.riskCalculatedAt
            ? `آخر حساب ${formatDate(customer.riskCalculatedAt.toISOString())}`
            : "لم يُحسب بعد"}
        </p>
        {fraudSignals.length === 0 ? (
          <p className="mt-3 text-neutral-500">لا إشارات احتيال مسجّلة</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {fraudSignals.map((signal) => (
              <li key={signal.id} className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-neutral-300 px-2 py-0.5 text-xs">
                  {signal.severity}
                </span>
                <span className="font-semibold">{signal.signal}</span>
                <span className="text-xs text-neutral-500">
                  {signal.status} — {formatDate(signal.detectedAt.toISOString())}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-bold">الطلبات</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-neutral-500">لا طلبات إنتاجية لهذا العميل</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="px-2 py-2 text-start">الرقم</th>
                  <th className="px-2 py-2 text-start">الحالة</th>
                  <th className="px-2 py-2 text-start">الإجمالي</th>
                  <th className="px-2 py-2 text-start">أُنشئ</th>
                  <th className="px-2 py-2 text-start">سُلِّم</th>
                  <th className="px-2 py-2 text-start">حُصِّل</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-neutral-100">
                    <td className="px-2 py-2">
                      <Link href={`/admin/orders/${order.id}`} className="hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{order.status}</td>
                    <td className="px-2 py-2">{formatPrice(order.totalDzd)}</td>
                    <td className="px-2 py-2 text-neutral-500">
                      {formatDate(order.createdAt.toISOString())}
                    </td>
                    <td className="px-2 py-2 text-neutral-500">
                      {order.deliveredAt ? formatDate(order.deliveredAt.toISOString()) : "—"}
                    </td>
                    <td className="px-2 py-2 text-neutral-500">
                      {order.codCollectedAt ? formatDate(order.codCollectedAt.toISOString()) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-bold">الخط الزمني</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-neutral-500">لا أحداث مسجّلة</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {timeline.map((entry) => (
              <li key={`${entry.type}:${entry.id}`} className="border-s-2 border-neutral-200 ps-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                    {TIMELINE_TYPE_LABELS[entry.type] ?? entry.type}
                  </span>
                  <span className="font-semibold">{entry.title}</span>
                </div>
                <p className="text-xs text-neutral-500">
                  {formatDate(entry.createdAt.toISOString())}
                  {entry.actorLabel ? ` — ${entry.actorLabel}` : ""}
                  {entry.detail ? ` — ${entry.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {timelineNextCursor && (
          <Link
            href={`/admin/customers/${customer.id}?tl=${encodeURIComponent(timelineNextCursor)}`}
            className="mt-4 inline-block rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          >
            أحداث أقدم
          </Link>
        )}
        {tl && (
          <Link
            href={`/admin/customers/${customer.id}`}
            className="mt-4 ms-2 inline-block text-sm text-neutral-500"
          >
            العودة لأحدث الأحداث
          </Link>
        )}
      </section>

      {mergeHistory.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          <h2 className="mb-3 font-bold">سجل الدمج</h2>
          <ul className="space-y-1">
            {mergeHistory.map((merge) => (
              <li key={merge.id} className="text-neutral-600">
                {merge.survivorId === customer.id ? "استقبل" : "دُمج في"}{" "}
                <Link
                  href={`/admin/customers/${merge.survivorId === customer.id ? merge.mergedId : merge.survivorId}`}
                  className="font-mono hover:underline"
                >
                  {merge.survivorId === customer.id ? merge.mergedId : merge.survivorId}
                </Link>{" "}
                — {formatDate(merge.createdAt.toISOString())}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
