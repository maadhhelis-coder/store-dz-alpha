"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type SettingsTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

type SettingsTabsProps = {
  tabs: SettingsTab[];
};

export default function SettingsTabs({ tabs }: SettingsTabsProps) {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeId, setActiveId] = useState(
    tabs.some((t) => t.id === tabFromUrl) ? (tabFromUrl as string) : (tabs[0]?.id ?? ""),
  );
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-6">
      <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveId(tab.id)}
            className={cn(
              "text-sm text-start px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap shrink-0",
              tab.id === active?.id
                ? "gold-gradient text-ink font-semibold"
                : "text-cream-dim hover:bg-black/30 hover:text-gold",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div>{active?.content}</div>
    </div>
  );
}
