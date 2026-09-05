import { describe, expect, it } from "vitest";
import {
  detectSignals,
  FraudConfigError,
  FRAUD_SIGNALS,
  FRAUD_ENGINE_VERSION,
} from "@/server/modules/fraud/fraudService";
import { parseCrmSettingValue } from "@/lib/validation/crmSettingsSchema";

// العتبات = الافتراضيات الرسمية من الـschema — لا رقم منسوخ يدويًا هنا.
const T = parseCrmSettingValue("fraud_thresholds", undefined);
const CTX = { customerId: "c-1", engineVersion: FRAUD_ENGINE_VERSION };

const detect = (over: Partial<Parameters<typeof detectSignals>[0]> = {}) =>
  detectSignals({
    sharedDeviceCustomers: 0,
    sharedIpCustomers: 0,
    refusedOrders: 0,
    thresholds: T,
    evidenceContext: CTX,
    ...over,
  });

describe("detectSignals — الكشف والأدلة", () => {
  it("بلا مؤشرات ⇒ لا إشارات إطلاقًا", () => {
    expect(detect()).toEqual([]);
  });

  it("كل إشارة تُرفع عند حدها بالضبط، ولا تُرفع قبله بواحد", () => {
    expect(detect({ sharedDeviceCustomers: T.shared_device_min_customers }).map((s) => s.signal)).toEqual([
      "shared_device",
    ]);
    expect(detect({ sharedDeviceCustomers: T.shared_device_min_customers - 1 })).toEqual([]);

    expect(detect({ sharedIpCustomers: T.shared_ip_min_customers }).map((s) => s.signal)).toEqual(["shared_ip"]);
    expect(detect({ sharedIpCustomers: T.shared_ip_min_customers - 1 })).toEqual([]);

    expect(detect({ refusedOrders: T.repeat_refusal_min_orders }).map((s) => s.signal)).toEqual(["repeat_refusal"]);
    expect(detect({ refusedOrders: T.repeat_refusal_min_orders - 1 })).toEqual([]);
  });

  it("كل إشارة تحمل evidence غير فارغ يشرح القاعدة والعتبة والقيمة", () => {
    const signals = detect({
      sharedDeviceCustomers: 99,
      sharedIpCustomers: 99,
      refusedOrders: 99,
    });
    expect(signals).toHaveLength(3);
    for (const s of signals) {
      expect(Object.keys(s.evidence).length).toBeGreaterThan(0);
      expect(s.evidence).toMatchObject({ rule: s.signal, customerId: "c-1" });
      expect(s.evidence).toHaveProperty("threshold");
      expect(s.evidence.engineVersion).toBe(FRAUD_ENGINE_VERSION);
    }
  });

  it("الشدّة محصورة في low|medium|high (ما تقبله القاعدة حصرًا)", () => {
    const allowed = ["low", "medium", "high"];
    for (const severity of Object.values(FRAUD_SIGNALS)) {
      expect(allowed).toContain(severity);
    }
    for (const s of detect({ sharedDeviceCustomers: 99, sharedIpCustomers: 99, refusedOrders: 99 })) {
      expect(allowed).toContain(s.severity);
    }
  });

  it("shared_device وحدها شدّتها high (هي وحدها ما يفتح مراجعة يدوية)", () => {
    const high = detect({ sharedDeviceCustomers: 99, sharedIpCustomers: 99, refusedOrders: 99 }).filter(
      (s) => s.severity === "high",
    );
    expect(high.map((s) => s.signal)).toEqual(["shared_device"]);
  });

  it("حتمي: نفس المدخلات تعطي نفس الإشارات بنفس الترتيب", () => {
    const input = { sharedDeviceCustomers: 5, sharedIpCustomers: 7, refusedOrders: 4 };
    expect(detect(input)).toEqual(detect(input));
  });

  it("deny-by-default: عتبة ناقصة أو تالفة ⇒ فشل صريح لا كشف بقيم مخترعة", () => {
    for (const bad of [
      { ...T, shared_device_min_customers: undefined },
      { ...T, shared_ip_min_customers: Number.NaN },
      { ...T, repeat_refusal_min_orders: 0 },
    ]) {
      expect(() => detect({ thresholds: bad as typeof T })).toThrow(FraudConfigError);
    }
  });
});
