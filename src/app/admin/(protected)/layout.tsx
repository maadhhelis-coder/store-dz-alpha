import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import AdminThemeProvider from "@/components/admin/AdminThemeProvider";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { countNewLeads } from "@/server/repositories/leadsRepository";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/admin/login");
    }
    throw error;
  }

  const newLeadsCount = await countNewLeads();

  return (
    <AdminThemeProvider>
      <AdminShell newLeadsCount={newLeadsCount} email={admin.email} fullName={admin.fullName}>
        {children}
      </AdminShell>
    </AdminThemeProvider>
  );
}
