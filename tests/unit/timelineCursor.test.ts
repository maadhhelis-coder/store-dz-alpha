import { describe, expect, it } from "vitest";
import {
  encodeTimelineCursor,
  decodeTimelineCursor,
} from "@/server/modules/customers/customerTimelineService";

// مؤشر الـtimeline — الجزء الصرف من الترقيم الحتمي (الترتيب عبر المصادر
// مُختبَر على قاعدة حقيقية في tests/integration/customer-360.test.ts).

describe("مؤشر timeline", () => {
  it("ترميز ثم فك يعيد نفس الزوج بدقة الميلي ثانية", () => {
    const createdAt = new Date("2026-03-01T12:34:56.789Z");
    const id = "11111111-2222-4333-8444-555555555555";
    const decoded = decodeTimelineCursor(encodeTimelineCursor(createdAt, id));
    expect(decoded?.id).toBe(id);
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("حتمي: نفس المدخلات تعطي نفس المؤشر دائمًا", () => {
    const d = new Date("2026-03-01T00:00:00.000Z");
    expect(encodeTimelineCursor(d, "x")).toBe(encodeTimelineCursor(d, "x"));
  });

  it("آمن للعرض في URL (base64url بلا + / =)", () => {
    const cursor = encodeTimelineCursor(new Date("2026-03-01T12:34:56.789Z"), "a/b+c");
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("مؤشر تالف أو ناقص → null لا استثناء", () => {
    for (const bad of ["", "!!!", "bm90LWEtY3Vyc29y", Buffer.from("x|").toString("base64url")]) {
      expect(decodeTimelineCursor(bad)).toBeNull();
    }
  });

  it("تاريخ غير صالح داخل المؤشر → null", () => {
    const bad = Buffer.from("not-a-date|some-id").toString("base64url");
    expect(decodeTimelineCursor(bad)).toBeNull();
  });
});
