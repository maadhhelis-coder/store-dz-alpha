import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runJob } from "@/server/modules/jobs/jobRunner";
import { prisma } from "@/server/db/prisma";
import { recomputeCustomerRisk } from "@/server/modules/risk/riskService";
import { scanCustomerForFraud } from "@/server/modules/fraud/fraudService";
import { recomputeCustomerSegments } from "@/server/modules/customers/segmentationService";

// إعادة حساب CRM المجدولة — المخاطر ثم الاحتيال ثم القطاعات، بهذا الترتيب حتمًا:
// القطاعات تقرأ riskLevel (قطاع high_risk)، فحسابها قبل المخاطر يعطي تصنيفًا
// من دورة سابقة. الترتيب هنا هو العقد وليس تفصيلًا.
//
// محمي بـverifyCronSecret (fail-closed) + قفل Upstash داخل runJob: استدعاءان
// متزامنان ⇒ تنفيذ واحد فقط، والثاني يعود 200 skipped_locked بلا أي أثر.

export const maxDuration = 60;

const JOB = "crm-recompute";
// ponytail: دفعة محدودة لكل تشغيلة — كافية للحجم الحالي؛ لو كبر سجل العملاء
// فالترقية cursor مستمر عبر التشغيلات لا رفع الحد.
const BATCH_SIZE = 200;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const outcome = await runJob(JOB, async () => {
      const customers = await prisma.customer.findMany({
        where: { status: "active" },
        orderBy: [{ riskCalculatedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
        take: BATCH_SIZE,
        select: { id: true },
      });

      let risk = 0;
      let fraudSignals = 0;
      let segments = 0;
      for (const customer of customers) {
        await recomputeCustomerRisk(customer.id);
        risk++;
        const scan = await scanCustomerForFraud(customer.id);
        fraudSignals += scan.created.length;
        await recomputeCustomerSegments(customer.id);
        segments++;
      }
      return { customers: customers.length, risk, fraudSignals, segments };
    });

    if (outcome.status === "skipped_locked") {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }
    return NextResponse.json({ ok: true, ...outcome.result, durationMs: outcome.durationMs });
  } catch (error) {
    console.error("crm-recompute cron error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
