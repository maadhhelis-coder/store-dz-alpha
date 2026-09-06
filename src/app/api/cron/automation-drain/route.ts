import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runJob } from "@/server/modules/jobs/jobRunner";
import { drainOutboxUntilEmpty, outboxHealth } from "@/server/modules/automation/outboxDrainer";

// تصريف صندوق الأحداث (outbox).
//
// كان المشغّل مكتوبًا بالكامل (قفل lease بـCAS، بوابة idempotency على
// automation_runs، منع السلاسل الدائرية، dead-letter مع SystemAlert) وبلا أي
// مستدعٍ: الأحداث تُكتب في domain_events ولا يصرّفها أحد. هذا المسار يصله.
//
// المعالِجات تُسجَّل داخل drainOutbox نفسه (استيراد ديناميكي) فأي مسار يصرّف
// يملكها — أول معالِج فعلي هو إرسال الشحنات (P5).
// الجدولة يومية بحكم حدود خطة الاستضافة (جدولة أقل من يومية تُفشل النشر)؛
// الزمن المنخفض الفعلي يأتي من نبضة after() بعد كل كتابة، وهذا المسار شبكة
// أمان للاستعادة: يستنزف ما تراكم لأن نبضة ماتت أو تشغيلة انقطعت.

export const maxDuration = 60;

// سقف الجولات لتشغيلة الـcron: دفعة drainOutbox 20 حدثًا، فهذا يستنزف حتى 600
// حدث في التشغيلة الواحدة ضمن المهلة. الشبكة الأمنية يجب أن تلحق التراكم لا
// أن تكشط منه 20 فقط كل مرة.
const CRON_DRAIN_ROUNDS = 30;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const outcome = await runJob("automation-drain", async () => {
      const result = await drainOutboxUntilEmpty(CRON_DRAIN_ROUNDS);
      // صحة الصندوق بعد التصريف — تراكم dead-letter إشارة تشغيلية لا تُبتلع
      const health = await outboxHealth();
      return { ...result, ...health };
    });

    if (outcome.status === "skipped_locked") {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }
    return NextResponse.json({ ok: true, ...outcome.result, durationMs: outcome.durationMs });
  } catch (error) {
    console.error("automation-drain cron error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
