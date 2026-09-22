import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";

// حارس: أي جدول جديد في schema "public" يُكشف تلقائيًا عبر PostgREST بمفتاح anon العلني
// (الموجود في حزمة جافاسكريبت للموقع). migration 20260923090000 فعّل RLS على كل الجداول
// القائمة وقتها، لكنه لا يغطي جدولًا تنشئه migration لاحقة — هذا الاختبار يكشفه فورًا.
const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("RLS على كل جداول public (integration)", () => {
  it("لا يوجد أي جدول مكشوف بلا Row-Level Security", async () => {
    const unprotected = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      ORDER BY c.relname
    `;
    expect(unprotected.map((r) => r.relname)).toEqual([]);
  });
});
