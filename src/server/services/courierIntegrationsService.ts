import * as courierIntegrationsRepository from "@/server/repositories/courierIntegrationsRepository";
import type { CourierBulkUpdateInput } from "@/lib/validation/courierSchema";

// لا تُرسل مفاتيح/توكنات API الفعلية للمتصفح أبدًا (كانت تُرسل نصًا صريحًا لتعبئة نموذج
// التعديل) — فقط إشارة أنها محفوظة. هذا يمنع كشفها عبر الشبكة، ويمنع أيضًا مشكلة إعادة
// تشفير قيمة مشفَّرة مسبقًا لو أُعيد إرسالها للخادم بلا تغيير.
export async function listCourierIntegrations() {
  const rows = await courierIntegrationsRepository.listCourierIntegrations();
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    isEnabled: r.isEnabled,
    hasApiKey: !!r.apiKey,
    hasApiToken: !!r.apiToken,
  }));
}

export function updateCourierIntegrations(input: CourierBulkUpdateInput) {
  return courierIntegrationsRepository.bulkUpdateCourierIntegrations(input.couriers);
}
