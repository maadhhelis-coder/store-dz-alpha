import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور قصيرة جدًا"),
});

export type LoginInput = z.infer<typeof loginSchema>;
