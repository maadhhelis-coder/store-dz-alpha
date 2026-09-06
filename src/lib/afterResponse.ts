import { after } from "next/server";

// تشغيل عمل جانبي بعد الرد.
//
// after() هو الصحيح داخل معالج طلب: Vercel يقتل الـfunction فور إرسال الرد،
// فأي fire-and-forget عادي قد لا يكتمل. لكنه **يرمي** خارج نطاق طلب
// ("`after` was called outside a request scope") — والمسارات التي تستدعيه ليست
// كلها معالجات طلب: مهام خلفية، cron، واختبارات تكامل تستدعي الخدمة مباشرة.
//
// اكتُشف فعليًا: transitionOrderStatus كان يرمي من finalizeStatusSideEffects
// **بعد** التزام المعاملة — أي أن الحالة تتغيّر في القاعدة ثم يرى المستدعي
// خطأً، وهو أسوأ من الحالتين. لذا: after() حين يكون متاحًا، وتنفيذ مباشر
// غير منتظر حين لا يكون — العمل الجانبي لا يُسقط عملية تجارية التزمت أصلًا.

export function runAfterResponse(label: string, work: () => Promise<unknown>): void {
  const guarded = () =>
    work().catch((error) => {
      console.error(`${label} failed`, error);
    });

  try {
    after(guarded);
  } catch {
    // خارج نطاق طلب — ننفّذه مباشرة بلا انتظار (لا رمي، ولا إسقاط للعملية)
    void guarded();
  }
}
