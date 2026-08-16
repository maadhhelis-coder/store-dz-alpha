import Link from "next/link";
import BrandImage from "@/components/brand/BrandImage";
import { SITE_NAME } from "@/data/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: number;
  logoUrl?: string | null;
};

export default function Logo({ className, size = 44, logoUrl }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2 shrink-0", className)}
      aria-label={`${SITE_NAME} — الصفحة الرئيسية`}
    >
      <BrandImage
        src={logoUrl || "/images/brand/logo-on-black.png"}
        alt={`شعار ${SITE_NAME}`}
        width={size}
        height={size}
        className="rounded-full"
        priority
      />
      <span className="font-display font-bold text-lg tracking-wide text-cream">
        STORE <span className="gold-gradient-text">DZ</span>
      </span>
    </Link>
  );
}
