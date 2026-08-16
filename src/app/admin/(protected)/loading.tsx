export default function Loading() {
  return (
    <div role="status" className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
      <span className="sr-only">جارٍ التحميل...</span>
    </div>
  );
}
