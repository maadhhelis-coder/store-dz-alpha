import { cache } from "react";
import * as siteSettingsRepository from "@/server/repositories/siteSettingsRepository";
import { encryptSecretIfPresent } from "@/lib/crypto/secretBox";
import type { SiteSettingsUpdateInput } from "@/lib/validation/siteSettingsSchema";

// cache() يُوحِّد استدعاءات getSiteSettings المتعددة فنفس دورة الطلب (root layout.tsx
// و(storefront)/layout.tsx يستدعيانها منفصلين حاليًا) إلى استعلام واحد فعلي — بلا حاجة
// لتمرير القيمة يدويًا بين الملفين. لا يؤثر على updateSiteSettings لأنها تقرأ من
// siteSettingsRepository مباشرة، فتبقى ترى أحدث صف دائمًا عند التحديث.
export const getSiteSettings = cache(function getSiteSettings() {
  return siteSettingsRepository.getSiteSettings();
});

const AD_TOKEN_FIELDS = [
  "metaCapiAccessToken",
  "tiktokEventsApiAccessToken",
  "metaAdsInsightsAccessToken",
  "tiktokAdsReportAccessToken",
] as const;

export function updateSiteSettings(input: SiteSettingsUpdateInput) {
  const data = { ...input };
  for (const field of AD_TOKEN_FIELDS) {
    if (data[field] !== undefined) {
      data[field] = encryptSecretIfPresent(data[field]);
    }
  }
  return siteSettingsRepository.updateSiteSettings(data);
}
