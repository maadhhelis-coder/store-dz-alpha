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

// سلامة تغيير الإعدادات (Configuration Change Safety) لمفاتيح التجزئة الجديدة:
// صف محفوظ بقيم قديمة (بلا المفاتيح الجديدة) يجب أن يبقى صالحًا ويُكمَّل من
// الافتراضي — بلا migration وبلا كسر أي إعداد قائم في الإنتاج.
describe("segmentation_thresholds — إضافة مفاتيح at_risk/high_rto", () => {
  it("قيمة قديمة محفوظة بلا المفاتيح الجديدة تبقى صالحة وتُكمَّل بالافتراضي", () => {
    const legacyRow = {
      vip_min_orders: 4,
      vip_min_delivery_rate_percent: 85,
      vip_min_revenue_dzd: 50000,
      loyal_min_orders: 2,
      inactive_days: 120,
      profitable_min_margin_percent: 20,
    };
    const parsed = parseCrmSettingValue("segmentation_thresholds", legacyRow);
    expect(parsed.vip_min_orders).toBe(4); // القيمة المحفوظة لا تُدهَس
    expect(parsed.inactive_days).toBe(120);
    expect(parsed.at_risk_days).toBe(45);
    expect(parsed.high_rto_min_delivered_orders).toBe(3);
    expect(parsed.high_rto_rate_percent).toBe(30);
  });

  it("الافتراضيات وحدها متسقة: at_risk_days < inactive_days", () => {
    const d = parseCrmSettingValue("segmentation_thresholds", undefined);
    expect(d.at_risk_days).toBeLessThan(d.inactive_days);
  });

  it("ضبط يخلط الإنذار بالخمول مرفوض عند التحقق (لا قطاعات متداخلة)", () => {
    expect(() =>
      parseCrmSettingValue("segmentation_thresholds", { at_risk_days: 90, inactive_days: 90 }),
    ).toThrow();
    expect(() =>
      parseCrmSettingValue("segmentation_thresholds", { at_risk_days: 100, inactive_days: 90 }),
    ).toThrow();
  });

  it("القيم خارج المدى مرفوضة (نسبة > 100، عيّنة < 1، أيام < 1)", () => {
    for (const bad of [
      { high_rto_rate_percent: 101 },
      { high_rto_rate_percent: 0 },
      { high_rto_min_delivered_orders: 0 },
      { at_risk_days: 0 },
      { at_risk_days: 1.5 },
    ]) {
      expect(() => parseCrmSettingValue("segmentation_thresholds", bad)).toThrow();
    }
  });
});
