import type { Metadata } from "next";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/data/site";
import { getSiteSettings } from "@/server/services/siteSettingsService";

// الأوزان محصورة فقط فيما يُستعمل فعليًا فالكود (تحقّقنا عبر grep عن كل أصناف
// font-* المستعملة) — كل وزن إضافي غير مستخدم يعني ملفات خطوط زائدة تُبطئ التحميل الأول.
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "800"],
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "700", "800"],
});

// revalidate مضبوط فطبقة (storefront)/layout.tsx تحديدًا، لا هنا — الجذر يُغلّف أيضًا /admin
// الذي له احتياجات تحديث مختلفة تمامًا (وأصلًا ديناميكي حكمًا بسبب قراءة جلسة المصادقة).
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const favicon = settings.faviconUrl || "/images/brand/logo-on-black.png";

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE_NAME} — ${SITE_TAGLINE}`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_TAGLINE,
    robots: {
      index: true,
      follow: true,
    },
    icons: {
      icon: favicon,
      apple: favicon,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${tajawal.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-cream">{children}</body>
    </html>
  );
}
