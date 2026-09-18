import { hasPermission } from "@/lib/auth/requirePermission";
import { listCommunications } from "@/server/modules/communications/communicationService";
import { SendCommunicationForm, CommunicationRowActions } from "@/components/admin/crm/CommunicationActions";
import { moment } from "@/components/admin/crm/financeLabels";

// لوحة التواصل في صفحة الطلب — السجل بحالاته الحقيقية (لا "sent" بلا تأكيد مزوّد).

const STATUS_LABELS: Record<string, string> = {
  queued: "معلّقة",
  sending: "قيد الإرسال",
  sent: "أُرسلت",
  delivered: "وصلت",
  failed: "فشلت",
  cancelled: "أُلغيت",
};

export default async function CommunicationsPanel({ orderId, isTest }: { orderId: string; isTest: boolean }) {
  const [canRead, canSend] = await Promise.all([hasPermission("communications.read"), hasPermission("communications.send")]);
  if (!canRead) return null;
  const { items } = await listCommunications({ orderId, page: 1, pageSize: 50 });

  return (
    <div className="gold-border bg-ink rounded-xl p-5 mt-6" data-testid="communications-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-cream">التواصل مع الزبون</h2>
        {canSend && !isTest && <SendCommunicationForm orderId={orderId} />}
      </div>
      {isTest ? (
        <p className="text-sm text-cream-dim">طلب اختبار — لا تواصل حقيقي.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-cream-dim">لا رسائل بعد.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {items.map((c) => {
            const url = (c.providerResponse as { url?: string } | null)?.url ?? null;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/15 p-2 text-cream-dim" data-testid={"comm-" + c.id}>
                <span>
                  <span className="text-cream font-semibold" data-testid={"comm-status-" + c.id}>{STATUS_LABELS[c.status] ?? c.status}</span>
                  {" · "}{c.channel}/{c.provider} · {c.template ?? "—"}
                  {c.error && <span className="ms-2 text-amber-400">{c.error}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span dir="ltr">{moment(c.createdAt)}</span>
                  {canSend && <CommunicationRowActions id={c.id} status={c.status} url={url} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
