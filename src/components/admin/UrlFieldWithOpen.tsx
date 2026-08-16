"use client";

import { ExternalLink } from "lucide-react";
import { inputClassLtr } from "@/components/shared/FormField";

type UrlFieldWithOpenProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  // للحقول التي تخزّن اسم نطاق مجرّد بلا https:// (مثل نطاق المتجر) — يفتح الرابط
  // بإضافة https:// تلقائيًا بدل اشتراط أن يكتبها المستخدم بنفسه.
  autoPrefixHttps?: boolean;
};

// حقل رابط + زر "فتح" منفصل يعمل فقط عندما يكون الرابط معبّأ وصالحًا — يفتح في تبويب
// جديد بلا ما يفقد المستخدم التغييرات غير المحفوظة في النموذج. يُستعمل في كل حقول
// الروابط عبر لوحة الإعدادات لضمان أن أي رابط مُدخل قابل للاختبار فورًا.
export default function UrlFieldWithOpen({
  value,
  onChange,
  placeholder,
  className,
  autoPrefixHttps,
}: UrlFieldWithOpenProps) {
  const trimmed = value.trim();
  const isFullUrl = /^https?:\/\/.+/i.test(trimmed);
  const isBareDomain = autoPrefixHttps && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed);
  const openHref = isFullUrl ? trimmed : isBareDomain ? `https://${trimmed}` : undefined;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        dir="ltr"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={(className ?? inputClassLtr) + " flex-1"}
      />
      <a
        href={openHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="فتح الرابط في تبويب جديد"
        className={
          "shrink-0 rounded-lg border border-gold/25 p-2.5 text-gold transition-colors " +
          (openHref ? "hover:bg-gold/10 cursor-pointer" : "opacity-30 pointer-events-none")
        }
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
