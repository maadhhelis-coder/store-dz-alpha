import { prisma } from "@/server/db/prisma";
import {
  CRM_SETTING_KEYS,
  isCrmSettingKey,
  parseCrmSettingValue,
  type CrmSettingKey,
} from "@/lib/validation/crmSettingsSchema";
import { writeAudit } from "@/server/services/auditService";

// خدمة إعدادات CRM — قراءة zod-validated مع defaults، وكتابة موثّقة (audit).
// الصلاحيات تُفحص على مستوى الـroute (settings.manage) — الخدمة تحفظ الممثل.

export class UnknownCrmSettingKeyError extends Error {
  constructor(key: string) {
    super(`مفتاح إعداد CRM غير معروف: ${key}`);
    this.name = "UnknownCrmSettingKeyError";
  }
}

/** قراءة إعداد واحد بقيمه الافتراضية عند الغياب. */
export async function getCrmSetting<K extends CrmSettingKey>(key: K): Promise<ReturnType<typeof parseCrmSettingValue<K>>> {
  const row = await prisma.crmSetting.findUnique({ where: { key } });
  return parseCrmSettingValue(key, row?.value ?? undefined);
}

/** قراءة كل الإعدادات دفعة واحدة (صفحات الإعدادات/المهام الدورية). */
export async function getAllCrmSettings(): Promise<Record<CrmSettingKey, unknown>> {
  const rows = await prisma.crmSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<CrmSettingKey, unknown>;
  for (const key of CRM_SETTING_KEYS) {
    out[key] = parseCrmSettingValue(key, byKey.get(key) ?? undefined);
  }
  return out;
}

/** كتابة إعداد — ترفض المفاتيح غير المعروفة (version-tolerant بالقراءة فقط)
 * وتوثّق قبل/بعد في السجل التدقيقي. */
export async function setCrmSetting<K extends CrmSettingKey>(params: {
  key: K;
  value: unknown;
  actorId: string;
  reason?: string;
  correlationId?: string | null;
}): Promise<void> {
  if (!isCrmSettingKey(params.key)) throw new UnknownCrmSettingKeyError(params.key);

  const before = await prisma.crmSetting.findUnique({ where: { key: params.key } });
  const after = parseCrmSettingValue(params.key, params.value);

  await prisma.crmSetting.upsert({
    where: { key: params.key },
    create: { key: params.key, value: after as object, updatedById: params.actorId },
    update: { value: after as object, updatedById: params.actorId },
  });

  await writeAudit({
    actorType: "admin",
    actorId: params.actorId,
    action: "settings",
    entityType: "crm_setting",
    entityId: params.key,
    before: before?.value ?? null,
    after,
    reason: params.reason ?? null,
    correlationId: params.correlationId ?? null,
  });
}
