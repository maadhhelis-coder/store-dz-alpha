import { describe, it, expect } from "vitest";
import {
  normalizeAlgerianPhone,
  normalizeAlgerianPhoneOrThrow,
  toE164,
  maskPhoneForDisplay,
} from "@/lib/phone";

// الاختبار المرجعي لتطبيع الهاتف الجزائري — Correction 3.3 (المواصفة 5):
// كل الصيغ المقبولة تنتج نفس القانونية 0XXXXXXXXX؛ المرفوض يُرفض حتمًا بلا تخمين.

describe("normalizeAlgerianPhone", () => {
  const cases: [string, string][] = [
    ["0555123456", "0555123456"],
    ["0655123456", "0655123456"],
    ["0755123456", "0755123456"],
    ["+213555123456", "0555123456"],
    ["00213555123456", "0555123456"],
    ["213555123456", "0555123456"],
    ["0555 12 34 56", "0555123456"],
    ["0555-12-34-56", "0555123456"],
    ["(0555) 123456", "0555123456"],
    ["+213 555 123 456", "0555123456"],
    ["00 213 555 123 456", "0555123456"],
    ["  0770123456  ", "0770123456"],
  ];

  it.each(cases)("%s → %s", (input, expected) => {
    expect(normalizeAlgerianPhone(input)).toBe(expected);
  });

  const rejects: string[] = [
    "",
    "   ",
    "12345",
    "0123456789", // بادئة مشغّيل غير صحيحة (01)
    "0855123456", // 08 غير موجود
    "055512345", // 9 أرقام فقط
    "05551234567", // 11 رقمًا
    "9055123456",
    "abcdefghij",
    "0021355512345678", // أطول من اللازم
    "+989121234567", // رقم إيراني — ليس جزائريًا
  ];

  it.each(rejects)("يرفض %s", (input) => {
    expect(normalizeAlgerianPhone(input)).toBeNull();
  });

  it("يرفض null/undefined بأمان", () => {
    expect(normalizeAlgerianPhone(null)).toBeNull();
    expect(normalizeAlgerianPhone(undefined)).toBeNull();
  });
});

describe("normalizeAlgerianPhoneOrThrow", () => {
  it("يرمي برسالة واضحة عند الفشل", () => {
    expect(() => normalizeAlgerianPhoneOrThrow("12345")).toThrow("غير صالح");
  });

  it("ينجح مع صيغة دولية", () => {
    expect(normalizeAlgerianPhoneOrThrow("+213699112233")).toBe("0699112233");
  });
});

describe("toE164", () => {
  it("يحوّل للصيغة الدولية للمزودين فقط", () => {
    expect(toE164("0555123456")).toBe("+213555123456");
  });

  it("يرجع null لرقم غير صالح", () => {
    expect(toE164("123")).toBeNull();
  });
});

describe("maskPhoneForDisplay", () => {
  it("يقنّع الوسط ويُظهر أول رقمين وآخر رقمين", () => {
    expect(maskPhoneForDisplay("0555123456")).toBe("05*******56");
  });

  it("يرجع [REDACTED] لإدخال غير صالح", () => {
    expect(maskPhoneForDisplay("bad")).toBe("[REDACTED]");
  });
});
