"use client";

// يُستعمل فقط عند تعطّل الـroot layout نفسه (حالة نادرة جدًا) — لا يمكنه الاعتماد على
// أي شيء من الـlayout العادي (خطوط، إعدادات الموقع)، لذا يبقى بسيطًا ومكتفيًا بذاته.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex items-center justify-center bg-black text-center px-6">
        <div>
          <h1 className="text-2xl font-bold text-white">حدث خطأ غير متوقع</h1>
          <p className="text-gray-400 mt-3">نعتذر عن الإزعاج، حاول مرة أخرى.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 bg-yellow-500 text-black font-bold px-6 py-3 rounded-xl"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
