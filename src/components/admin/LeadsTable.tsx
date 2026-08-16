"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";
import type { Lead, LeadStatus } from "@prisma/client";
import DataTablePagination from "@/components/admin/DataTablePagination";
import { LEAD_STATUS_META, LEAD_STATUS_OPTIONS } from "@/lib/leadStatus";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const PAGE_SIZE = 20;

export default function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());

    try {
      const res = await fetch(`/api/admin/leads?${params.toString()}`);
      const data = await res.json();
      setLeads(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    // جلب البيانات عند التحميل وعند تغيّر الفلاتر — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads();
  }, [fetchLeads]);

  async function handleStatusChange(leadId: string, newStatus: LeadStatus) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
    await fetch(`/api/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`هل تريد حذف العميل المحتمل "${name || "بدون اسم"}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
    await fetchLeads();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-cream-dim" />
          <input
            type="text"
            placeholder="بحث بالاسم أو الهاتف"
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
            setStatus(e.target.value as LeadStatus | "");
          }}
          className="rounded-lg bg-ink border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
        >
          <option value="">كل الحالات</option>
          {LEAD_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الاسم</th>
              <th scope="col" className="p-3 text-start">الهاتف</th>
              <th scope="col" className="p-3 text-start">الولاية</th>
              <th scope="col" className="p-3 text-start">المنتج</th>
              <th scope="col" className="p-3 text-start">الحالة</th>
              <th scope="col" className="p-3 text-start">التاريخ</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-cream-dim">
                  لا يوجد عملاء محتملون بعد
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-b border-gold/10 last:border-0 hover:bg-black/30">
                  <td className="p-3 text-cream">
                    {lead.firstName || lead.lastName
                      ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
                      : "—"}
                  </td>
                  <td className="p-3 text-cream-dim" dir="ltr">
                    {lead.phone ?? "—"}
                  </td>
                  <td className="p-3 text-cream-dim">{lead.wilayaName ?? "—"}</td>
                  <td className="p-3 text-cream-dim">{lead.productName ?? "—"}</td>
                  <td className="p-3">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                      className="bg-transparent text-xs border-0 rounded focus:outline-none focus:ring-2 focus:ring-gold"
                    >
                      {LEAD_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1">
                      <span
                        className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full text-black"
                        style={{ backgroundColor: LEAD_STATUS_META[lead.status].color }}
                      >
                        {LEAD_STATUS_META[lead.status].label}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-cream-dim text-xs">
                    {new Date(lead.createdAt).toLocaleDateString("ar-DZ-u-nu-latn")}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {lead.phone && (
                        <a
                          href={buildWhatsAppUrl(
                            `مرحبا${lead.firstName ? " " + lead.firstName : ""}، لاحظنا أنك بدأت طلب${
                              lead.productName ? " " + lead.productName : ""
                            } ولم تكمله. هل تحتاج مساعدة؟`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gold text-xs hover:underline"
                        >
                          تواصل عبر واتساب
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(lead.id, `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim())
                        }
                        className="text-red-400 hover:text-red-300"
                        aria-label="حذف العميل المحتمل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
