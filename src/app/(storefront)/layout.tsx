import { headers } from "next/headers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import PageViewTracker from "@/components/layout/PageViewTracker";
import WebVitalsReporter from "@/components/layout/WebVitalsReporter";
import TrackingPixels from "@/components/layout/TrackingPixels";
import WhatsAppFloatingButton from "@/components/layout/WhatsAppFloatingButton";
import OrderModalProvider from "@/components/order/OrderModalProvider";
import JsonLd from "@/components/shared/JsonLd";
import { organizationJsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/server/services/siteSettingsService";

// لا ISR ثابتة هنا (كانت revalidate=60 سابقًا) — CSP nonce (middleware.ts) يجب أن يتغيّر
// كل طلب لإزالة 'unsafe-inline' من script-src بأمان حقيقي؛ nonce ثابت لفترة (حتى لو
// قصيرة) يصبح متوقَّعًا لمهاجم يملك ثغرة XSS منفصلة، ما يُبطل الحماية. قراءة headers()
// أدناه (Dynamic API) هي ما يفرض rendering لكل طلب فعليًا — راجع middleware.ts للتفاصيل.
export default async function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [settings, requestHeaders] = await Promise.all([getSiteSettings(), headers()]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    <OrderModalProvider
      settings={{
        thankYouMessage: settings.thankYouMessage,
        thankYouPageUrl: settings.thankYouPageUrl,
        privacyPolicyText: settings.privacyPolicyText,
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] gold-gradient text-ink font-bold px-4 py-2 rounded-lg"
      >
        تخطي إلى المحتوى الرئيسي
      </a>
      <JsonLd data={organizationJsonLd()} />
      <PageViewTracker />
      <WebVitalsReporter />
      <TrackingPixels
        metaPixelId={settings.metaPixelId}
        tiktokPixelId={settings.tiktokPixelId}
        googleTagId={settings.googleTagId}
        snapchatPixelId={settings.snapchatPixelId}
        nonce={nonce}
      />
      {settings.announcementBarEnabled && settings.announcementBarText && (
        <AnnouncementBar text={settings.announcementBarText} />
      )}
      <Header
        logoUrl={settings.logoUrl}
        instagramUrl={settings.instagramUrl}
        facebookUrl={settings.facebookUrl}
        tiktokUrl={settings.tiktokUrl}
      />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer
        logoUrl={settings.logoUrl}
        instagramUrl={settings.instagramUrl}
        facebookUrl={settings.facebookUrl}
        tiktokUrl={settings.tiktokUrl}
      />
      <WhatsAppFloatingButton />
    </OrderModalProvider>
  );
}
