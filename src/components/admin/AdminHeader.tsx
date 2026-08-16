"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu, User } from "lucide-react";

type AdminHeaderProps = {
  email: string;
  fullName?: string | null;
  onMenuClick?: () => void;
};

export default function AdminHeader({ email, fullName, onMenuClick }: AdminHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="h-16 border-b border-gold/15 bg-black flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden text-cream-dim hover:text-gold p-1 -ms-1"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="md:hidden font-display font-bold text-cream">
          STORE <span className="gold-gradient-text">DZ</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-cream-dim">
          <User className="w-4 h-4 text-gold" />
          <span>{fullName || email}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          data-testid="admin-logout"
          className="flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold transition-colors"
        >
          <LogOut className="w-4 h-4" />
          خروج
        </button>
      </div>
    </header>
  );
}
