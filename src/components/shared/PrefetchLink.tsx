"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * رابط يبدأ جلب الصفحة عند *لمس* الزر لا عند ظهوره.
 *
 * الجلب المسبق الكامل (prefetch) جُرّب وأُزيل: كان يُشعل رسمًا كاملًا على الخادم
 * لصفحة كل بطاقة ظاهرة، وتحت تشغيل E2E المتوازي أسقط اختبار السباق. وpointerdown
 * يسبق click بـ~100ms على الهاتف و~50ms على الحاسوب، فيبدأ الجلب مبكرًا بلا أي
 * حِمل على الزوّار الذين لا ينقرون. Next يوحّد الطلب المُعلَّق مع النقلة التالية
 * فلا يُجلب مرتين.
 *
 * prefetch={false} لا تعني «بلا جلب»: على الحاسوب يبقى الجلب عند مرور المؤشّر.
 */
export default function PrefetchLink({
  href,
  onPointerDown,
  ...props
}: ComponentProps<typeof Link>) {
  const router = useRouter();

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onPointerDown={(event) => {
        if (typeof href === "string") router.prefetch(href);
        onPointerDown?.(event);
      }}
    />
  );
}
