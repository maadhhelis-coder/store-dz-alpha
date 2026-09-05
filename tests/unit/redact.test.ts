import { describe, it, expect } from "vitest";
import {
  redactForAudit,
  redactForLogs,
  redactProviderPayload,
  redactErrorMessage,
} from "@/lib/redact";

// ثابت 25/3.13/45: التنقية المركزية — أسرار دائمًا [REDACTED]؛ هواتف مقنعة جزئيًا؛
// عناوين مختصرة. كل مسار سجل/تصدير/حمولة مزود يمر من هنا.

describe("redactForAudit — الأسرار", () => {
  it("يقنّع مفاتيح tokens/secrets/كلمات المرور مهما كانت قيمتها", () => {
    const input = {
      accessToken: "ya29.super-secret",
      refresh_token: "1//abc",
      API_KEY: "sdz_abcdef",
      webhookSecret: "hmac-secret-value",
      password: "hunter2",
      Authorization: "Bearer xyz",
    };
    const out = redactForAudit(input) as Record<string, string>;
    for (const key of Object.keys(input)) {
      expect(out[key]).toBe("[REDACTED]");
    }
  });

  it("ينقّح بشكل عميق داخل المصفوفات والكائنات المتداخلة", () => {
    const input = {
      provider: "dhd",
      request: {
        headers: { "api-token": "tok_123", "content-type": "application/json" },
        nested: [{ session: "sess_99" }],
      },
    };
    const out = redactForAudit(input) as typeof input;
    expect(out.request.headers["api-token"]).toBe("[REDACTED]");
    expect(out.request.headers["content-type"]).toBe("application/json");
    expect((out.request.nested[0] as Record<string, string>).session).toBe("[REDACTED]");
  });

  it("لا يعدّل الكائن الأصلي (نسخة جديدة)", () => {
    const input = { token: "keep-original" };
    const out = redactForAudit(input);
    expect(input.token).toBe("keep-original");
    expect((out as typeof input).token).toBe("[REDACTED]");
  });
});

describe("redactForAudit — PII", () => {
  it("يقنّع الهاتف جزئيًا 05*******89", () => {
    const out = redactForAudit({ phone: "0555123456" }) as { phone: string };
    expect(out.phone).toBe("05*******56");
  });

  it("يقنّع phoneNormalized مثل الهاتف العادي", () => {
    const out = redactForAudit({ phoneNormalized: "+213555123456" }) as { phoneNormalized: string };
    expect(out.phoneNormalized).toBe("05*******56");
  });

  it("يختصر العناوين الطويلة ويبقي القصيرة", () => {
    const long = redactForAudit({ address: "حي البدر شارع الأمير عبد القادر رقم 123 بجاية" }) as { address: string };
    expect(long.address.length).toBeLessThanOrEqual(21);
    expect(long.address.endsWith("…")).toBe(true);

    const short = redactForAudit({ address: "شارع 5" }) as { address: string };
    expect(short.address).toBe("شارع 5");
  });

  it("يترك الأرقام والحقول غير الحساسة كما هي", () => {
    const input = { totalDzd: 1500, status: "delivered", isTest: false, active: true };
    expect(redactForAudit(input)).toEqual(input);
  });

  it("يتعامل مع الحلقات المرجعية دون انهيار", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => redactForAudit(a)).not.toThrow();
  });
});

describe("redactProviderPayload / redactForLogs", () => {
  it("ينقّح حمولة مزود فيها توكن", () => {
    const out = redactProviderPayload({ endpoint: "/v1/track", bearerToken: "zzz", tracking: "DHD123" }) as Record<string, string>;
    expect(out.bearerToken).toBe("[REDACTED]");
    expect(out.tracking).toBe("DHD123");
  });

  it("redactForLogs نفس سلوك الـaudit", () => {
    const out = redactForLogs({ refreshToken: "r" }) as Record<string, string>;
    expect(out.refreshToken).toBe("[REDACTED]");
  });
});

describe("redactErrorMessage", () => {
  it("يقنّع Bearer tokens في رسائل الأخطاء", () => {
    const out = redactErrorMessage("request failed with Bearer abcdef123456 and status 401");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdef123456");
  });

  it("يقنّع token=key داخل الرسائل", () => {
    const out = redactErrorMessage("invalid api_key=sdz_secret_value provided");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sdz_secret_value");
  });

  it("يقنّع الهواتف العارية في الرسائل", () => {
    const out = redactErrorMessage("order for 0555123456 not found");
    expect(out).not.toContain("0555123456");
    expect(out).toContain("*");
  });
});
