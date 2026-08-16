import type { LeadStatus } from "@prisma/client";

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: "جديد", color: "#9fc5e8" },
  contacted: { label: "تم التواصل", color: "#ffe599" },
  converted: { label: "تحول لطلب", color: "#b6d7a8" },
  ignored: { label: "متجاهل", color: "#cccccc" },
};

export const LEAD_STATUS_OPTIONS = Object.entries(LEAD_STATUS_META).map(([value, meta]) => ({
  value: value as LeadStatus,
  ...meta,
}));
