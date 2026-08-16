"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type AnalyticsTabsProps = {
  overview: React.ReactNode;
  creativeAnalytics: React.ReactNode;
};

export default function AnalyticsTabs({ overview, creativeAnalytics }: AnalyticsTabsProps) {
  const [active, setActive] = useState<"overview" | "creative">("overview");

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-gold/15">
        <TabButton active={active === "overview"} onClick={() => setActive("overview")}>
          نظرة عامة
        </TabButton>
        <TabButton active={active === "creative"} onClick={() => setActive("creative")}>
          تحليل الإعلانات
        </TabButton>
      </div>
      {active === "overview" ? overview : creativeAnalytics}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
        active ? "border-gold text-gold" : "border-transparent text-cream-dim hover:text-cream",
      )}
    >
      {children}
    </button>
  );
}
