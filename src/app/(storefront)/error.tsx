"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-cream">حدث خطأ غير متوقع</h1>
      <p className="text-cream-dim mt-3">نعتذر عن الإزعاج — حاول تحديث الصفحة أو العودة لاحقًا.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 gold-gradient text-ink font-bold px-6 py-3 rounded-xl hover:brightness-110 transition"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
