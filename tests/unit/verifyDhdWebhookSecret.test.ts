import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyDhdWebhookSignature } from "@/lib/auth/verifyDhdWebhookSecret";

// مساران مقبولان: HMAC (كما يوثّقه DHD) أو هيدر X-Dhd-Token بنفس السرّ (ما تفعله
// لوحتهم فعليًا عبر «En-têtes personnalisés») — أي شيء آخر يُرفض.
describe("verifyDhdWebhookSignature", () => {
  const body = '{"event":"order.delivering"}';
  beforeEach(() => {
    process.env.DHD_WEBHOOK_SECRET = "s3cret-value";
  });
  afterEach(() => {
    delete process.env.DHD_WEBHOOK_SECRET;
  });

  it("يقبل توقيع HMAC الصحيح", () => {
    const sig = "sha256=" + createHmac("sha256", "s3cret-value").update(body).digest("hex");
    expect(verifyDhdWebhookSignature(body, sig)).toBe(true);
  });

  it("يقبل هيدر X-Dhd-Token المطابق بلا توقيع", () => {
    expect(verifyDhdWebhookSignature(body, null, "s3cret-value")).toBe(true);
    expect(verifyDhdWebhookSignature(body, null, " s3cret-value ")).toBe(true);
  });

  it("يرفض توكن مختلفًا، أو بلا شيء، أو بلا سرّ مضبوط", () => {
    expect(verifyDhdWebhookSignature(body, null, "wrong")).toBe(false);
    expect(verifyDhdWebhookSignature(body, null, null)).toBe(false);
    expect(verifyDhdWebhookSignature(body, "sha256=00", null)).toBe(false);
    delete process.env.DHD_WEBHOOK_SECRET;
    expect(verifyDhdWebhookSignature(body, null, "s3cret-value")).toBe(false);
  });
});
