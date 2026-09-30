import { afterEach, describe, expect, it, vi } from "vitest";

// بيئة الاختبار node: نحاكي فقط ما تلمسه الدوال (window.location/localStorage/document).
function fakeBrowser(search: string, hasPixelConfig = true) {
  const store = new Map<string, string>();
  const win: Record<string, unknown> = {
    location: { search, pathname: "/products/x" },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("document", { getElementById: (id: string) => (id === "pixel-config" && hasPixelConfig ? {} : null) });
  return win;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe("أول زيارة من إعلان تحمل اسم الإعلان", () => {
  it("getAttribution يلتقط utm من الرابط الحالي حتى قبل PageViewTracker", async () => {
    fakeBrowser("?utm_source=fb&utm_content=C1%20%7C%20test");
    const { getAttribution } = await import("@/lib/tracking");
    expect(getAttribution()).toEqual({ platform: "facebook", creativeName: "C1 | test" });
  });
});

describe("أحداث البيكسل تنتظر تحميل pixel-loader", () => {
  it("ViewContent لا يضيع إذا أُطلق قبل تعريف fbq", async () => {
    vi.useFakeTimers();
    const win = fakeBrowser("");
    const { trackViewContent } = await import("@/lib/trackConversion");
    const fbq = vi.fn();

    trackViewContent({ contentId: "p1", value: 2200 });
    expect(fbq).not.toHaveBeenCalled();

    win.fbq = fbq; // pixel-loader.js حُمِّل
    await vi.advanceTimersByTimeAsync(300);
    expect(fbq).toHaveBeenCalledWith("track", "ViewContent", expect.objectContaining({ content_ids: ["p1"] }));
  });

  it("إرسال الاستمارة = Lead لميتا (Purchase عند التأكيد فقط، من السيرفر)", async () => {
    const win = fakeBrowser("");
    const fbq = vi.fn();
    win.fbq = fbq;
    const { trackOrderSubmitted } = await import("@/lib/trackConversion");

    trackOrderSubmitted({ value: 2200, orderId: "SDZ-1" });
    expect(fbq).toHaveBeenCalledWith("track", "Lead", expect.objectContaining({ value: 2200 }), { eventID: "SDZ-1" });
    expect(fbq).not.toHaveBeenCalledWith("track", "Purchase", expect.anything(), expect.anything());
  });

  it("بلا بيكسلات مضبوطة لا انتظار ولا إطلاق", async () => {
    vi.useFakeTimers();
    fakeBrowser("", false);
    const { whenPixelsReady } = await import("@/lib/trackConversion");
    const fire = vi.fn();
    whenPixelsReady(fire);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
