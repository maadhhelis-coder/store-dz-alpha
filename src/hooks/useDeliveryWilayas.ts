import { useEffect, useState } from "react";

export type RemoteWilaya = {
  code: number;
  name: string;
  officePriceDzd: number | null;
  homePriceDzd: number;
};

// أسعار التوصيل الحقيقية من قاعدة البيانات (نفس ما يضبطه صاحب المتجر من لوحة التحكم) —
// بدل نسخة ثابتة قد تختلف عنها وتُفاجئ الزبون بسعر مختلف بعد الإرسال.
export function useDeliveryWilayas(): RemoteWilaya[] {
  const [remoteWilayas, setRemoteWilayas] = useState<RemoteWilaya[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wilayas")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRemoteWilayas(data.wilayas ?? []);
      })
      .catch(() => {
        if (!cancelled) setRemoteWilayas([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return remoteWilayas;
}
