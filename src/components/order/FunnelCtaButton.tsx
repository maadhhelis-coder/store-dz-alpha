"use client";

import OrderNowButton from "@/components/order/OrderNowButton";
import type { Product } from "@/data/products";

// زر صفحة الهبوط — نفس زر "اطلب الآن" بنصّ الفانل القابل للضبط. يوجّه لصفحة
// المنتج حيث الاستمارة المدمجة (طلب صريح: لا نافذة منبثقة في أي مكان).

export default function FunnelCtaButton({
  product,
  ctaText,
  className,
}: {
  product: Product;
  ctaText: string;
  className?: string;
}) {
  return (
    <OrderNowButton
      product={product}
      variant="primary-large"
      pageKind="landing"
      label={ctaText}
      className={className}
    />
  );
}
