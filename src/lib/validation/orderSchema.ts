import { z } from "zod";

export const orderCreateSchema = z.object({
  firstName: z.string().trim().min(1, "الاسم مطلوب").max(80),
  lastName: z.string().trim().min(1, "اللقب مطلوب").max(80),
  phone: z.string().trim().regex(/^0[5-7][0-9]{8}$/, "رقم هاتف غير صحيح"),
  wilayaCode: z.number().int().min(1).max(58),
  commune: z.string().trim().min(1, "البلدية مطلوبة").max(120),
  address: z.string().trim().max(300).optional(),
  deliveryOption: z.enum(["office", "home"]),
  productSlug: z.string().trim().min(1),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(20),
  offerId: z.string().uuid().optional(),
  couponCode: z.string().trim().min(2).max(40).optional(),
  source: z.enum(["website", "manual", "whatsapp"]).optional(),
  platform: z.enum(["facebook", "instagram", "tiktok"]).optional(),
  creativeName: z.string().trim().max(80).optional(),
  visitorId: z.string().trim().max(100).optional(),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const orderStatusSchema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "no_answer",
    "callback",
    "voicemail",
    "fake",
    "wrong_number",
    "duplicate",
    "cancelled",
    "shipped",
    "delivered",
  ]),
  notes: z.string().max(2000).optional(),
});

export const orderBulkStatusSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(200),
  status: orderStatusSchema.shape.status,
});

export const orderUpdateSchema = z.object({
  customerFirstName: z.string().trim().min(1).max(80).optional(),
  customerLastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().regex(/^0[5-7][0-9]{8}$/).optional(),
  commune: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().min(1).max(300).optional(),
  notes: z.string().max(2000).optional(),
  courierProvider: z.string().trim().max(60).optional().nullable(),
  courierTrackingId: z.string().trim().max(80).optional().nullable(),
  // تاريخ/وقت ISO لموعد إعادة الاتصال التالي — null لإلغاء الجدولة الحالية.
  nextCallAt: z.string().trim().datetime().optional().nullable(),
});
