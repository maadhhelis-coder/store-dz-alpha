"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X, CheckCircle2, Loader2, Minus, Plus } from "lucide-react";
import BrandImage from "@/components/brand/BrandImage";
import type { Product } from "@/data/products";
import type { DeliveryOption } from "@/data/delivery";
import { communesByWilaya } from "@/data/communes";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Field, inputClass as baseInputClass } from "@/components/shared/FormField";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { trackPurchase, trackInitiateCheckout } from "@/lib/trackConversion";
import { getOrCreateVisitorId, getAttribution, trackCreativeEvent, type PageKindValue } from "@/lib/tracking";
import {
  buildOrderSummaryText,
  submitOrderToSheet,
  submitOrderToApi,
  captureAbandonedLead,
  OrderApiError,
  type OrderPayload,
} from "@/lib/orders";
import { useProductOffer } from "@/hooks/useProductOffer";
import { useDeliveryWilayas } from "@/hooks/useDeliveryWilayas";

type OrderModalProps = {
  product: Product;
  pageKind?: PageKindValue;
  onClose: () => void;
  thankYouMessage?: string | null;
  thankYouPageUrl?: string | null;
  privacyPolicyText?: string | null;
};

type Step = "form" | "submitting" | "success" | "error";

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  wilayaCode: string;
  commune: string;
  address: string;
  quantity: string;
  deliveryOption: DeliveryOption;
};

const INITIAL_FORM: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  wilayaCode: "",
  commune: "",
  address: "",
  quantity: "1",
  deliveryOption: "home",
};

export default function OrderModal({
  product,
  pageKind = "product",
  onClose,
  thankYouMessage,
  thankYouPageUrl,
  privacyPolicyText,
}: OrderModalProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [communeManual, setCommuneManual] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [lastOrder, setLastOrder] = useState<OrderPayload | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    () => product.variants.find((v) => v.inStock)?.id,
  );
  const [variantError, setVariantError] = useState<string | null>(null);
  // مفتاح ثابت لكل "محاولة طلب" (يبقى نفسه عبر إعادة المحاولة بعد فشل، لأن المكوّن لا
  // يُعاد تركيبه بين خطوة "form" و"error") — يُرسَل للسيرفر ليتعرّف على إعادة إرسال
  // حقيقية لنفس المحاولة بدل خلق طلب مكرَّر. راجع src/lib/idempotency.ts.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const offer = useProductOffer(product.slug);
  const remoteWilayas = useDeliveryWilayas();

  // نجمع الخيارات حسب الاسم (مثلاً "اللون") — كل صف ProductVariant يمثّل قيمة واحدة
  // ضمن بُعد واحد فقط (لا مصفوفة تركيبات لون×مقاس)، مطابقةً لنموذج البيانات الفعلي.
  const variantGroups = useMemo(() => {
    const groups = new Map<string, typeof product.variants>();
    for (const v of product.variants) {
      const list = groups.get(v.name) ?? [];
      list.push(v);
      groups.set(v.name, list);
    }
    return Array.from(groups.entries()).map(([name, options]) => ({ name, options }));
  }, [product]);

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const unitPrice = selectedVariant?.priceDzd ?? product.price;

  // إشارة "بدء إتمام الطلب" لبيكسلات الإعلانات — تُطلَق مرة واحدة فقط عند فتح النافذة
  // (بمصفوفة اعتماديات فارغة)، بغض النظر عن أي تعديل لاحق في الكمية أو المتغيّر المختار.
  useEffect(() => {
    trackInitiateCheckout({ contentId: product.slug, contentName: product.name, value: unitPrice });
    // نفس منطق form_submit (راجع أسفل) لكن عند فتح النافذة فعليًا — يعطي "معدل بدء تعبئة
    // الاستمارة" حقيقيًا ومنفصلًا عن "معدل إكمالها"، بدل الاكتفاء بالإرسال النهائي فقط.
    trackCreativeEvent("form_start", pageKind, pathname, product.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    if (step === "form") {
      captureAbandonedLead({
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        wilayaCode: form.wilayaCode ? Number(form.wilayaCode) : undefined,
        commune: form.commune.trim() || undefined,
        address: form.address.trim() || undefined,
        productSlug: product.slug,
        productName: product.name,
      });
    }
    onClose();
  }

  // نُخزّن أحدث نسخة من handleClose فـref بدل تضمين step/form فمصفوفة الاعتماديات —
  // يمنع إعادة تركيب مستمع لوحة المفاتيح مع كل ضغطة حرف أثناء تعبئة الاستمارة. التحديث
  // داخل effect بلا مصفوفة اعتماديات (يعمل بعد كل render) بدل أثناء الـrender نفسه.
  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";

    // حفظ العنصر الذي كان يحمل التركيز قبل الفتح (زر "اطلب الآن")، لإعادته إليه عند الإغلاق.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    // نقل التركيز لداخل النافذة فور فتحها — عنصر لوحة الحوار نفسها (بلا حقل محدد مسبقًا،
    // آمن أيضًا لحالتي النجاح/الخطأ اللتين لا تحتويان استمارة).
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseRef.current();
        return;
      }
      // حبس تركيز بسيط: Tab لا يخرج من النافذة لمحتوى الصفحة الخلفي.
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  const selectedWilaya = useMemo(
    () => (form.wilayaCode ? remoteWilayas.find((w) => w.code === Number(form.wilayaCode)) : undefined),
    [form.wilayaCode, remoteWilayas],
  );
  const officeAvailable = selectedWilaya ? selectedWilaya.officePriceDzd !== null : true;
  const communeOptions = useMemo(
    () => (form.wilayaCode ? (communesByWilaya[Number(form.wilayaCode)] ?? []) : []),
    [form.wilayaCode],
  );

  const deliveryPrice = useMemo(() => {
    if (!selectedWilaya) return null;
    return form.deliveryOption === "office" ? selectedWilaya.officePriceDzd : selectedWilaya.homePriceDzd;
  }, [selectedWilaya, form.deliveryOption]);

  // lowStockCount هو المخزون الحقيقي الوحيد المكشوف للعميل (فقط عند الاقتراب من النفاد) —
  // يُستعمل كسقف لمنع طلب كمية أكبر من المتوفر فعليًا.
  const maxQuantity = product.lowStockCount;
  const quantity = Math.max(1, Number(form.quantity) || 1);
  const productLineTotal = unitPrice * quantity;
  const offerApplied = offerAccepted && offer ? offer.offerPriceDzd : 0;

  const total = Math.max(0, productLineTotal + (deliveryPrice ?? 0) + offerApplied);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "wilayaCode") {
        const w = remoteWilayas.find((rw) => rw.code === Number(value));
        if (w && w.officePriceDzd === null) next.deliveryOption = "home";
        next.commune = "";
        setCommuneManual(false);
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim()) next.firstName = "الاسم مطلوب";
    if (!form.lastName.trim()) next.lastName = "اللقب مطلوب";
    if (!/^0[5-7][0-9]{8}$/.test(form.phone.trim())) {
      next.phone = "رقم هاتف غير صحيح (مثال: 0562848812)";
    }
    if (!form.wilayaCode) next.wilayaCode = "اختر الولاية";
    if (!form.commune.trim()) next.commune = "البلدية مطلوبة";
    if (form.deliveryOption === "home" && !form.address.trim()) {
      next.address = "العنوان مطلوب عند التوصيل للمنزل";
    }
    if (!form.quantity || Number(form.quantity) < 1) next.quantity = "الكمية غير صحيحة";
    else if (maxQuantity !== undefined && quantity > maxQuantity) {
      next.quantity = `الكمية المتوفرة فقط ${maxQuantity}`;
    }

    if (product.variants.length > 0 && !selectedVariantId) {
      setVariantError("اختر خيارًا قبل إتمام الطلب");
    } else {
      setVariantError(null);
    }

    setErrors(next);
    return Object.keys(next).length === 0 && (product.variants.length === 0 || !!selectedVariantId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedWilaya || deliveryPrice === null) return;

    const order: OrderPayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      wilayaCode: selectedWilaya.code,
      wilayaName: selectedWilaya.name,
      commune: form.commune.trim(),
      address: form.address.trim() || undefined,
      deliveryOption: form.deliveryOption,
      productName: product.name,
      productSlug: product.slug,
      variantLabel: selectedVariant ? `${selectedVariant.name}: ${selectedVariant.value}` : undefined,
      quantity,
      productPrice: productLineTotal,
      deliveryPrice,
      totalPrice: total,
      createdAt: new Date().toISOString(),
      ...(offerAccepted && offer
        ? { offerProductName: offer.offerProduct.name, offerPriceDzd: offer.offerPriceDzd }
        : {}),
    };

    setLastOrder(order);
    setStep("submitting");

    // إرسال احتياطي بلا انتظار (best-effort) لـ Google Sheets، بالتوازي مع الـ API الرئيسي —
    // فترة انتقالية، راجع GOOGLE_SHEETS_SETUP.md
    void submitOrderToSheet(order);

    try {
      const attribution = getAttribution();
      const result = await submitOrderToApi({
        firstName: order.firstName,
        lastName: order.lastName,
        phone: order.phone,
        wilayaCode: order.wilayaCode,
        commune: order.commune,
        address: order.address,
        deliveryOption: order.deliveryOption,
        productSlug: order.productSlug,
        ...(selectedVariantId ? { variantId: selectedVariantId } : {}),
        quantity: order.quantity,
        ...(offerAccepted && offer ? { offerId: offer.id } : {}),
        ...(attribution.platform ? { platform: attribution.platform } : {}),
        ...(attribution.creativeName ? { creativeName: attribution.creativeName } : {}),
        visitorId: getOrCreateVisitorId(),
      }, idempotencyKey);

      setOrderNumber(result.orderNumber);
      setLastOrder({
        ...order,
        deliveryPrice: result.deliveryPriceDzd,
        totalPrice: result.totalDzd,
        // السيرفر هو المصدر الموثوق: لو تجاهل العرض بصمت (محذوف/معطّل/نافد المخزون بين
        // لحظة الفتح ولحظة الإرسال) لا نعرض منتجًا لن يُشحَن أبدًا فشاشة التأكيد.
        ...(!result.offerIncluded ? { offerProductName: undefined, offerPriceDzd: undefined } : {}),
      });

      trackCreativeEvent("form_submit", pageKind, pathname, product.slug);

      trackPurchase({
        value: result.totalDzd,
        currency: "DZD",
        contentName: product.name,
        contentId: product.slug,
        quantity: order.quantity,
        orderId: result.orderNumber,
      });

      if (thankYouPageUrl) {
        window.location.href = thankYouPageUrl;
        return;
      }

      setStep("success");
    } catch (err) {
      setSubmitError(err instanceof OrderApiError ? err.message : "تعذر إرسال الطلب، حاول من جديد");
      setStep("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="إغلاق"
        onClick={handleClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-ink gold-border p-5 sm:p-7 focus:outline-none"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="إغلاق نافذة الطلب"
          className="absolute top-4 start-4 text-cream-dim hover:text-gold transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {(step === "form" || step === "submitting") && (
          <>
            <h2 id="order-modal-title" className="font-display text-xl font-bold text-cream pe-8">
              إتمام الطلب
            </h2>
            <p className="text-sm text-cream-dim mt-1">{product.name}</p>

            {variantGroups.length > 0 && (
              <div className="mt-4 space-y-3">
                {variantGroups.map((group) => (
                  <fieldset key={group.name}>
                    <legend className="text-xs text-cream-dim mb-2">{group.name}</legend>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option) => {
                        const active = selectedVariantId === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={!option.inStock}
                            onClick={() => {
                              setSelectedVariantId(option.id);
                              setVariantError(null);
                            }}
                            data-testid="order-variant-option"
                            data-variant-value={option.value}
                            className={cn(
                              "rounded-lg border px-3.5 py-2 text-sm transition-colors",
                              !option.inStock
                                ? "border-gold/15 text-cream-dim/40 cursor-not-allowed line-through"
                                : active
                                  ? "gold-gradient text-ink border-transparent font-semibold"
                                  : "border-gold/25 text-cream-dim hover:border-gold/50",
                            )}
                          >
                            {option.value}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                {variantError && <p className="text-[11px] text-red-400">{variantError}</p>}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الاسم" error={errors.firstName}>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    className={inputClass(!!errors.firstName)}
                    autoComplete="given-name"
                    data-testid="order-first-name"
                  />
                </Field>
                <Field label="اللقب" error={errors.lastName}>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    className={inputClass(!!errors.lastName)}
                    autoComplete="family-name"
                    data-testid="order-last-name"
                  />
                </Field>
              </div>

              <Field label="رقم الهاتف" error={errors.phone}>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="0562848812"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className={inputClass(!!errors.phone) + " text-right"}
                  autoComplete="tel"
                  data-testid="order-phone"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="الولاية" error={errors.wilayaCode}>
                  <select
                    value={form.wilayaCode}
                    onChange={(e) => updateField("wilayaCode", e.target.value)}
                    className={inputClass(!!errors.wilayaCode)}
                    data-testid="order-wilaya"
                  >
                    <option value="">اختر الولاية</option>
                    {remoteWilayas.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="البلدية" error={errors.commune}>
                  {communeOptions.length > 0 && !communeManual ? (
                    <select
                      value={form.commune}
                      onChange={(e) => {
                        if (e.target.value === "__other__") {
                          setCommuneManual(true);
                          updateField("commune", "");
                        } else {
                          updateField("commune", e.target.value);
                        }
                      }}
                      className={inputClass(!!errors.commune)}
                      data-testid="order-commune"
                    >
                      <option value="">اختر البلدية</option>
                      {communeOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value="__other__">بلدية أخرى (اكتب يدويًا)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.commune}
                      onChange={(e) => updateField("commune", e.target.value)}
                      placeholder={!form.wilayaCode ? "اختر الولاية أولاً" : undefined}
                      disabled={!form.wilayaCode}
                      className={inputClass(!!errors.commune)}
                      data-testid="order-commune"
                    />
                  )}
                  {communeManual && communeOptions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCommuneManual(false);
                        updateField("commune", "");
                      }}
                      className="text-[11px] text-gold hover:underline mt-1"
                    >
                      العودة لقائمة البلديات
                    </button>
                  )}
                </Field>
              </div>

              <div className={cn("grid gap-3", form.deliveryOption === "home" ? "grid-cols-3" : "grid-cols-1")}>
                {form.deliveryOption === "home" && (
                  <div className="col-span-2">
                    <Field label="العنوان بالتفصيل" error={errors.address}>
                      <input
                        type="text"
                        value={form.address}
                        onChange={(e) => updateField("address", e.target.value)}
                        placeholder="الحي، الشارع، رقم المنزل..."
                        className={inputClass(!!errors.address)}
                        data-testid="order-address"
                      />
                    </Field>
                  </div>
                )}
                <div className={form.deliveryOption === "home" ? "" : "max-w-[180px]"}>
                  <Field label="الكمية" error={errors.quantity}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateField("quantity", String(Math.max(1, quantity - 1)))}
                        aria-label="إنقاص الكمية"
                        className="w-12 h-12 shrink-0 rounded-lg border border-gold/25 text-cream flex items-center justify-center hover:border-gold transition-colors"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={maxQuantity}
                        value={form.quantity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const capped =
                            maxQuantity !== undefined && Number(raw) > maxQuantity
                              ? String(maxQuantity)
                              : raw;
                          updateField("quantity", capped);
                        }}
                        className={inputClass(!!errors.quantity) + " h-12 text-center text-xl font-bold"}
                        data-testid="order-quantity"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            "quantity",
                            String(maxQuantity !== undefined ? Math.min(maxQuantity, quantity + 1) : quantity + 1),
                          )
                        }
                        disabled={maxQuantity !== undefined && quantity >= maxQuantity}
                        aria-label="زيادة الكمية"
                        className="w-12 h-12 shrink-0 rounded-lg border border-gold/25 text-cream flex items-center justify-center hover:border-gold transition-colors disabled:opacity-60 disabled:hover:border-gold/25"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    {maxQuantity !== undefined && (
                      <p className="text-xs text-cream-dim/80 mt-1">الكمية المتوفرة: {maxQuantity} فقط</p>
                    )}
                  </Field>
                </div>
              </div>

              <fieldset>
                <legend className="text-xs text-cream-dim mb-2">نوع التوصيل</legend>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={radioLabelClass(form.deliveryOption === "home")}
                  >
                    <input
                      type="radio"
                      name="deliveryOption"
                      className="sr-only"
                      checked={form.deliveryOption === "home"}
                      onChange={() => updateField("deliveryOption", "home")}
                    />
                    توصيل للمنزل
                  </label>
                  <label
                    className={radioLabelClass(form.deliveryOption === "office" && officeAvailable) + (!officeAvailable ? " opacity-40 pointer-events-none" : "")}
                  >
                    <input
                      type="radio"
                      name="deliveryOption"
                      className="sr-only"
                      disabled={!officeAvailable}
                      checked={form.deliveryOption === "office"}
                      onChange={() => updateField("deliveryOption", "office")}
                    />
                    توصيل للمكتب
                  </label>
                </div>
                {!officeAvailable && selectedWilaya && (
                  <p className="text-xs text-cream-dim/80 mt-2">
                    التوصيل للمكتب غير متوفر حاليًا فولاية {selectedWilaya.name}.
                  </p>
                )}
              </fieldset>

              {offer && (
                <label className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offerAccepted}
                    onChange={(e) => setOfferAccepted(e.target.checked)}
                    className="mt-1"
                  />
                  {offer.offerProduct.imageUrl && (
                    <span className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden">
                      <BrandImage
                        src={offer.offerProduct.imageUrl}
                        alt={offer.offerProduct.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </span>
                  )}
                  <span className="text-sm">
                    <span className="block text-cream font-semibold">
                      أضف {offer.offerProduct.name} فقط بـ {formatPrice(offer.offerPriceDzd)}
                    </span>
                    <span className="block text-cream-dim/80 text-xs mt-0.5">
                      بدلاً من {formatPrice(offer.offerProduct.priceDzd)} — عرض خاص مع هذا الطلب فقط
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-xl gold-border bg-black/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-cream-dim">
                  <span>سعر المنتج {quantity > 1 ? `× ${quantity}` : ""}</span>
                  <span>{formatPrice(productLineTotal)}</span>
                </div>
                {offerAccepted && offer && (
                  <div className="flex justify-between text-cream-dim">
                    <span>{offer.offerProduct.name} (عرض إضافي)</span>
                    <span>{formatPrice(offer.offerPriceDzd)}</span>
                  </div>
                )}
                <div className="flex justify-between text-cream-dim">
                  <span>سعر التوصيل</span>
                  <span>{deliveryPrice !== null ? formatPrice(deliveryPrice) : "—"}</span>
                </div>
                <div className="flex justify-between font-bold text-gold pt-2 border-t border-gold/15">
                  <span>المجموع</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={step === "submitting"}
                className="w-full gold-gradient text-ink font-bold py-3.5 rounded-xl hover:brightness-110 transition disabled:opacity-60 flex items-center justify-center gap-2"
                data-testid="order-submit"
              >
                {step === "submitting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التأكيد...
                  </>
                ) : (
                  "تأكيد الطلبية"
                )}
              </button>
              <p className="text-[11px] text-cream-dim/80 text-center">
                الدفع عند الاستلام — لا حاجة لأي دفع الآن
              </p>

              {privacyPolicyText && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowPrivacyPolicy((v) => !v)}
                    aria-expanded={showPrivacyPolicy}
                    aria-controls="order-privacy-policy-text"
                    className="text-[11px] text-cream-dim/80 hover:text-gold underline"
                  >
                    سياسة الخصوصية
                  </button>
                  {showPrivacyPolicy && (
                    <p
                      id="order-privacy-policy-text"
                      className="text-[11px] text-cream-dim/80 leading-relaxed mt-2 text-start max-h-32 overflow-y-auto rounded-lg bg-black/40 p-3"
                    >
                      {privacyPolicyText}
                    </p>
                  )}
                </div>
              )}
            </form>
          </>
        )}

        {step === "success" && lastOrder && (
          <div className="text-center py-4" data-testid="order-success">
            <CheckCircle2 className="w-14 h-14 text-gold mx-auto" strokeWidth={1.5} />
            <h2 className="font-display text-xl font-bold text-cream mt-4">
              تم استلام طلبك بنجاح
            </h2>
            {orderNumber && (
              <p className="text-xs text-gold font-mono mt-1" data-testid="order-number">{orderNumber}</p>
            )}
            <p className="text-sm text-cream-dim mt-2">
              {thankYouMessage || `سنتواصل معك قريبًا على الرقم ${lastOrder.phone} لتأكيد التوصيل.`}
            </p>

            <div className="rounded-xl gold-border bg-black/40 p-4 mt-5 text-sm text-start space-y-1 text-cream-dim">
              <p>
                {lastOrder.productName}
                {lastOrder.variantLabel ? ` (${lastOrder.variantLabel})` : ""}
                {lastOrder.quantity > 1 ? ` × ${lastOrder.quantity}` : ""}
              </p>
              {lastOrder.offerProductName && (
                <p>+ {lastOrder.offerProductName} ({formatPrice(lastOrder.offerPriceDzd ?? 0)})</p>
              )}
              <p>
                {lastOrder.wilayaName} — {lastOrder.commune}
                {lastOrder.address ? ` — ${lastOrder.address}` : ""}
              </p>
              <p className="text-gold font-bold">{formatPrice(lastOrder.totalPrice)}</p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="mt-5 text-sm text-cream-dim hover:text-gold transition-colors"
            >
              إغلاق
            </button>
          </div>
        )}

        {step === "error" && lastOrder && (
          <div className="text-center py-4" data-testid="order-error-screen">
            <h2 className="font-display text-xl font-bold text-cream mt-2">
              تعذر إرسال طلبك
            </h2>
            <p className="text-sm text-cream-dim mt-2">{submitError}</p>

            <div className="mt-5 space-y-2">
              <p className="text-xs text-cream-dim/80">
                لا تقلق، أرسل تفاصيل طلبك مباشرة عبر واتساب وسنؤكده معك:
              </p>
              <a
                href={buildWhatsAppUrl(buildOrderSummaryText(lastOrder))}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackCreativeEvent("cta_click", pageKind, pathname, product.slug)}
                className="inline-flex items-center justify-center gap-2 bg-[#25d366] text-[#06210f] font-bold px-5 py-3 rounded-xl w-full"
              >
                إرسال الطلب عبر واتساب
              </a>
            </div>

            <button
              type="button"
              onClick={() => setStep("form")}
              className="mt-4 text-sm text-gold hover:underline"
            >
              حاول مرة أخرى
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(baseInputClass, hasError && "border-red-500/60");
}

function radioLabelClass(active: boolean) {
  return `flex items-center justify-center text-center rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
    active
      ? "gold-gradient text-ink border-transparent font-semibold"
      : "border-gold/25 text-cream-dim hover:border-gold/50"
  }`;
}
