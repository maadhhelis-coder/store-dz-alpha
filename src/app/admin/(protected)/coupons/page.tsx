import CouponsTable from "@/components/admin/CouponsTable";

export default function AdminCouponsPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-2">كوبونات الخصم</h1>
      <p className="text-sm text-cream-dim mb-6">
        أنشئ أكواد خصم (نسبة أو مبلغ ثابت) يقدر الزبون يستعملها عند الطلب — بما فيه الطلبات عبر الوكيل الذكي على واتساب.
      </p>
      <CouponsTable />
    </div>
  );
}
