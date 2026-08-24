"use client";

import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import type { Product } from "@/data/products";
import { useOrderModal } from "@/components/order/OrderModalProvider";
import { trackCreativeEvent } from "@/lib/tracking";
import { cn } from "@/lib/utils";

type FunnelCtaButtonProps = {
  product: Product;
  ctaText: string;
  className?: string;
};

export default function FunnelCtaButton({ product, ctaText, className }: FunnelCtaButtonProps) {
  const { openOrderModal } = useOrderModal();
  const pathname = usePathname();

  if (!product.inStock) {
    return (
      <button
        type="button"
        disabled
        data-testid="order-now-button"
        className={cn(
          "inline-flex items-center justify-center gap-2 gold-gradient text-ink font-bold px-6 py-4 rounded-xl text-base w-full cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span>نفذ من المخزون</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        trackCreativeEvent("cta_click", "landing", pathname, product.slug);
        openOrderModal(product, "landing");
      }}
      data-testid="order-now-button"
      className={cn(
        "inline-flex items-center justify-center gap-2 gold-gradient text-ink font-bold px-6 py-4 rounded-xl text-base w-full hover:brightness-110 transition gold-glow cta-attention",
        className,
      )}
    >
      <ShoppingBag className="w-4 h-4" strokeWidth={2.2} />
      <span>{ctaText}</span>
    </button>
  );
}
