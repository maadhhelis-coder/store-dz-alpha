import { z } from "zod";

export const accountUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  newPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").max(72).optional(),
});

export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
