"use client";

import { Moon, Sun } from "lucide-react";
import { useAdminTheme } from "@/components/admin/AdminThemeProvider";
import { cn } from "@/lib/utils";

export default function AppearanceSettingsForm() {
  const { theme, setTheme } = useAdminTheme();

  return (
    <div className="max-w-xl rounded-xl gold-border bg-ink p-5">
      <p className="text-xs text-cream-dim mb-4">اختر مظهر لوحة التحكم (لا يؤثر على واجهة المتجر العامة)</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border px-4 py-5 transition-colors",
            theme === "dark"
              ? "gold-gradient text-ink border-transparent font-semibold"
              : "border-gold/25 text-cream-dim hover:border-gold/50",
          )}
        >
          <Moon className="w-6 h-6" />
          داكن (Sombre)
        </button>
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border px-4 py-5 transition-colors",
            theme === "light"
              ? "gold-gradient text-ink border-transparent font-semibold"
              : "border-gold/25 text-cream-dim hover:border-gold/50",
          )}
        >
          <Sun className="w-6 h-6" />
          فاتح (Clair)
        </button>
      </div>
    </div>
  );
}
