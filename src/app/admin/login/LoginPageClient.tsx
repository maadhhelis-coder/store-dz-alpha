"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import Logo from "@/components/brand/Logo";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "حدث خطأ غير متوقع");
        return;
      }

      // "next" يأتي من query param يتحكم به المهاجم بالكامل (رابط تصيّد: ?next=https://evil.example) —
      // نقبل فقط مسارًا نسبيًا بادئًا بـ"/" واحد (وليس "//" أو "/\" اللذين يُفسَّرهما بعض المتصفحات
      // كرابط protocol-relative لنطاق خارجي)، أي قيمة أخرى تُرفض وتُستبدل بالمسار الافتراضي الآمن.
      const rawNext = searchParams.get("next");
      const next = rawNext && /^\/(?!\/|\\)/.test(rawNext) ? rawNext : "/admin";
      // تنقّل متصفح حقيقي (لا router.push البرمجي) عمدًا: يضمن أن middleware.ts يُعيد تقييم
      // كوكيز الجلسة المضبوطة للتو من الصفر عند الطلب التالي — router.push + router.refresh
      // كانا يعتمدان على أن يلتقط الـclient router الكوكيز الجديدة بشكل صحيح، وهو تفصيل هش
      // اكتُشف فعليًا عبر E2E حقيقي (Playwright's waitForURL انتظر تنقّلًا حقيقيًا لم يحدث قط).
      window.location.href = next;
      return;
    } catch {
      setError("تعذر الاتصال بالخادم، حاول من جديد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="rounded-2xl gold-border bg-ink p-6">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-4 h-4 text-gold" />
            <h1 className="font-display font-bold text-cream">دخول لوحة التحكم</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs text-cream-dim mb-1.5 block">البريد الإلكتروني</span>
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold transition-colors text-right"
                autoComplete="username"
                data-testid="login-email"
              />
            </label>

            <label className="block">
              <span className="text-xs text-cream-dim mb-1.5 block">كلمة المرور</span>
              <input
                type="password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold transition-colors text-right"
                autoComplete="current-password"
                data-testid="login-password"
              />
            </label>

            {error && (
              <p className="text-xs text-red-400" data-testid="login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full gold-gradient text-ink font-bold py-3 rounded-xl hover:brightness-110 transition disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="login-submit"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "دخول"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
