"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Funnel, FunnelPageType, Product, ProductImage } from "@prisma/client";
import { cn } from "@/lib/utils";
import HeroImageUploader from "@/components/admin/HeroImageUploader";
import { Field, inputClass } from "@/components/shared/FormField";
import { slugify } from "@/lib/slugify";

type FunnelFormProps = {
  mode: "create" | "edit";
  products: (Product & { images: ProductImage[] })[];
  initialFunnel?: Funnel;
};

export default function FunnelForm({ mode, products, initialFunnel }: FunnelFormProps) {
  const router = useRouter();
  const [funnelId] = useState<string | null>(initialFunnel?.id ?? null);

  const [title, setTitle] = useState(initialFunnel?.title ?? "");
  const [slug, setSlug] = useState(initialFunnel?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [productId, setProductId] = useState(initialFunnel?.productId ?? products[0]?.id ?? "");
  const [pageType, setPageType] = useState<FunnelPageType>(initialFunnel?.pageType ?? "funnel");
  const [headline, setHeadline] = useState(initialFunnel?.headline ?? "");
  const [subheadline, setSubheadline] = useState(initialFunnel?.subheadline ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(initialFunnel?.heroImageUrl ?? "");
  const [bullets, setBullets] = useState<string[]>(
    (initialFunnel?.bullets as string[] | undefined) ?? [],
  );
  const [ctaText, setCtaText] = useState(initialFunnel?.ctaText ?? "اطلب الآن");
  const [isPublished, setIsPublished] = useState(initialFunnel?.isPublished ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedProduct = products.find((p) => p.id === productId);

  async function handleDelete() {
    if (!funnelId) return;
    if (!window.confirm(`هل تريد حذف الصفحة "${title}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/funnels/${funnelId}`, { method: "DELETE" });
      router.push("/admin/funnels");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handlePageTypeChange(value: FunnelPageType) {
    setPageType(value);
    if (value === "product_page" && !headline.trim() && selectedProduct) {
      setHeadline(selectedProduct.name);
    }
  }

  function addBullet() {
    setBullets((prev) => [...prev, ""]);
  }
  function updateBullet(index: number, value: string) {
    setBullets((prev) => prev.map((b, i) => (i === index ? value : b)));
  }
  function removeBullet(index: number) {
    setBullets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      slug,
      title,
      productId,
      pageType,
      headline,
      subheadline: subheadline || undefined,
      heroImageUrl: heroImageUrl || undefined,
      bullets: bullets.filter((b) => b.trim().length > 0),
      ctaText,
      isPublished,
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/funnels" : `/api/admin/funnels/${funnelId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "حدث خطأ غير متوقع");
        return;
      }

      if (mode === "create") {
        router.push(`/admin/funnels/${data.funnel.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <div className="rounded-xl gold-border bg-ink p-5 space-y-4">
          <Field label="نوع الصفحة">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handlePageTypeChange("funnel")}
                className={pageTypeButtonClass(pageType === "funnel")}
              >
                صفحة هبوط (Funnel)
              </button>
              <button
                type="button"
                onClick={() => handlePageTypeChange("product_page")}
                className={pageTypeButtonClass(pageType === "product_page")}
              >
                صفحة منتج (Product Page)
              </button>
            </div>
            <p className="text-[11px] text-cream-dim/80 mt-1.5">
              {pageType === "funnel"
                ? "صفحة بيع مختصرة ومركزة على الإقناع والتحويل."
                : "صفحة منتج كاملة (معرض صور، وصف، كيفية الاستعمال) بنفس رابط مخصص."}
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="عنوان الصفحة (داخلي)">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="الرابط (slug)">
              <input
                type="text"
                required
                dir="ltr"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                className={cn(inputClass, "text-left")}
              />
            </Field>
          </div>

          <Field label="المنتج">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="العنوان الرئيسي (Headline)">
            <textarea
              required
              rows={2}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className={inputClass}
            />
          </Field>

          {pageType === "funnel" && (
            <>
              <Field label="العنوان الفرعي (اختياري)">
                <textarea
                  rows={2}
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="صورة الغلاف (اختياري)">
                <HeroImageUploader value={heroImageUrl} onChange={setHeroImageUrl} />
                {selectedProduct && selectedProduct.images[0] && !heroImageUrl && (
                  <p className="text-[11px] text-cream-dim/80 mt-1.5">
                    سيتم استخدام:{" "}
                    <button
                      type="button"
                      onClick={() => setHeroImageUrl(selectedProduct.images[0].url)}
                      className="text-gold hover:underline"
                    >
                      صورة المنتج الأساسية
                    </button>
                  </p>
                )}
              </Field>
            </>
          )}

          <Field label="نص زر الطلب">
            <input
              type="text"
              required
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {pageType === "funnel" && (
          <div className="rounded-xl gold-border bg-ink p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-gold">نقاط الإقناع (Bullets)</h2>
              <button type="button" onClick={addBullet} className="text-gold text-sm flex items-center gap-1">
                <Plus className="w-4 h-4" /> إضافة نقطة
              </button>
            </div>
            <div className="space-y-2">
              {bullets.map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={bullet}
                    onChange={(e) => updateBullet(i, e.target.value)}
                    className={inputClass}
                  />
                  <button type="button" onClick={() => removeBullet(i)} className="text-red-400 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {bullets.length === 0 && (
                <p className="text-xs text-cream-dim/80">لا توجد نقاط بعد — أضف مزايا المنتج لإقناع الزائر.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="rounded-xl gold-border bg-ink p-5 space-y-4">
          <label className="flex items-center gap-2 text-sm text-cream-dim">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            منشورة (متاحة على الرابط العام)
          </label>
          {slug && (
            <p className="text-[11px] text-cream-dim/80" dir="ltr">
              /lp/{slug}
            </p>
          )}
        </div>

        {error && <p className="text-xs text-red-400 px-1">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full gold-gradient text-ink font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "create" ? "إنشاء الصفحة" : "حفظ التغييرات"}
        </button>

        {mode === "edit" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="w-full border border-red-400/40 text-red-400 hover:bg-red-400/10 font-semibold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            حذف الصفحة
          </button>
        )}
      </div>
    </form>
  );
}

function pageTypeButtonClass(active: boolean) {
  return cn(
    "rounded-lg border px-3 py-2.5 text-sm text-center transition-colors",
    active
      ? "gold-gradient text-ink border-transparent font-semibold"
      : "border-gold/25 text-cream-dim hover:border-gold/50",
  );
}
