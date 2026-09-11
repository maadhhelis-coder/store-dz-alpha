import { describe, expect, it } from "vitest";
import { webhookCreateSchema } from "@/lib/validation/webhookSchema";

// انحدار حقيقي: courier_status_changed كان مقبولًا فالواجهة ومرفوضًا فالمخطط.
describe("webhookCreateSchema", () => {
  it("يقبل كل أحداث Prisma WebhookEvent بما فيها courier_status_changed", () => {
    const parsed = webhookCreateSchema.safeParse({
      url: "https://store-dz-agent.onrender.com/webhooks/store-dz",
      events: ["order_created", "order_status_changed", "courier_status_changed"],
    });
    expect(parsed.success).toBe(true);
  });

  it("يرفض حدثًا غير معروف", () => {
    const parsed = webhookCreateSchema.safeParse({ url: "https://example.com/x", events: ["nope"] });
    expect(parsed.success).toBe(false);
  });
});
