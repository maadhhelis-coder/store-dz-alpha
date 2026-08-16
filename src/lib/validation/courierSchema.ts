import { z } from "zod";

export const courierBulkUpdateSchema = z.object({
  couriers: z
    .array(
      z.object({
        id: z.string().uuid(),
        isEnabled: z.boolean(),
        // undefined = اتركه كما هو (لم يُعدَّل فالنموذج)، null = امسحه، نص = عيّن قيمة جديدة.
        apiKey: z.string().trim().max(300).nullable().optional(),
        apiToken: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type CourierBulkUpdateInput = z.infer<typeof courierBulkUpdateSchema>;
