"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Category, Product, ProductImage, ProductVariant } from "@prisma/client";
import RichTextEditor from "@/components/admin/RichTextEditor";
import MediaUploader from "@/components/admin/MediaUploader";
import { Field, inputClass } from "@/components/shared/FormField";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slugify";

type ProductFormProps = {
  mode: "create" | "edit";
  categories: Category[];
  initialProduct?: Product & { images: ProductImage[]; variants: ProductVariant[] };
};

type VariantRow = {
  id?: string;
  name: string;
  value: string;
  sku: string;
  priceOverrideDzd: string;
  inventoryCount: string;
};

export default function ProductForm({ mode, categories, initialProduct }: ProductFormProps) {
  const router = useRouter();
  const [productId, setProductId] = useState<string | null>(initialProduct?.id ?? null);

  const [name, setName] = useState(initialProduct?.name ?? "");
  const [slug, setSlug] = useState(initialProduct?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [categoryId, setCategoryId] = useState(initialProduct?.categoryId ?? categories[0]?.id ?? "");
  const [priceDzd, setPriceDzd] = useState(String(initialProduct?.priceDzd ?? ""));
  const [oldPriceDzd, setOldPriceDzd] = useState(
    initialProduct?.oldPriceDzd ? String(initialProduct.oldPriceDzd) : "",
  );
  const [costDzd, setCostDzd] = useState(
    initialProduct?.costDzd != null ? String(initialProduct.costDzd) : "",
  );
  const [shortDescription, setShortDescription] = useState(initialProduct?.shortDescription ?? "");
  const [longDescriptionHtml, setLongDescriptionHtml] = useState(initialProduct?.longDescriptionHtml ?? "");
  const [howToUse, setHowToUse] = useState<string[]>(
    (initialProduct?.howToUse as string[] | undefined) ?? [],
  );
  const [badge, setBadge] = useState(initialProduct?.badge ?? "");
  const [inStock, setInStock] = useState(initialProduct?.inStock ?? true);
  const [inventoryCount, setInventoryCount] = useState(String(initialProduct?.inventoryCount ?? 0));
  const [isPublished, setIsPublished] = useState(initialProduct?.isPublished ?? true);
  const [images, setImages] = useState<ProductImage[]>(initialProduct?.images ?? []);
  const [variants, setVariants] = useState<VariantRow[]>(
    (initialProduct?.variants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      value: v.value,
      sku: v.sku ?? "",
      priceOverrideDzd: v.priceOverrideDzd ? String(v.priceOverrideDzd) : "",
      inventoryCount: String(v.inventoryCount),
    })),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function addStep() {
    setHowToUse((prev) => [...prev, ""]);
  }
  function updateStep(index: number, value: string) {
    setHowToUse((prev) => prev.map((s, i) => (i === index ? value : s)));
  }
  function removeStep(index: number) {
    setHowToUse((prev) => prev.filter((_, i) => i !== index));
  }

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { name: "", value: "", sku: "", priceOverrideDzd: "", inventoryCount: "0" },
    ]);
  }
  function updateVariant(index: number, field: keyof VariantRow, value: string) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }
  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      slug,
      name,
      categoryId,
      priceDzd: Number(priceDzd),
      oldPriceDzd: oldPriceDzd ? Number(oldPriceDzd) : null,
      costDzd: costDzd ? Number(costDzd) : null,
      shortDescription,
      longDescriptionHtml,
      howToUse: howToUse.filter((s) => s.trim().length > 0),
      badge: badge || null,
      inStock,
      inventoryCount: Number(inventoryCount),
      isPublished,
      variants: variants
        .filter((v) => v.name.trim() && v.value.trim())
        .map((v) => ({
          name: v.name,
          value: v.value,
          sku: v.sku || undefined,
          priceOverrideDzd: v.priceOverrideDzd ? Number(v.priceOverrideDzd) : undefined,
          inventoryCount: Number(v.inventoryCount || 0),
        })),
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/products" : `/api/admin/products/${productId}`,
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
        setProductId(data.product.id);
        router.push(`/admin/products/${data.product.id}`);
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
          <div className="grid grid-cols-2 gap-4">
            <Field label="اسم المنتج">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="التصنيف">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="السعر (دج)">
              <input
                type="number"
                required
                min={0}
                value={priceDzd}
                onChange={(e) => setPriceDzd(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="السعر قبل التخفيض (اختياري)">
              <input
                type="number"
                min={0}
                value={oldPriceDzd}
                onChange={(e) => setOldPriceDzd(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="تكلفة الوحدة (دج) — اختياري">
              <input
                type="number"
                min={0}
                value={costDzd}
                onChange={(e) => setCostDzd(e.target.value)}
                className={inputClass}
                placeholder="لحساب الربح في لوحة الأداء"
              />
            </Field>
          </div>

          <Field label="وصف مختصر">
            <textarea
              required
              rows={2}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="الوصف الكامل">
            <RichTextEditor value={longDescriptionHtml} onChange={setLongDescriptionHtml} />
          </Field>
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-gold">كيفية الاستعمال</h2>
            <button type="button" onClick={addStep} className="text-gold text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> إضافة خطوة
            </button>
          </div>
          <div className="space-y-2">
            {howToUse.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={step}
                  onChange={(e) => updateStep(i, e.target.value)}
                  className={inputClass}
                />
                <button type="button" onClick={() => removeStep(i)} className="text-red-400 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <h2 className="font-display font-semibold text-gold mb-3">الصور</h2>
          <MediaUploader productId={productId} images={images} onImagesChange={setImages} />
        </div>

        <div className="rounded-xl gold-border bg-ink p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-gold">الخيارات (Variants)</h2>
            <button type="button" onClick={addVariant} className="text-gold text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> إضافة خيار
            </button>
          </div>
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-center">
                <input
                  type="text"
                  placeholder="اسم الخاصية (اللون)"
                  value={v.name}
                  onChange={(e) => updateVariant(i, "name", e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="القيمة (أسود)"
                  value={v.value}
                  onChange={(e) => updateVariant(i, "value", e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="SKU"
                  dir="ltr"
                  value={v.sku}
                  onChange={(e) => updateVariant(i, "sku", e.target.value)}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder="سعر إضافي"
                  value={v.priceOverrideDzd}
                  onChange={(e) => updateVariant(i, "priceOverrideDzd", e.target.value)}
                  className={inputClass}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="المخزون"
                    value={v.inventoryCount}
                    onChange={(e) => updateVariant(i, "inventoryCount", e.target.value)}
                    className={inputClass}
                  />
                  <button type="button" onClick={() => removeVariant(i)} className="text-red-400 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl gold-border bg-ink p-5 space-y-4">
          <Field label="المخزون">
            <input
              type="number"
              min={0}
              value={inventoryCount}
              onChange={(e) => setInventoryCount(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="شارة">
            <select value={badge} onChange={(e) => setBadge(e.target.value as typeof badge)} className={inputClass}>
              <option value="">بدون</option>
              <option value="bestseller">الأكثر مبيعًا</option>
              <option value="new">جديد</option>
              <option value="sale">عرض خاص</option>
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-cream-dim">
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
            متوفر بالمخزون
          </label>

          <label className="flex items-center gap-2 text-sm text-cream-dim">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            منشور فالموقع
          </label>
        </div>

        {error && <p className="text-xs text-red-400 px-1">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full gold-gradient text-ink font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "create" ? "إنشاء المنتج" : "حفظ التغييرات"}
        </button>
      </div>
    </form>
  );
}
