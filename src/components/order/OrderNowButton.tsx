"use client";

import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import type { Product } from "@/data/products";
import { useOrderModal } from "@/components/order/OrderModalProvider";
import { trackCreativeEvent } from "@/lib/tracking";
import { cn } from "@/lib/utils";

type Variant = "inline" | "primary-large";

type OrderNowButtonProps = {
  product: Product;
  variant?: Variant;
  className?: string;
};

const VARIANT_STYLES: Record<Variant, string> = {
  inline:
    "gold-gradient text-ink font-semibold px-4 py-2.5 rounded-lg text-sm w-full hover:brightness-110 transition",
  "primary-large":
    "gold-gradient text-ink font-bold px-6 py-4 rounded-xl text-base w-full hover:brightness-110 transition gold-glow",
};

export default function OrderNowButton({
  product,
  variant = "inline",
  className,
}: OrderNowButtonProps) {
  const { openOrderModal } = useOrderModal();
  const pathname = usePathname();

  if (!product.inStock) {
    return (
      <button
        type="button"
        disabled
        data-testid="order-now-button"
        className={cn(
          "inline-flex items-center justify-center gap-2 cursor-not-allowed opacity-50",
          VARIANT_STYLES[variant],
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
        trackCreativeEvent("cta_click", "product", pathname, product.slug);
        openOrderModal(product, "product");
      }}
      data-testid="order-now-button"
      className={cn(
        "inline-flex items-center justify-center gap-2",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <ShoppingBag className="w-4 h-4" strokeWidth={2.2} />
      <span>اطلب الآن</span>
    </button>
  );
}
