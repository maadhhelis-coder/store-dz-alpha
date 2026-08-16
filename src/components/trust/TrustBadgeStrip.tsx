import { BadgeCheck, Truck, HandCoins, Headset } from "lucide-react";
import { TRUST_BADGES } from "@/data/site";
import { cn } from "@/lib/utils";

const ICONS = {
  "badge-check": BadgeCheck,
  truck: Truck,
  "hand-coins": HandCoins,
  headset: Headset,
} as const;

type TrustBadgeStripProps = {
  className?: string;
};

export default function TrustBadgeStrip({ className }: TrustBadgeStripProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 border-y border-gold/15 py-6",
        className,
      )}
    >
      {TRUST_BADGES.map((badge) => {
        const Icon = ICONS[badge.icon as keyof typeof ICONS];
        return (
          <div key={badge.id} className="flex flex-col items-center text-center gap-2 px-2">
            <Icon className="w-7 h-7 text-gold" strokeWidth={1.75} />
            <span className="text-xs md:text-sm font-semibold text-cream">
              {badge.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
