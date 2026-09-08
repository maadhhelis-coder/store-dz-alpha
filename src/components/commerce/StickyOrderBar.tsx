"use client";

import { useEffect, useState } from "react";
import OrderNowButton, { ORDER_FORM_ID } from "@/components/order/OrderNowButton";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";

// الشريط الثابت أسفل صفحة المنتج: ظاهر طوال التصفّح ولا يختفي مع التمرير.
//
// الاستثناء الوحيد: بينما الاستمارة نفسها أمام الزبون. الشريط fixed فوق كل شيء،
// فحين يقع زر «تأكيد الطلبية» تحته تصيبه النقرة بدل الزر — أي طلب لا يُرسَل
// (ظهر في CI على webkit). وهو في تلك اللحظة زائد أصلًا: الاستمارة أمامه.
export default function StickyOrderBar({ product }: { product: Product }) {
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const form = document.getElementById(ORDER_FORM_ID);
    if (!form) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFormVisible(entry.isIntersecting),
      { rootMargin: "-80px 0px -80px 0px" },
    );
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  if (formVisible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-black/95 backdrop-blur border-t border-gold/15 p-2.5">
      <div className="container-page flex items-center gap-3">
        <span className="shrink-0 text-lg font-bold text-gold">{formatPrice(product.price)}</span>
        <OrderNowButton product={product} variant="sticky-bar" target="form" className="flex-1" />
      </div>
    </div>
  );
}
