import type { SiteSettings } from "@prisma/client";

// شكل SiteSettings بعد حذف توكنات Meta/TikTok الفعلية — هذا ما يصل فعليًا لأي مكوّن عميل
// (Client Component)، لأن Next.js يُسلسل الكائن كاملًا فحمولة RSC بغض النظر عن الحقول
// التي يقرؤها المكوّن. راجع src/app/admin/(protected)/settings/page.tsx.
export type PublicSiteSettings = Omit<
  SiteSettings,
  "metaCapiAccessToken" | "tiktokEventsApiAccessToken" | "metaAdsInsightsAccessToken" | "tiktokAdsReportAccessToken"
>;
