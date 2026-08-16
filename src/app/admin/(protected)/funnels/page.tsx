import FunnelsTable from "@/components/admin/FunnelsTable";

export default function AdminFunnelsPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-2">صفحات الهبوط</h1>
      <p className="text-sm text-cream-dim mb-6">
        أنشئ صفحة بيع مخصصة لمنتج واحد لاستخدامها في حملات إعلانية.
      </p>
      <FunnelsTable />
    </div>
  );
}
