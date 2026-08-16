import OrdersTable from "@/components/admin/OrdersTable";

export default function AdminOrdersPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-6">الطلبات</h1>
      <OrdersTable />
    </div>
  );
}
