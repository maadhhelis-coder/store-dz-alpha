import { useEffect, useState } from "react";

export type UpsellOffer = {
  id: string;
  title: string;
  offerPriceDzd: number;
  offerProduct: { slug: string; name: string; priceDzd: number; imageUrl: string | null };
};

// يجلب عرض الـupsell الفعّال لهذا المنتج (إن وُجد) عند فتح نافذة الطلب.
export function useProductOffer(productSlug: string): UpsellOffer | null {
  const [offer, setOffer] = useState<UpsellOffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/offers?productSlug=${encodeURIComponent(productSlug)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setOffer(data.offers?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setOffer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  return offer;
}
