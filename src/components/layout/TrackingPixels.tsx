"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type TrackingPixelsProps = {
  metaPixelId?: string | null;
  tiktokPixelId?: string | null;
  googleTagId?: string | null;
  snapchatPixelId?: string | null;
  nonce?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PixelWindow = typeof window & { fbq?: any; ttq?: any; gtag?: any; snaptr?: any; dataLayer?: any[] };

export default function TrackingPixels({
  metaPixelId,
  tiktokPixelId,
  googleTagId,
  snapchatPixelId,
  nonce,
}: TrackingPixelsProps) {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  // تتبّع التنقل بين الصفحات (client-side navigation) — التحميل الأول تُغطّيه أكواد التهيئة
  // نفسها (fbq('track','PageView') وما يعادلها فـ public/pixel-loader.js)، فنتجاهل أول تنفيذ
  // لهذا الـeffect (يحدث حتمًا مرة عند أول mount بغض النظر عن مصفوفة الاعتماديات) لمنع إرسال
  // PageView مرتين لنفس التحميل الأول.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const w = window as PixelWindow;
    try {
      if (metaPixelId && typeof w.fbq === "function") w.fbq("track", "PageView");
    } catch {}
    try {
      if (tiktokPixelId && typeof w.ttq?.page === "function") w.ttq.page();
    } catch {}
    try {
      if (googleTagId && typeof w.gtag === "function") w.gtag("event", "page_view");
    } catch {}
    try {
      if (snapchatPixelId && typeof w.snaptr === "function") w.snaptr("track", "PAGE_VIEW");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const hasAnyPixel = !!(metaPixelId || tiktokPixelId || googleTagId || snapchatPixelId);
  if (!hasAnyPixel) return null;

  // بدل حقن كود التهيئة inline (كان يتطلب 'unsafe-inline' فـCSP script-src — يُضعف الحماية
  // ضد XSS لكل الموقع)، نضع معرّفات البيكسل فـ"جزيرة بيانات" JSON (لا CSP لا تحكمها، لأن
  // type="application/json" ليس نوع سكربت قابلًا للتنفيذ)، ويقرأها سكربت خارجي ثابت
  // (public/pixel-loader.js، مسموح عبر 'self' فـCSP بلا أي استثناء) ويهيّئ كل بيكسل بنفسه.
  const config = JSON.stringify({ metaPixelId, tiktokPixelId, googleTagId, snapchatPixelId }).replace(/</g, "\\u003c");

  return (
    <>
      <script id="pixel-config" type="application/json" dangerouslySetInnerHTML={{ __html: config }} />
      <Script id="pixel-loader" src="/pixel-loader.js" strategy="afterInteractive" nonce={nonce} />
      {googleTagId && (
        <Script
          id="gtag-src"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`}
          nonce={nonce}
        />
      )}
    </>
  );
}
