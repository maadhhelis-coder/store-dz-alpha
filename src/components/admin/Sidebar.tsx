"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Users,
  Layers,
  BarChart3,
  Gift,
  Ticket,
  Sparkles,
  Settings,
  X,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "الرئيسية", href: "/admin", icon: LayoutDashboard },
  { label: "الطلبات", href: "/admin/orders", icon: ShoppingCart },
  { label: "المنتجات", href: "/admin/products", icon: Package },
  { label: "التصنيفات", href: "/admin/categories", icon: FolderTree },
  { label: "العملاء المحتملون", href: "/admin/leads", icon: Users },
  { label: "صفحات الهبوط", href: "/admin/funnels", icon: Layers },
  { label: "التحليلات", href: "/admin/analytics", icon: BarChart3 },
  { label: "العروض الإضافية", href: "/admin/offers", icon: Gift },
  { label: "كوبونات الخصم", href: "/admin/coupons", icon: Ticket },
  { label: "الذكاء الاصطناعي", href: "/admin/ai-agent", icon: Sparkles, comingSoon: true },
  { label: "الإعدادات", href: "/admin/settings", icon: Settings },
];

const COLLAPSE_STORAGE_KEY = "storedz_admin_sidebar_collapsed";

type SidebarProps = {
  newLeadsCount?: number;
  mobileOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ newLeadsCount = 0, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // قراءة localStorage غير متاحة أثناء الـSSR، فلا بد من قيمة افتراضية آمنة (false) ثم
    // مزامنتها بعد التركيب — لا بديل بلا استعمال useSyncExternalStore لتفضيل عرض بسيط كهذا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function renderNavContent(isCollapsed: boolean) {
    return (
      <>
        <div className="flex items-center justify-between gap-2 px-2 py-3 mb-4">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-cream">
                STORE <span className="gold-gradient-text">DZ</span>
              </span>
              <span className="text-[11px] text-cream-dim/80">لوحة التحكم</span>
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="md:hidden text-cream-dim hover:text-gold p-1"
              aria-label="إغلاق القائمة"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const Icon = item.icon;

            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-cream-dim/40 cursor-not-allowed",
                    isCollapsed ? "justify-center" : "justify-between",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {!isCollapsed && item.label}
                  </span>
                  {!isCollapsed && (
                    <span className="text-[11px] border border-gold/20 text-gold/60 rounded-full px-1.5 py-0.5">
                      قريبًا
                    </span>
                  )}
                </div>
              );
            }

            const showLeadsBadge = item.href === "/admin/leads" && newLeadsCount > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isCollapsed ? "justify-center" : "justify-between",
                  isActive
                    ? "gold-gradient text-ink font-semibold"
                    : "text-cream-dim hover:text-gold hover:bg-black/30",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  {!isCollapsed && item.label}
                </span>
                {!isCollapsed && showLeadsBadge && (
                  <span className="text-[11px] font-bold bg-gold text-ink rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {newLeadsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "hidden md:flex items-center gap-2 text-xs text-cream-dim/80 hover:text-gold transition-colors mt-4 px-3 py-2",
            isCollapsed ? "justify-center w-full" : "",
          )}
          aria-label={isCollapsed ? "توسيع القائمة" : "طي القائمة"}
        >
          {isCollapsed ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
          {!isCollapsed && "طي القائمة"}
        </button>
      </>
    );
  }

  return (
    <>
      <aside
        className={cn(
          "shrink-0 border-e border-gold/15 bg-ink min-h-screen p-4 hidden md:block transition-[width] duration-200",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {renderNavContent(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
          <aside className="absolute inset-y-0 start-0 w-64 bg-ink p-4 overflow-y-auto">
            {renderNavContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
