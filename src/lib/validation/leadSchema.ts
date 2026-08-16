import { z } from "zod";

// كل الحقول اختيارية عمدًا: الهدف التقاط أي معلومة توفرت قبل ما الزبون يسيب الاستمارة،
// حتى لو ما كملش تعبئتها بالكامل. نطلب فقط وجود وسيلة تواصل واحدة على الأقل (هاتف).
export const leadCreateSchema = z
  .object({
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^0[5-7][0-9]{8}$/)
      .optional(),
    wilayaCode: z.number().int().min(1).max(58).optional(),
    commune: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    productSlug: z.string().trim().max(200).optional(),
    productName: z.string().trim().max(200).optional(),
  })
  .refine((data) => Boolean(data.phone || data.firstName || data.lastName), {
    message: "لا توجد معلومات كافية لحفظ العميل المحتمل",
  });

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const leadUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "converted", "ignored"]),
  notes: z.string().max(2000).optional(),
});
