"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="text-center py-24">
      <h1 className="font-display text-xl font-bold text-cream">حدث خطأ غير متوقع</h1>
      <p className="text-cream-dim mt-2">حاول تحديث الصفحة أو إعادة المحاولة.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 gold-gradient text-ink font-bold px-5 py-2.5 rounded-lg hover:brightness-110 transition"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
