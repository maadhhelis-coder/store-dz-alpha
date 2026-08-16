import { z } from "zod";
import { API_KEY_SCOPES } from "@/lib/apiKeyScopes";

export const apiKeyCreateSchema = z.object({
  label: z.string().trim().min(1, "الاسم مطلوب").max(100),
  // مصفوفة فارغة (أو غير مُرسَلة) = وصول كامل لكل النطاقات.
  scopes: z.array(z.enum(API_KEY_SCOPES)).max(API_KEY_SCOPES.length).default([]),
  // تاريخ ISO اختياري — null/غير مُرسَل = بلا انتهاء صلاحية.
  expiresAt: z.string().trim().datetime().optional().nullable(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
