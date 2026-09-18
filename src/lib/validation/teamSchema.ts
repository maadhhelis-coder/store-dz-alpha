import { z } from "zod";
import { CRM_ROLES } from "@/lib/rbac/permissions";

// مخططات إدارة الفريق (P8). الدور المقبول من CRM_ROLES فقط (staff القديم غير قابل للإسناد).
const role = z.enum(CRM_ROLES);

export const teamListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: role.optional(),
  active: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const teamInviteSchema = z.object({
  email: z.string().trim().email().max(200),
  fullName: z.string().trim().min(1).max(120).nullable().optional(),
  role,
});

export const teamUpdateSchema = z
  .object({
    role: role.optional(),
    isActive: z.boolean().optional(),
    fullName: z.string().trim().min(1).max(120).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined || v.fullName !== undefined, { message: "لا تغيير مطلوب" });

export const rolePermissionPatchSchema = z.object({
  role,
  permission: z.string().trim().min(1).max(100),
  granted: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const exportQuerySchema = z.object({
  entity: z.string().trim().min(1).max(40),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.string().trim().max(60).optional(),
});
