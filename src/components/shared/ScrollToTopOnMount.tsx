"use client";

import { useEffect } from "react";

/**
 * يفتح الصفحة من أعلاها دائمًا.
 *
 * Next يمرّر للأعلى تلقائيًا عند التنقّل، لكن صاحب المتجر يرى الصفحة تُفتح
 * «هابطة» فيختفي فوقها الهيدر وشريط «منتجات تختارها بثقة». لم نستطع إعادة
 * إنتاجها في أدواتنا (التمرير معطّل في معاين المتصفح لدينا)، فبدل تخمين السبب
 * نفرض النتيجة المطلوبة صراحةً.
 *
 * rAF مزدوج لا نداء واحد: المتصفحات تستعيد موضع التمرير أحيانًا *بعد* الترطيب
 * (hydration)، وأحيانًا يزيح المحتوى المتدفّق (Suspense) الصفحة بعد أول رسم —
 * فنداء واحد داخل useEffect قد يسبق الاثنين فيُلغى أثره.
 */
export default function ScrollToTopOnMount() {
  useEffect(() => {
    const toTop = () => window.scrollTo(0, 0);
    toTop();
    const raf = requestAnimationFrame(() => requestAnimationFrame(toTop));
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
