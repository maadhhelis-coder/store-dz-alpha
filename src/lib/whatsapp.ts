import { SITE_NAME, WHATSAPP_NUMBER } from "@/data/site";
import type { Category } from "@/data/categories";

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function buildGenericMessage(): string {
  return `مرحبا ${SITE_NAME}، أريد الاستفسار عن منتجاتكم.`;
}

export function buildCategoryMessage(category: Category): string {
  return `مرحبا، أريد الاطلاع على تشكيلة "${category.name}" المتوفرة عندكم.`;
}

export function buildArticleMessage(articleTitle: string): string {
  return `مرحبا، قرأت مقال "${articleTitle}" في مدونتكم وأريد الاستفسار أكثر.`;
}
