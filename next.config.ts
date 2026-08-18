import type { NextConfig } from "next";
// استيراد نسبي مقصود هنا — next.config.ts يُحمَّل مباشرة عبر Node قبل تطبيق مسارات tsconfig
// (@/...) الخاصة بباقي التطبيق، فاستعمال المسار المستعار قد يفشل عند بدء تشغيل Next.js.
import { SITE_URL } from "./src/data/site";

const nextConfig: NextConfig = {
  // output: "standalone" مطلوب لصورة Docker إنتاجية سليمة: يولّد .next/standalone (server.js
  // مستقل يحمل فقط node_modules الفعليًا المُستعملة) بدل نسخ node_modules كاملة، ويسمح بتشغيل
  // "node server.js" مباشرة كـPID 1 (بدل "next start" عبر مضيف Node)، فتصل إشارات
  // SIGTERM/SIGINT مباشرة للعملية بلا وسيط يبتلعها — هذا ما يجعل Graceful Shutdown ممكنًا فعليًا
  // داخل حاوية.
  //
  // اكتُشف فعليًا (من Build Logs حقيقية على Vercel، وليس افتراضًا): الادعاء السابق هنا بأن
  // "Vercel يتجاهل output عند النشر" كان خاطئًا — output: "standalone" كسر فعليًا خط أنابيب
  // Vercel الخاص بتتبّع الملفات (file tracing) بعد نجاح البناء نفسه تمامًا (compile/typecheck/
  // توليد الصفحات كلها نجحت): "Error: ENOENT: no such file or directory, open
  // '.next/next-server.js.nft.json'" — Vercel يتوقّع بنية إخراج قياسية (غير standalone)
  // لبناء دوال serverless الخاصة به. process.env.VERCEL يُضبَط تلقائيًا فبيئة بناء Vercel نفسها
  // فقط (Docker/E2E المحليان لا يضبطانه أبدًا) — نُعطّل standalone تحديدًا هناك.
  output: process.env.VERCEL ? undefined : "standalone",
  trailingSlash: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wgmfsizdtumonopipvmh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    // Content-Security-Policy انتقلت لـmiddleware.ts — تحتاج nonce عشوائي مختلف لكل طلب
    // (لإزالة 'unsafe-inline' من script-src بأمان حقيقي)، وheaders() هنا دالة تُقيَّم مرة
    // عند البناء (قيم ثابتة لكل المسارات)، لا تصلح لقيمة يجب أن تتغيّر كل طلب. باقي الهيدرز
    // الأمنية هنا لأنها ثابتة فعلًا ولا علاقة لها بالـnonce.
    return [
      {
        // كل الصفحات: حماية أساسية ضد clickjacking واستنشاق نوع المحتوى وXSS.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
      {
        // Deployment Audit MED-05: لا CORS محدَّد صراحةً على أي مسار API — السلوك الفعلي
        // (same-origin فقط) كان آمنًا أصلًا كافتراضي ضمني، لكن غير مُوثَّق ولا مقصود بوضوح.
        // هذا يجعله صريحًا: يسمح فقط بأصل الموقع نفسه (SITE_URL)، لا "*" — لا يوجد حاليًا أي
        // تكامل خارجي (تطبيق جوال، Webhook مستهلك...) يحتاج وصولًا من أصل مختلف؛ حين يظهر
        // احتياج فعلي مستقبلًا تُضاف أصوله هنا صراحةً بدل فتح API للجميع بلا داعٍ.
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: SITE_URL },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, x-api-key" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
