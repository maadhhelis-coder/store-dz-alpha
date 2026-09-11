import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSiteSettings = vi.fn();
vi.mock("@/server/services/siteSettingsService", () => ({ getSiteSettings: (...a: unknown[]) => getSiteSettings(...a) }));

import { notifyOwner } from "@/lib/ownerNotify";

// المفاتيح فتبويب «الإشعارات» يجب أن تتحكم فعليًا فالإرسال — لا حفظ شكلي.
describe("notifyOwner", () => {
  const fetchMock = vi.fn(async () => ({ ok: true }) as Response);

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "t";
    process.env.TELEGRAM_CHAT_ID = "c";
    delete process.env.E2E_TEST_RUN;
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    getSiteSettings.mockResolvedValue({ notifyOrders: true, notifyAlerts: false, notifySystem: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("يرسل عندما يكون مفتاح النوع مفعّلًا", async () => {
    await notifyOwner("orders", "hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.telegram.org/bott/sendMessage");
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: "c", text: "hi" });
  });

  it("لا يرسل عندما يكون المفتاح معطّلًا", async () => {
    await notifyOwner("alerts", "hi");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("لا يرسل ولا يرمي بلا متغيرات البيئة", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(notifyOwner("system", "hi")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("لا يرمي عند فشل Telegram", async () => {
    fetchMock.mockRejectedValueOnce(new Error("down"));
    await expect(notifyOwner("system", "hi")).resolves.toBeUndefined();
  });
});
