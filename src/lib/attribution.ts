// العزو (P7) — دوال صرفة مشتركة بين المتصفح والخادم (لا window ولا prisma هنا).
//
// النموذج الواحد: لقطة `sdz_attr` في localStorage = { first, last }.
// - first-touch: يُلتقط مرة واحدة ولا يُدهس أبدًا (حتى انتهاء عمر اللقطة: 90 يومًا).
// - last-touch: يُحدَّث عند كل زيارة تحمل معلمات عزو.
// - لا تخمين: الحقول غير الموجودة في الرابط تبقى null (لا حملة/إعلان/إبداع مختلَقة).
// - provenance ثابتة "url" (المصدر الوحيد للالتقاط الآن) وcapturedAt وقت الالتقاط.
//
// معلمات الرابط المقروءة: utm_source|platform, utm_medium, utm_campaign, utm_content|creative,
// utm_term, campaign_id, adset_id, ad_id (المالك يضبطها في رابط الإعلان — لا استنتاج).

export type AttributionPlatform = "facebook" | "instagram" | "tiktok";

export type AttributionTouch = {
  platform: AttributionPlatform | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  /** اسم الإبداع = utm_content أو creative — نفس الحقل الذي يعتمده P6 للتخصيص */
  creativeName: string | null;
  landingPath: string | null;
  provenance: "url";
  capturedAt: string;
};

export type AttributionSnapshot = { first: AttributionTouch; last: AttributionTouch };

export const ATTRIBUTION_STORAGE_KEY = "sdz_attr";
export const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_LEN = 120;

export function normalizePlatform(raw: string | null | undefined): AttributionPlatform | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (["facebook", "fb", "meta"].includes(value)) return "facebook";
  if (["instagram", "ig"].includes(value)) return "instagram";
  if (["tiktok", "tt"].includes(value)) return "tiktok";
  return null;
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v.slice(0, MAX_LEN) : null;
}

/** لمسة من معلمات رابط — null إذا لم يحمل الرابط أي معلمة عزو (لا لمسة فارغة). */
export function parseTouchFromParams(
  params: URLSearchParams,
  landingPath: string,
  now: Date = new Date(),
): AttributionTouch | null {
  const utmSource = clean(params.get("utm_source"));
  const platform = normalizePlatform(utmSource ?? params.get("platform"));
  const touch: AttributionTouch = {
    platform,
    utmSource: utmSource ?? (platform ? platform : null),
    utmMedium: clean(params.get("utm_medium")),
    utmCampaign: clean(params.get("utm_campaign")),
    utmContent: clean(params.get("utm_content")),
    utmTerm: clean(params.get("utm_term")),
    campaignId: clean(params.get("campaign_id")),
    adSetId: clean(params.get("adset_id")),
    adId: clean(params.get("ad_id")),
    creativeName: clean(params.get("utm_content") ?? params.get("creative")),
    landingPath: clean(landingPath),
    provenance: "url",
    capturedAt: now.toISOString(),
  };
  const hasSignal = Boolean(
    touch.platform || touch.utmSource || touch.utmCampaign || touch.utmContent || touch.campaignId || touch.adId,
  );
  return hasSignal ? touch : null;
}

function isExpired(touch: AttributionTouch, now: Date): boolean {
  const captured = Date.parse(touch.capturedAt);
  return !Number.isFinite(captured) || now.getTime() - captured > ATTRIBUTION_TTL_MS;
}

/** الدمج الحتمي: first لا يُدهس ما دام حيًا؛ last يُستبدل بكل لمسة جديدة.
 * لقطة منتهية العمر بالكامل تبدأ من جديد. */
export function mergeAttribution(
  existing: AttributionSnapshot | null,
  touch: AttributionTouch | null,
  now: Date = new Date(),
): AttributionSnapshot | null {
  const live = existing && !isExpired(existing.first, now) ? existing : null;
  if (!touch) return live;
  return { first: live ? live.first : touch, last: touch };
}

/** قراءة آمنة لنص مخزَّن — أي شكل غير متوقع = لا عزو (لا تخمين). */
export function parseStoredSnapshot(raw: string | null, now: Date = new Date()): AttributionSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AttributionSnapshot>;
    if (!parsed?.first?.capturedAt || !parsed?.last?.capturedAt) return null;
    return mergeAttribution(
      { first: parsed.first as AttributionTouch, last: parsed.last as AttributionTouch },
      null,
      now,
    );
  } catch {
    return null;
  }
}

/** حقول الطلب من اللقطة (لقطة وقت الإنشاء — لا تُعاد حسابها لاحقًا).
 * platform/creativeName من last-touch (ما يعتمده P6)، وfirstTouch* من first. */
export function attributionFieldsForOrder(snapshot: AttributionSnapshot | null | undefined) {
  if (!snapshot) return {};
  const { first, last } = snapshot;
  return {
    platform: last.platform ?? undefined,
    creativeName: last.creativeName ?? undefined,
    utmSource: last.utmSource,
    utmMedium: last.utmMedium,
    utmCampaign: last.utmCampaign,
    utmContent: last.utmContent,
    utmTerm: last.utmTerm,
    landingPath: last.landingPath,
    campaignId: last.campaignId,
    adSetId: last.adSetId,
    adId: last.adId,
    firstTouchPlatform: first.platform,
    firstTouchUtmSource: first.utmSource,
    firstTouchUtmCampaign: first.utmCampaign,
  };
}
