"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttributionFromUrl } from "@/lib/tracking";

function PageViewTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    captureAttributionFromUrl(searchParams);

    try {
      void fetch("/api/track/pageview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      });
    } catch {
      // تتبع اختياري بحت — أي فشل يُتجاهل بصمت
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

// useSearchParams() يتطلب حدود Suspense وإلا يفشل التصدير الثابت (static export) لصفحات
// مثل /blog/[slug] — هذا الغلاف يعزل ذلك بلا ما يؤثر على بقية الصفحة.
export default function PageViewTracker() {
  return (
    <Suspense fallback={null}>
      <PageViewTrackerInner />
    </Suspense>
  );
}
