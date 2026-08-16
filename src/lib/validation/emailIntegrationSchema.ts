import { z } from "zod";
import { EMAIL_PROVIDERS } from "@/server/repositories/emailIntegrationsRepository";

export const emailProviderParamSchema = z.enum(EMAIL_PROVIDERS);

export const emailIntegrationCredentialsSchema = z.object({
  clientId: z.string().trim().min(1).nullable(),
  // undefined = اتركه كما هو محفوظًا (السر لا يُعاد إرساله للمتصفح بعد الحفظ الأول).
  clientSecret: z.string().trim().min(1).nullable().optional(),
});

export type EmailIntegrationCredentialsInput = z.infer<typeof emailIntegrationCredentialsSchema>;
