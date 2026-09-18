import { describe, expect, it, vi } from "vitest";

// مزامنة الإعلانات: منصة بلا معرّف/توكن = configured:false وبلا أي نداء شبكة —
// كانت تُعرض «0 إعلان» كنجاح وهمي (اكتُشف على الإنتاج: TikTok بلا توكن تقرير).

const settings = { metaAdAccountId: "123", metaAdsInsightsAccessToken: "enc", tiktokAdvertiserId: "456", tiktokAdsReportAccessToken: null };
vi.mock("@/server/services/siteSettingsService", () => ({ getSiteSettings: async () => settings }));
vi.mock("@/server/repositories/adSpendRepository", () => ({ upsertSyncedAdSpend: async () => undefined }));
vi.mock("@/server/db/prisma", () => ({ prisma: { siteSettings: { update: async () => undefined }, siteSetting: { update: async () => undefined }, adSpendEntry: { updateMany: async () => undefined } } }));
vi.mock("@/lib/crypto/secretBox", () => ({ decryptSecret: (v: string) => v }));

import { syncAllAds } from "@/server/services/adsSyncService";

describe("syncAllAds — configured flag", () => {
  it("منصة ناقصة الإعداد → configured:false بلا fetch؛ المضبوطة تُستدعى فعلًا", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await syncAllAds();
    expect(r.tiktok).toMatchObject({ synced: 0, error: null, configured: false });
    expect(r.meta).toMatchObject({ synced: 0, error: null, configured: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String((fetchSpy.mock.calls as unknown[][])[0]?.[0])).toContain("graph.facebook.com");
    vi.unstubAllGlobals();
  });
});
