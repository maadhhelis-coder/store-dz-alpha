import { z } from "zod";
import { CustomerStatus, RiskLevel, SegmentKind } from "@prisma/client";
import { CUSTOMERS_PAGE_SIZE_DEFAULT, CUSTOMERS_PAGE_SIZE_MAX } from "@/server/modules/customers/customerQueryService";

// معاملات قائمة العملاء — الحجم محدود بسقف صريح (لا صفحة بلا حد)، والفلاتر
// مقيّدة بتعدادات Prisma نفسها فلا تمر قيمة لا تمثّلها البيانات الحالية.

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(CUSTOMERS_PAGE_SIZE_MAX)
    .default(CUSTOMERS_PAGE_SIZE_DEFAULT),
  search: z.string().trim().max(100).optional(),
  riskLevel: z.enum(RiskLevel).optional(),
  status: z.enum(CustomerStatus).optional(),
  segment: z.enum(SegmentKind).optional(),
});

export const customer360QuerySchema = z.object({
  timelineCursor: z.string().max(200).optional(),
});
