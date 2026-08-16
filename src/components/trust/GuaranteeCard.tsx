import { BadgePercent, Lock, Headset, ShieldCheck } from "lucide-react";
import { GUARANTEES } from "@/data/site";

const ICONS = {
  "badge-percent": BadgePercent,
  lock: Lock,
  headset: Headset,
} as const;

export default function GuaranteeCard() {
  return (
    <div className="rounded-2xl gold-border bg-ink p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-8 h-8 text-gold" strokeWidth={1.75} />
        <h3 className="font-display text-xl md:text-2xl font-bold gold-gradient-text">
          ضمان حقيقي
        </h3>
      </div>
      <ul className="space-y-5">
        {GUARANTEES.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS];
          return (
            <li key={item.id} className="flex items-start gap-4">
              <span className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center gold-border">
                <Icon className="w-5 h-5 text-gold" strokeWidth={1.75} />
              </span>
              <div>
                <p className="font-semibold text-cream">{item.title}</p>
                <p className="text-sm text-cream-dim mt-1">{item.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
