"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import type { Product } from "@/data/products";
import { trackCreativeEvent, type PageKindValue } from "@/lib/tracking";
import { cn } from "@/lib/utils";

// زر "اطلب الآن".
//
// خارج صفحة المنتج (بطاقات، صفحة هبوط): رابط لصفحة المنتج — لا نافذة تنبثق فوق
// الصفحة. داخل صفحة المنتج: ينزل بالزبون إلى الاستمارة المدمجة أسفلها.

type Variant = "inline" | "primary-large" | "sticky-bar";

type OrderNowButtonProps = {
  product: Product;
  variant?: Variant;
  /** "form" داخل صفحة المنتج (نزول للاستمارة)، وإلا رابط لصفحة المنتج. */
  target?: "product-page" | "form";
  pageKind?: PageKindValue;
  label?: string;
  className?: string;
};

const VARIANT_STYLES: Record<Variant, string> = {
  inline:
    "gold-gradient text-ink font-semibold px-4 py-2.5 rounded-lg text-sm w-full hover:brightness-110 transition",
  "primary-large":
    "gold-gradient text-ink font-bold px-6 py-4 rounded-xl text-base w-full hover:brightness-110 transition gold-glow",
  // الشريط الثابت: أصغر من primary-large لأن السعر يشاركه نفس السطر
  "sticky-bar":
    "gold-gradient text-ink font-bold px-4 py-2.5 rounded-lg text-sm w-full hover:brightness-110 transition gold-glow",
};

export const ORDER_FORM_ID = "order-form";

export default function OrderNowButton({
  product,
  variant = "inline",
  target = "product-page",
  pageKind = "product",
  label = "اطلب الآن",
  className,
}: OrderNowButtonProps) {
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

  const classes = cn(
    "inline-flex items-center justify-center gap-2 cta-attention",
    VARIANT_STYLES[variant],
    className,
  );
  const content = (
    <>
      <ShoppingBag className="w-4 h-4" strokeWidth={2.2} />
      <span>{label}</span>
    </>
  );

  if (target === "form") {
    return (
      <button
        type="button"
        onClick={() => {
          trackCreativeEvent("cta_click", pageKind, pathname, product.slug);
          document.getElementById(ORDER_FORM_ID)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }}
        data-testid="order-now-button"
        className={classes}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/products/${product.slug}`}
      onClick={() => trackCreativeEvent("cta_click", pageKind, pathname, product.slug)}
      data-testid="order-now-button"
      className={classes}
    >
      {content}
    </Link>
  );
}
