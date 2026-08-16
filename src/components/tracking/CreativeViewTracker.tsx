"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackCreativeEvent, type PageKindValue } from "@/lib/tracking";
import { trackViewContent } from "@/lib/trackConversion";

type CreativeViewTrackerProps = {
  pageKind: PageKindValue;
  productSlug: string;
  productName?: string;
  price?: number;
};

// مكوّن صغير بلا أي عرض مرئي — يسجّل حدث "page_view" الداخلي (لوحة تحكم المتجر) مرة واحدة
// عند تحميل صفحة منتج أو صفحة هبوط، ويُطلق بالتوازي حدث ViewContent الحقيقي على بيكسلات
// الإعلانات (ميتا/تيك توك/GA4/سناب) — بلا حاجة لتحويل صفحة المنتج (Server Component) بالكامل لعميل.
export default function CreativeViewTracker({ pageKind, productSlug, productName, price }: CreativeViewTrackerProps) {
  const pathname = usePathname();

  useEffect(() => {
    trackCreativeEvent("page_view", pageKind, pathname, productSlug);
    trackViewContent({ contentId: productSlug, contentName: productName, value: price });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, productSlug]);

  return null;
}
