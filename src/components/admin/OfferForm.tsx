"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { Offer, Product } from "@prisma/client";
import { formatPrice } from "@/lib/format";
import { Field, inputClass } from "@/components/shared/FormField";

type OfferFormProps = {
  mode: "create" | "edit";
  products: Product[];
  initialOffer?: Offer;
};

export default function OfferForm({ mode, products, initialOffer }: OfferFormProps) {
  const router = useRouter();
  const [offerId] = useState<string | null>(initialOffer?.id ?? null);

  const [title, setTitle] = useState(initialOffer?.title ?? "");
  const [triggerProductId, setTriggerProductId] = useState(
    initialOffer?.triggerProductId ?? products[0]?.id ?? "",
  );
  const [offerProductId, setOfferProductId] = useState(
    initialOffer?.offerProductId ?? products[1]?.id ?? products[0]?.id ?? "",
  );
  const [offerPriceDzd, setOfferPriceDzd] = useState(String(initialOffer?.offerPriceDzd ?? ""));
  const [isActive, setIsActive] = useState(initialOffer?.isActive ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const offerProduct = products.find((p) => p.id === offerProductId);
  const sameProduct = triggerProductId === offerProductId;

  async function handleDelete() {
    if (!offerId) return;
    if (!window.confirm(`هل تريد حذف العرض "${title}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/offers/${offerId}`, { method: "DELETE" });
      router.push("/admin/offers");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (sameProduct) {
      setError("يجب أن يكون منتج العرض مختلفًا عن المنتج الأساسي");
      return;
    }

    setSaving(true);

    const payload = {
      title,
      triggerProductId,
      offerProductId,
      offerPriceDzd: Number(offerPriceDzd),
      isActive,
    };

    try {
      const res = await fetch(mode === "create" ? "/api/admin/offers" : `/api/admin/offers/${offerId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "حدث خطأ غير متوقع");
        return;
      }

      if (mode === "create") {
        router.push(`/admin/offers/${data.offer.id}`);
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
    <form onSubmit={handleSubmit} className="max-w-xl">
      <div className="rounded-xl gold-border bg-ink p-5 space-y-4">
        <Field label="عنوان العرض (داخلي)">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: أضف شاحن سريع مع السماعة"
            className={inputClass}
          />
        </Field>

        <Field label="عند طلب هذا المنتج">
          <select
            value={triggerProductId}
            onChange={(e) => setTriggerProductId(e.target.value)}
            className={inputClass}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="اعرض عليه هذا المنتج بسعر خاص">
          <select
            value={offerProductId}
            onChange={(e) => setOfferProductId(e.target.value)}
            className={inputClass}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatPrice(p.priceDzd)})
              </option>
            ))}
          </select>
        </Field>

        <Field label="السعر الخاص (دج)">
          <input
            type="number"
            required
            min={0}
            value={offerPriceDzd}
            onChange={(e) => setOfferPriceDzd(e.target.value)}
            className={inputClass}
          />
          {offerProduct && (
            <p className="text-[11px] text-cream-dim/80 mt-1.5">
              السعر العادي: {formatPrice(offerProduct.priceDzd)}
            </p>
          )}
        </Field>

        {sameProduct && (
          <p className="text-xs text-red-400">يجب أن يكون منتج العرض مختلفًا عن المنتج الأساسي</p>
        )}

        <label className="flex items-center gap-2 text-sm text-cream-dim">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          مفعّل (يظهر للزبائن عند الطلب)
        </label>
      </div>

      {error && <p className="text-xs text-red-400 px-1 mt-3">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full gold-gradient text-ink font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "create" ? "إنشاء العرض" : "حفظ التغييرات"}
      </button>

      {mode === "edit" && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full border border-red-400/40 text-red-400 hover:bg-red-400/10 font-semibold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2 mt-3"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          حذف العرض
        </button>
      )}
    </form>
  );
}
