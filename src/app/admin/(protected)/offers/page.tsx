import OffersTable from "@/components/admin/OffersTable";

export default function AdminOffersPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-2">العروض الإضافية</h1>
      <p className="text-sm text-cream-dim mb-6">
        اعرض منتجًا إضافيًا بسعر خاص أثناء طلب منتج آخر لزيادة قيمة الطلب.
      </p>
      <OffersTable />
    </div>
  );
}
