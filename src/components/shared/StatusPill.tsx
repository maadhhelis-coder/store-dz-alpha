import { cn } from "@/lib/utils";

// مصدر واحد لألوان شارات الحالة (نشط/معطّل/خطأ/تحذير) — كانت نفس قيم الهيكس الأربع
// مكررة حرفيًا فـ 7 ملفات فلوحة التحكم بلا أي توحيد.
const TONE_CLASS = {
  success: "bg-[#b6d7a8]",
  neutral: "bg-[#cccccc]",
  danger: "bg-[#e06666]",
  warning: "bg-[#f0c26e]",
} as const;

export type StatusPillTone = keyof typeof TONE_CLASS;

export function statusPillClass(tone: StatusPillTone, className?: string) {
  return cn("text-[11px] font-bold px-2.5 py-1 rounded-full text-black", TONE_CLASS[tone], className);
}
