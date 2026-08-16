import Link from "next/link";
import { SITE_NAME } from "@/data/site";

// نفس سبب admin/login/page.tsx: بلا هذا تُولَّد الصفحة سكونيًا وقت البناء بلا nonce صحيح،
// فتتعارض سكربتاتها مع الـnonce الجديد لكل طلب حقيقي — يمنع hydration (تنقّل SPA عبر
// Link يتعطل، رغم أن الروابط تبقى صالحة كـ<a> عادية بلا JS).
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center container-page py-16">
      <span className="text-xs font-semibold tracking-wider text-gold uppercase mb-3">
        {SITE_NAME}
      </span>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold text-cream">
        404 — الصفحة غير موجودة
      </h1>
      <p className="text-cream-dim mt-4 max-w-md leading-relaxed">
        الرابط الذي وصلت إليه غير موجود أو تم نقله. يمكنك العودة للصفحة الرئيسية أو تصفّح منتجاتنا.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
        <Link
          href="/"
          className="gold-gradient text-ink font-bold px-6 py-3.5 rounded-xl hover:brightness-110 transition"
        >
          الصفحة الرئيسية
        </Link>
        <Link
          href="/products"
          className="border border-gold/30 text-gold font-semibold px-6 py-3.5 rounded-xl hover:bg-gold/10 transition"
        >
          تصفّح المنتجات
        </Link>
      </div>
    </div>
  );
}
