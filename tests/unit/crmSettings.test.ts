import { describe, it, expect } from "vitest";
import {
  CRM_SETTING_KEYS,
  parseCrmSettingValue,
  isCrmSettingKey,
} from "@/lib/validation/crmSettingsSchema";

// ثابت 3/59/63: كل إعداد zod-validated مع defaults؛ المفاتيح غير المعروفة تُرفض
// عند الكتابة وتُتجاهل عند القراءة (version-tolerant).

describe("crm settings schemas", () => {
  it("كل مفتاح له schema مع defaults — القيمة undefined تعطي الافتراضي", () => {
    for (const key of CRM_SETTING_KEYS) {
      const parsed = parseCrmSettingValue(key, undefined);
      expect(parsed).toBeDefined();
    }
  });

  it("risk_weights يقبل قيماً جزئية ويكمل الافتراضي", () => {
    const parsed = parseCrmSettingValue("risk_weights", { refusalRate: 40 });
    expect(parsed.refusalRate).toBe(40);
    expect(parsed.returnRate).toBe(20); // الافتراضي
  });

  it("risk_weights يرفض قيماً سالبة أو فوق 100", () => {
    expect(() => parseCrmSettingValue("risk_weights", { refusalRate: -1 })).toThrow();
    expect(() => parseCrmSettingValue("risk_weights", { refusalRate: 101 })).toThrow();
  });

  it("عتبات المخاطر: high يجب أن تكون ضمن الحدود", () => {
    expect(() => parseCrmSettingValue("risk_thresholds", { high: 0 })).toThrow();
    expect(() => parseCrmSettingValue("risk_thresholds", { high: 101 })).toThrow();
  });

  it("packaging_cost_dzd لا يقبل سالبًا", () => {
    expect(() => parseCrmSettingValue("packaging_cost_dzd", -5)).toThrow();
    expect(parseCrmSettingValue("packaging_cost_dzd", 50)).toBe(50);
  });

  it("task_sla_minutes يقبل قيماً جزئية", () => {
    const parsed = parseCrmSettingValue("task_sla_minutes", { confirm_order: 60 });
    expect(parsed.confirm_order).toBe(60);
    expect(parsed.prepare_order).toBe(240);
  });

  it("automation_enabled سجل مفاتيح→boolean فقط", () => {
    expect(parseCrmSettingValue("automation_enabled", { "order.created": true })).toEqual({
      "order.created": true,
    });
    expect(() => parseCrmSettingValue("automation_enabled", { "order.created": "yes" })).toThrow();
  });

  it("isCrmSettingKey يفرق بين المفاتيح المعروفة والغير معروفة", () => {
    expect(isCrmSettingKey("risk_weights")).toBe(true);
    expect(isCrmSettingKey("rbac_permissions")).toBe(false);
  });
});
