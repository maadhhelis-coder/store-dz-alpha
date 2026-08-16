"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Trash2, Upload } from "lucide-react";
import type { ProductImage } from "@prisma/client";

type MediaUploaderProps = {
  productId: string | null;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
};

export default function MediaUploader({ productId, images, onImagesChange }: MediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!productId) {
    return (
      <div className="rounded-lg border border-dashed border-gold/25 p-6 text-center text-sm text-cream-dim">
        احفظ المنتج أولاً حتى تتمكن من إضافة الصور
      </div>
    );
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/admin/products/${productId}/images`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "فشل رفع الصورة");
        return;
      }

      onImagesChange([...images, data.image]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    if (!window.confirm("هل تريد حذف هذه الصورة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    await fetch(`/api/admin/products/${productId}/images/${imageId}`, { method: "DELETE" });
    onImagesChange(images.filter((img) => img.id !== imageId));
  }

  const sortedImages = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  async function handleMove(index: number, delta: -1 | 1) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= sortedImages.length) return;

    const current = sortedImages[index];
    const target = sortedImages[targetIndex];

    const reordered = [...sortedImages];
    reordered[index] = { ...target, sortOrder: current.sortOrder };
    reordered[targetIndex] = { ...current, sortOrder: target.sortOrder };
    onImagesChange(reordered);

    await Promise.all([
      fetch(`/api/admin/products/${productId}/images/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: target.sortOrder }),
      }),
      fetch(`/api/admin/products/${productId}/images/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: current.sortOrder }),
      }),
    ]);
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        {sortedImages.map((image, index) => (
          <div key={image.id} className="relative aspect-square rounded-lg overflow-hidden gold-border group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.altText ?? ""} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(image.id)}
              className="absolute top-1 start-1 bg-black/70 text-red-400 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="حذف الصورة"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="absolute bottom-1 inset-x-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => handleMove(index, -1)}
                disabled={index === 0}
                className="bg-black/70 text-cream p-1.5 rounded-lg disabled:opacity-60"
                aria-label="تحريك للخلف"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleMove(index, 1)}
                disabled={index === sortedImages.length - 1}
                className="bg-black/70 text-cream p-1.5 rounded-lg disabled:opacity-60"
                aria-label="تحريك للأمام"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="aspect-square rounded-lg border border-dashed border-gold/25 flex items-center justify-center text-cream-dim hover:text-gold hover:border-gold transition-colors"
        >
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
