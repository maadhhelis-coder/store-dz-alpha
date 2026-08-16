"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Product } from "@/data/products";
import OrderModal from "@/components/order/OrderModal";
import type { PageKindValue } from "@/lib/tracking";

type OrderModalContextValue = {
  openOrderModal: (product: Product, pageKind?: PageKindValue) => void;
  closeOrderModal: () => void;
};

const OrderModalContext = createContext<OrderModalContextValue | null>(null);

export function useOrderModal(): OrderModalContextValue {
  const ctx = useContext(OrderModalContext);
  if (!ctx) {
    throw new Error("useOrderModal must be used within OrderModalProvider");
  }
  return ctx;
}

export type OrderModalSettings = {
  thankYouMessage?: string | null;
  thankYouPageUrl?: string | null;
  privacyPolicyText?: string | null;
};

export default function OrderModalProvider({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings?: OrderModalSettings;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [pageKind, setPageKind] = useState<PageKindValue>("product");

  const openOrderModal = useCallback((p: Product, kind: PageKindValue = "product") => {
    setProduct(p);
    setPageKind(kind);
  }, []);
  const closeOrderModal = useCallback(() => setProduct(null), []);

  const value = useMemo(
    () => ({ openOrderModal, closeOrderModal }),
    [openOrderModal, closeOrderModal],
  );

  return (
    <OrderModalContext.Provider value={value}>
      {children}
      {product && (
        <OrderModal
          product={product}
          pageKind={pageKind}
          onClose={closeOrderModal}
          thankYouMessage={settings?.thankYouMessage}
          thankYouPageUrl={settings?.thankYouPageUrl}
          privacyPolicyText={settings?.privacyPolicyText}
        />
      )}
    </OrderModalContext.Provider>
  );
}
