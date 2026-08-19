"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { getOrCreateVisitorId } from "@/lib/tracking";

function report(metric: Metric) {
  try {
    void fetch("/api/track/web-vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // window.location.pathname مقصود هنا لا usePathname() — هذه المقاييس تقيس تحميل
      // الصفحة الحقيقي (Navigation Timing) لا "الصفحة الافتراضية" الحالية فتنقّل SPA، ولا
      // يُبلَّغ عنها إلا عند استقرارها النهائي (غالبًا عند إخفاء الصفحة) — قراءة المسار حينها
      // مباشرة تضمن نسبتها للصفحة الصحيحة فعليًا بلا الحاجة لإعادة تسجيل المراقبين مع كل
      // تنقّل SPA (وهو ما كان سيُنتج تكرارًا فتقارير هذا المكوّن).
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        path: window.location.pathname,
        visitorId: getOrCreateVisitorId(),
      }),
      keepalive: true,
    });
  } catch {
    // تتبع اختياري بحت — أي فشل يُتجاهل بصمت
  }
}

// مقاييس Core Web Vitals حقيقية من زوّار حقيقيين (RUM) — لا بديل تركيبي. تُسجَّل مرّة واحدة
// فحياة الصفحة الفعلية بأكملها (لا تُعاد التسجيل مع كل تنقّل SPA — راجع ملاحظة المسار أعلاه).
export default function WebVitalsReporter() {
  useEffect(() => {
    onCLS(report);
    onFCP(report);
    onINP(report);
    onLCP(report);
    onTTFB(report);
  }, []);

  return null;
}
