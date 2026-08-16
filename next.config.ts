import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
