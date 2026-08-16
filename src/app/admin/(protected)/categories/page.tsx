import CategoriesTable from "@/components/admin/CategoriesTable";

export default function AdminCategoriesPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-2">التصنيفات</h1>
      <p className="text-sm text-cream-dim mb-6">
        نظّم منتجاتك ضمن تصنيفات تظهر في المتجر وصفحة كل منتج.
      </p>
      <CategoriesTable />
    </div>
  );
}
