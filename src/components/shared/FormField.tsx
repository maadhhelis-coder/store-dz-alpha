import type { ReactNode } from "react";

// مصدر واحد لتصميم حقول النماذج (تسمية + مساحة الإدخال) — كان مكررًا حرفيًا فـ 17 ملفًا
// فـ لوحة التحكم وفـ نافذة الطلب، ما يعني تعديل الحشو أو نصف القطر يتطلب تعديل 17 مكان.
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-cream-dim mb-1.5 block">{label}</span>
      {children}
      {error && <span className="text-[11px] text-red-400 mt-1 block">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold transition-colors";

export const inputClassLtr = `${inputClass} text-left`;
