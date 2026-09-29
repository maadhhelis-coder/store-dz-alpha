// يظهر فورًا عند فتح صفحة منتج من داخل المتجر — بدل شاشة لا تتغيّر حتى يكتمل رسم الصفحة على الخادم.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 animate-pulse" aria-busy="true" aria-label="جاري التحميل">
      <div className="aspect-square w-full rounded-2xl bg-ink gold-border" />
      <div className="mt-4 h-6 w-2/3 mx-auto rounded bg-ink" />
      <div className="mt-2 h-4 w-1/3 mx-auto rounded bg-ink" />
    </div>
  );
}
