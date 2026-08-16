"use client";

import { useState } from "react";
import Sidebar from "@/components/admin/Sidebar";
import AdminHeader from "@/components/admin/AdminHeader";

type AdminShellProps = {
  newLeadsCount: number;
  email: string;
  fullName?: string | null;
  children: React.ReactNode;
};

export default function AdminShell({ newLeadsCount, email, fullName, children }: AdminShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-black" dir="rtl">
      <Sidebar
        newLeadsCount={newLeadsCount}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader email={email} fullName={fullName} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
