"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { Category } from "@prisma/client";
import UrlFieldWithOpen from "@/components/admin/UrlFieldWithOpen";
import { Field, inputClass } from "@/components/shared/FormField";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slugify";

type CategoryFormProps = {
  mode: "create" | "edit";
  initialCategory?: Category;
};

export default function CategoryForm({ mode, initialCategory }: CategoryFormProps) {
  const router = useRouter();
  const [categoryId] = useState<string | null>(initialCategory?.id ?? null);

  const [name, setName] = useState(initialCategory?.name ?? "");
  const [slug, setSlug] = useState(initialCategory?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [shortDescription, setShortDescription] = useState(initialCategory?.shortDescription ?? "");
  const [description, setDescription] = useState(initialCategory?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initialCategory?.imageUrl ?? "");
  const [sortOrder, setSortOrder] = useState(String(initialCategory?.sortOrder ?? 0));

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      slug,
      name,
      shortDescription: shortDescription || undefined,
      description: description || undefined,
      imageUrl: imageUrl || undefined,
      sortOrder: Number(sortOrder) || 0,
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/categories" : `/api/admin/categories/${categoryId}`,
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
        router.push(`/admin/categories/${data.category.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!categoryId) return;
    if (!window.confirm(`هل تريد حذف التصنيف "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/categories/${categoryId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "تعذر حذف التصنيف");
        return;
      }
      router.push("/admin/categories");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <div className="rounded-xl gold-border bg-ink p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم التصنيف">
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

        <Field label="وصف مختصر (اختياري)">
          <input
            type="text"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="الوصف الكامل (اختياري)">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="رابط الصورة (اختياري)">
          <UrlFieldWithOpen value={imageUrl} onChange={setImageUrl} placeholder="https://..." />
        </Field>

        <Field label="ترتيب العرض">
          <input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {error && <p className="text-xs text-red-400 px-1 mt-3">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full gold-gradient text-ink font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "create" ? "إنشاء التصنيف" : "حفظ التغييرات"}
      </button>

      {mode === "edit" && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full border border-red-400/40 text-red-400 hover:bg-red-400/10 font-semibold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2 mt-3"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          حذف التصنيف
        </button>
      )}
    </form>
  );
}
