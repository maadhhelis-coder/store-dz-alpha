// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PixelWindow = typeof window & { fbq?: any; ttq?: any; gtag?: any; snaptr?: any };

type PurchaseParams = {
  value: number;
  currency?: string;
  contentName?: string;
  contentId?: string;
  quantity?: number;
  orderId: string;
};

// يُطلق حدث "شراء" حقيقي على كل بيكسل تتبّع مفعّل (إن وُجد) بعد تأكيد الطلب فعليًا —
// لا يفشل أبدًا بصمت أي بيكسل آخر إذا فشل واحد منها.
//
// orderId يُمرَّر كـ event_id/eventID لميتا وتيك توك تحديدًا — نفس القيمة التي يرسلها
// السيرفر عبر Meta CAPI/TikTok Events API لنفس الطلب (راجع metaCapiService.ts وtiktokEventsApiService.ts)،
// وهذا ما يُتيح لميتا/تيك توك دمج حدثي Pixel وCAPI فلا يُحتسب الشراء مرتين.
export function trackPurchase({ value, currency = "DZD", contentName, contentId, quantity, orderId }: PurchaseParams): void {
  if (typeof window === "undefined") return;
  const w = window as PixelWindow;

  try {
    if (typeof w.fbq === "function") {
      w.fbq(
        "track",
        "Purchase",
        {
          value,
          currency,
          content_name: contentName,
          content_type: "product",
          ...(contentId ? { content_ids: [contentId], contents: [{ id: contentId, quantity: quantity ?? 1 }] } : {}),
        },
        { eventID: orderId },
      );
    }
  } catch {}

  try {
    if (typeof w.ttq?.track === "function") {
      w.ttq.track(
        "CompletePayment",
        {
          value,
          currency,
          content_name: contentName,
          ...(contentId ? { content_id: contentId, quantity: quantity ?? 1 } : {}),
        },
        { event_id: orderId },
      );
    }
  } catch {}

  try {
    if (typeof w.gtag === "function") {
      w.gtag("event", "purchase", {
        value,
        currency,
        transaction_id: orderId,
        ...(contentId
          ? { items: [{ item_id: contentId, item_name: contentName, quantity: quantity ?? 1, price: value }] }
          : {}),
      });
    }
  } catch {}

  try {
    if (typeof w.snaptr === "function") {
      w.snaptr("track", "PURCHASE", { price: value, currency, transaction_id: orderId });
    }
  } catch {}
}

type ContentEventParams = {
  contentId: string;
  contentName?: string;
  value?: number;
  currency?: string;
};

// حدث "مشاهدة منتج" — يُطلَق عند تحميل صفحة منتج أو صفحة هبوط، ليمتلك كل من ميتا/تيك توك
// إشارة منتصف القمع اللازمة للتحسين وإعادة الاستهداف (بدل الاكتفاء بـPageView وPurchase فقط).
export function trackViewContent({ contentId, contentName, value, currency = "DZD" }: ContentEventParams): void {
  if (typeof window === "undefined") return;
  const w = window as PixelWindow;

  try {
    if (typeof w.fbq === "function") {
      w.fbq("track", "ViewContent", {
        content_ids: [contentId],
        content_type: "product",
        content_name: contentName,
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (typeof w.ttq?.track === "function") {
      w.ttq.track("ViewContent", { content_id: contentId, content_name: contentName, value, currency });
    }
  } catch {}

  try {
    if (typeof w.gtag === "function") {
      w.gtag("event", "view_item", {
        currency,
        value,
        items: [{ item_id: contentId, item_name: contentName, price: value }],
      });
    }
  } catch {}

  try {
    if (typeof w.snaptr === "function") {
      w.snaptr("track", "VIEW_CONTENT", { item_ids: [contentId], price: value, currency });
    }
  } catch {}
}

// حدث "بدء إتمام الطلب" — يُطلَق عند فتح نافذة الطلب (OrderModal)، النقطة التي يُظهر فيها
// الزائر نيّة شراء فعلية قبل تعبئة/إرسال النموذج.
export function trackInitiateCheckout({ contentId, contentName, value, currency = "DZD" }: ContentEventParams): void {
  if (typeof window === "undefined") return;
  const w = window as PixelWindow;

  try {
    if (typeof w.fbq === "function") {
      w.fbq("track", "InitiateCheckout", {
        content_ids: [contentId],
        content_type: "product",
        content_name: contentName,
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (typeof w.ttq?.track === "function") {
      w.ttq.track("InitiateCheckout", { content_id: contentId, content_name: contentName, value, currency });
    }
  } catch {}

  try {
    if (typeof w.gtag === "function") {
      w.gtag("event", "begin_checkout", {
        currency,
        value,
        items: [{ item_id: contentId, item_name: contentName, price: value }],
      });
    }
  } catch {}

  try {
    if (typeof w.snaptr === "function") {
      w.snaptr("track", "START_CHECKOUT", { item_ids: [contentId], price: value, currency });
    }
  } catch {}
}
