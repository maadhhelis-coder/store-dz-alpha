import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ATTRIBUTION_TTL_MS,
  attributionFieldsForOrder,
  mergeAttribution,
  parseStoredSnapshot,
  parseTouchFromParams,
} from "@/lib/attribution";
import { renderTemplate, COMMUNICATION_TEMPLATES } from "@/server/modules/communications/communicationService";
import {
  toInternationalPhone,
  whatsappDeepLinkProvider,
  smsProvider,
  whatsappCloudProvider,
} from "@/server/modules/communications/providers";

// P7 — العزو (دوال صرفة) والمزوّدون (حالات غير متاحة صريحة) — بلا قاعدة بيانات.

const T0 = new Date("2026-09-01T10:00:00Z");
const params = (q: string) => new URLSearchParams(q);

describe("parseTouchFromParams", () => {
  it("يقرأ كل معلمات UTM/الحملة كما هي — بلا تخمين لما لم يُرسَل", () => {
    const t = parseTouchFromParams(
      params("utm_source=fb&utm_medium=cpc&utm_campaign=c1&utm_content=cr1&campaign_id=111&adset_id=222&ad_id=333"),
      "/products/x",
      T0,
    )!;
    expect(t.platform).toBe("facebook");
    expect(t.utmSource).toBe("fb");
    expect(t.utmCampaign).toBe("c1");
    expect(t.creativeName).toBe("cr1");
    expect(t.campaignId).toBe("111");
    expect(t.adSetId).toBe("222");
    expect(t.adId).toBe("333");
    expect(t.utmTerm).toBeNull();
    expect(t.landingPath).toBe("/products/x");
    expect(t.provenance).toBe("url");
    expect(t.capturedAt).toBe(T0.toISOString());
  });

  it("رابط بلا أي معلمة عزو = لا لمسة (لا لمسة فارغة تدهس السابقة)", () => {
    expect(parseTouchFromParams(params("ref=abc"), "/", T0)).toBeNull();
  });

  it("platform/creative القديمتان مقبولتان، والمنصة المجهولة لا تُخمَّن", () => {
    const t = parseTouchFromParams(params("platform=ig&creative=v2"), "/", T0)!;
    expect(t.platform).toBe("instagram");
    expect(t.creativeName).toBe("v2");
    expect(parseTouchFromParams(params("utm_source=newsletter"), "/", T0)!.platform).toBeNull();
  });
});

describe("mergeAttribution — first-touch ثابتة وlast-touch تتحدّث", () => {
  const first = parseTouchFromParams(params("utm_source=fb&utm_campaign=c1"), "/a", T0)!;
  const laterAt = new Date(T0.getTime() + 86_400_000);
  const later = parseTouchFromParams(params("utm_source=tiktok&utm_campaign=c2"), "/b", laterAt)!;

  it("الزيارة الأولى تكتب first=last؛ الثانية تغيّر last فقط", () => {
    const s1 = mergeAttribution(null, first, T0)!;
    expect(s1.first).toBe(first);
    expect(s1.last).toBe(first);
    const s2 = mergeAttribution(s1, later, laterAt)!;
    expect(s2.first).toBe(first);
    expect(s2.last).toBe(later);
  });

  it("زيارة بلا معلمات لا تمسّ اللقطة", () => {
    const s1 = mergeAttribution(null, first, T0)!;
    expect(mergeAttribution(s1, null, T0)).toBe(s1);
  });

  it("بعد 90 يومًا تنتهي اللقطة كلها وتبدأ من جديد", () => {
    const s1 = mergeAttribution(null, first, T0)!;
    const expired = new Date(T0.getTime() + ATTRIBUTION_TTL_MS + 1);
    expect(mergeAttribution(s1, null, expired)).toBeNull();
    const s2 = mergeAttribution(s1, later, expired)!;
    expect(s2.first).toBe(later);
  });

  it("نص مخزَّن تالف أو ناقص = لا عزو", () => {
    expect(parseStoredSnapshot("{bad", T0)).toBeNull();
    expect(parseStoredSnapshot(JSON.stringify({ first: {} }), T0)).toBeNull();
    const ok = parseStoredSnapshot(JSON.stringify({ first, last: later }), T0)!;
    expect(ok.first.utmCampaign).toBe("c1");
  });
});

describe("attributionFieldsForOrder — لقطة الطلب", () => {
  it("platform/creative من آخر لمسة (أساس P6) وfirstTouch* من الأولى", () => {
    const first = parseTouchFromParams(params("utm_source=fb&utm_campaign=c1&utm_content=cr1"), "/a", T0)!;
    const last = parseTouchFromParams(params("utm_source=tt&utm_campaign=c2&utm_content=cr2&ad_id=9"), "/b", T0)!;
    const f = attributionFieldsForOrder({ first, last });
    expect(f.platform).toBe("tiktok");
    expect(f.creativeName).toBe("cr2");
    expect(f.utmCampaign).toBe("c2");
    expect(f.adId).toBe("9");
    expect(f.landingPath).toBe("/b");
    expect(f.firstTouchPlatform).toBe("facebook");
    expect(f.firstTouchUtmSource).toBe("fb");
    expect(f.firstTouchUtmCampaign).toBe("c1");
  });

  it("بلا لقطة = لا حقول (الحالة غير المتاحة تبقى كما هي)", () => {
    expect(attributionFieldsForOrder(null)).toEqual({});
    expect(attributionFieldsForOrder(undefined)).toEqual({});
  });
});

describe("التواصل — القوالب والمزوّدون", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("القوالب تُصيَّر بالمتغيرات، والقالب المجهول يُرفض", () => {
    expect(renderTemplate("order_confirmed", { orderNumber: "SD-1", firstName: "أحمد" })).toContain("SD-1");
    expect(Object.keys(COMMUNICATION_TEMPLATES)).toContain("custom");
    expect(() => renderTemplate("nope", {})).toThrow();
  });

  it("رابط واتساب: manual (لا sent وهمي) برقم دولي صحيح", async () => {
    expect(toInternationalPhone("0550123456")).toBe("213550123456");
    const r = await whatsappDeepLinkProvider.send({ channel: "whatsapp", to: "0550123456", body: "مرحبا" });
    expect(r.kind).toBe("manual");
    expect((r as { url: string }).url).toContain("wa.me/213550123456");
  });

  it("SMS وWhatsApp Cloud بلا ضبط = unavailable صريح، لا نداء شبكة", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("WHATSAPP_CLOUD_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "");
    expect((await smsProvider.send({ channel: "sms", to: "0550123456", body: "x" })).kind).toBe("unavailable");
    expect((await whatsappCloudProvider.send({ channel: "whatsapp", to: "0550123456", body: "x" })).kind).toBe("unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("WhatsApp Cloud مضبوط: 5xx عابر (retryable)، 4xx نهائي، 200 = sent بمعرّف المزوّد", async () => {
    vi.stubEnv("WHATSAPP_CLOUD_ACCESS_TOKEN", "t");
    vi.stubEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "p");
    const responses = [
      { ok: false, status: 503, json: async () => ({ error: { message: "down" } }) },
      { ok: false, status: 400, json: async () => ({ error: { message: "bad" } }) },
      { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.1" }] }) },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()));
    const msg = { channel: "whatsapp" as const, to: "0550123456", body: "x" };
    expect(await whatsappCloudProvider.send(msg)).toMatchObject({ kind: "failed", retryable: true });
    expect(await whatsappCloudProvider.send(msg)).toMatchObject({ kind: "failed", retryable: false });
    expect(await whatsappCloudProvider.send(msg)).toMatchObject({ kind: "sent", providerMessageId: "wamid.1" });
  });
});
