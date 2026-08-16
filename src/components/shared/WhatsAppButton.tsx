import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "./SocialIcons";

type Variant = "pill" | "floating" | "inline" | "primary-large";

type WhatsAppButtonProps = {
  message: string;
  variant?: Variant;
  label?: string;
  className?: string;
  ariaLabel?: string;
};

const VARIANT_STYLES: Record<Variant, string> = {
  pill: "gold-gradient text-ink font-semibold px-4 py-2 rounded-full text-sm hover:brightness-110 transition",
  inline:
    "gold-gradient text-ink font-semibold px-4 py-2.5 rounded-lg text-sm w-full hover:brightness-110 transition",
  "primary-large":
    "gold-gradient text-ink font-bold px-6 py-4 rounded-xl text-base w-full hover:brightness-110 transition gold-glow",
  floating:
    "fixed bottom-5 start-5 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:scale-105 transition-transform",
};

export default function WhatsAppButton({
  message,
  variant = "pill",
  label = "تواصل معنا عبر واتساب",
  className,
  ariaLabel,
}: WhatsAppButtonProps) {
  const href = buildWhatsAppUrl(message);
  const isFloating = variant === "floating";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel ?? label}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <WhatsAppIcon className={isFloating ? "w-7 h-7" : "w-4 h-4"} />
      {!isFloating && <span>{label}</span>}
    </a>
  );
}
