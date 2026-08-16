import LeadsTable from "@/components/admin/LeadsTable";

export default function AdminLeadsPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-2">العملاء المحتملون</h1>
      <p className="text-sm text-cream-dim mb-6">
        زوار بدأوا تعبئة استمارة الطلب ولم يكملوها — تواصل معهم لتحويلهم لطلب حقيقي.
      </p>
      <LeadsTable />
    </div>
  );
}
