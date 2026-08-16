import LoginPageClient from "./LoginPageClient";

// export const dynamic لا يُطبَّق داخل ملف "use client" (Next.js يتجاهله بصمت بلا أي
// تحذير) — لذلك هذا الملف Server Component بسيط فقط يفرض dynamic rendering وينادي
// المكوّن الفعلي. بلا هذا، Next.js يُوَلِّد هذه الصفحة سكونيًا وقت البناء (بلا أي Dynamic
// API فشجرتها)، فتُخبَّز فيها سكربتات بلا nonce إطلاقًا — تتعارض دائمًا مع الـnonce الجديد
// الذي يولّده middleware.ts لكل طلب حقيقي، فتُحظَر كل سكربتات الصفحة (JS كاملًا) بواسطة
// CSP نفسها، ولا يظهر نموذج الدخول أبدًا.
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return <LoginPageClient />;
}
