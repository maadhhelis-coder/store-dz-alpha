import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSiteSettings } from "@/server/services/siteSettingsService";
import SettingsTabs from "@/components/admin/SettingsTabs";
import DeliveryPricingTable from "@/components/admin/DeliveryPricingTable";
import AccountSettingsForm from "@/components/admin/AccountSettingsForm";
import SiteDetailsSettingsForm from "@/components/admin/SiteDetailsSettingsForm";
import SiteFormSettingsForm from "@/components/admin/SiteFormSettingsForm";
import AppearanceSettingsForm from "@/components/admin/AppearanceSettingsForm";
import DomainSettingsForm from "@/components/admin/DomainSettingsForm";
import CourierIntegrationsSettings from "@/components/admin/CourierIntegrationsSettings";
import NotificationsSettingsForm from "@/components/admin/NotificationsSettingsForm";
import WebhooksSettings from "@/components/admin/WebhooksSettings";
import ApiKeysSettings from "@/components/admin/ApiKeysSettings";
import MessagingIntegrationSettings from "@/components/admin/MessagingIntegrationSettings";
import SecuritySettingsForm from "@/components/admin/SecuritySettingsForm";
import TrackingPixelsSettingsForm from "@/components/admin/TrackingPixelsSettingsForm";

// دائمًا ديناميكية بلا أي تخزين مؤقت — إعدادات حسّاسة (مفاتيح API، توكنات) يجب أن تعكس
// آخر حالة حقيقية في قاعدة البيانات على كل تحميل، بلا استثناء.
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const rawSiteSettings = await getSiteSettings();
  // لا تُمرَّر توكنات Meta/TikTok الفعلية لأي مكوّن عميل (Client Component) — Next.js
  // يُسلسل (serialize) الكائن كاملًا فحمولة RSC المرسلة للمتصفح مهما كانت الحقول التي
  // يقرؤها المكوّن فعليًا، فكشفها هنا أخطر من كشفها عبر endpoint عادي.
  const {
    metaCapiAccessToken: _metaCapiAccessToken,
    tiktokEventsApiAccessToken: _tiktokEventsApiAccessToken,
    metaAdsInsightsAccessToken: _metaAdsInsightsAccessToken,
    tiktokAdsReportAccessToken: _tiktokAdsReportAccessToken,
    ...siteSettings
  } = rawSiteSettings;

  const tabs = [
    {
      id: "general",
      label: "عام",
      content: (
        <div className="space-y-10">
          <section>
            <h2 className="font-display font-semibold text-gold mb-4">أسعار التوصيل</h2>
            <DeliveryPricingTable />
          </section>
          <section>
            <h2 className="font-display font-semibold text-gold mb-4">الحساب</h2>
            <AccountSettingsForm email={admin.email} initialFullName={admin.fullName} />
          </section>
        </div>
      ),
    },
    {
      id: "details",
      label: "التفاصيل",
      content: <SiteDetailsSettingsForm initialSettings={siteSettings} />,
    },
    {
      id: "form",
      label: "الفورم",
      content: <SiteFormSettingsForm initialSettings={siteSettings} />,
    },
    {
      id: "appearance",
      label: "المظهر",
      content: <AppearanceSettingsForm />,
    },
    {
      id: "domain",
      label: "اسم النطاق",
      content: <DomainSettingsForm initialSettings={siteSettings} />,
    },
    {
      id: "tracking-pixels",
      label: "بيكسلات التتبع",
      content: <TrackingPixelsSettingsForm initialSettings={siteSettings} />,
    },
    {
      id: "delivery-companies",
      label: "شركات التوصيل",
      content: <CourierIntegrationsSettings />,
    },
    {
      id: "notifications",
      label: "الإشعارات",
      content: <NotificationsSettingsForm initialSettings={siteSettings} />,
    },
    {
      id: "webhooks",
      label: "Web Hooks",
      content: (
        <div className="space-y-10">
          <WebhooksSettings />
          <ApiKeysSettings />
        </div>
      ),
    },
    {
      id: "messaging",
      label: "تكامل المراسلة",
      content: <MessagingIntegrationSettings />,
    },
    {
      id: "security",
      label: "الأمان",
      content: (
        <SecuritySettingsForm
          initialSettings={siteSettings}
          encryptionKeyMissing={!process.env.SECRETS_ENCRYPTION_KEY}
        />
      ),
    },
  ];

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-6">الإعدادات</h1>
      <SettingsTabs tabs={tabs} />
    </div>
  );
}
