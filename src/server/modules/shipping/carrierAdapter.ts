import {
  createDhdShipment,
  fetchDhdOrderStatus,
  getDhdCommunes,
  suggestDhdCommune,
  DhdNotConfiguredError,
  DhdValidationError,
} from "@/server/services/dhdService";
import {
  findCourierCommuneMapping,
  upsertCourierCommuneMapping,
} from "@/server/repositories/courierCommuneMappingRepository";

// طبقة الناقل — بقية النظام لا تعرف DHD إطلاقًا: تعرف provider نصيًا وعقدًا
// من دالتين. كل نداء خارجي يمر من هنا، وكل نداء خارجي يقع **خارج أي معاملة**.

export type CarrierDispatchInput = {
  /** المرجع الثابت عند المزود = orderNumber. لا يتغيّر عبر إعادة المحاولات. */
  reference: string;
  fullName: string;
  phone: string;
  address: string;
  wilayaCode: number;
  commune: string;
  amountDzd: number;
  productLabel: string;
  deliveryOption: "office" | "home";
  note?: string;
};

export type CarrierDispatchResult = { trackingNumber: string; raw: unknown };

export type CarrierAdapter = {
  readonly provider: string;
  dispatch(input: CarrierDispatchInput): Promise<CarrierDispatchResult>;
  /** rawStatus = null يعني "لا بيانات عند الناقل بعد" — ليست حالة تُترجَم. */
  fetchStatus(trackingNumber: string): Promise<{ rawStatus: string | null }>;
};

/** خطأ لا تُصلحه إعادة المحاولة (بيانات مرفوضة، تكامل غير مُعدّ) — يُرسَل
 * للـdead-letter فورًا بدل استهلاك ثلاث محاولات على نفس الرفض. */
export class CarrierPermanentError extends Error {
  readonly code = "CARRIER_PERMANENT";
  constructor(message: string) {
    super(message);
    this.name = "CarrierPermanentError";
  }
}

export function isPermanentCarrierError(error: unknown): boolean {
  return (
    error instanceof CarrierPermanentError ||
    error instanceof DhdValidationError ||
    error instanceof DhdNotConfiguredError
  );
}

// ===================== DHD =====================

const dhdCarrierAdapter: CarrierAdapter = {
  provider: "DHD",

  async dispatch(input) {
    // DHD لا تقبل إلا اسم البلدية اللاتيني من قائمتها («Commune mal écrite, ou désactivée» —
    // اكتُشف فعليًا على SD-000737 ببلدية «بني كسيلة»). الترتيب: تصحيح محفوظ سابقًا لنفس
    // (ولاية، بلدية) ← مطابقة تلقائية من قائمة DHD الحية عبر الاسم اللاتيني في بياناتنا
    // (نفس المطابقة التي يعتمدها الوكيل لقرار المكتب) ← رفض نهائي واضح يطلب اختيارًا يدويًا.
    const saved = await findCourierCommuneMapping("DHD", input.wilayaCode, input.commune);
    const communeToSend =
      saved?.courierCommuneName ??
      suggestDhdCommune(input.wilayaCode, input.commune, await getDhdCommunes(input.wilayaCode));
    if (!communeToSend) {
      throw new CarrierPermanentError(
        `بلدية «${input.commune}» غير معروفة عند DHD — اختر البلدية المطابقة من صفحة الطلب وأعد الإرسال`,
      );
    }

    const result = await createDhdShipment({ ...input, commune: communeToSend });

    if (communeToSend !== input.commune) {
      await upsertCourierCommuneMapping("DHD", input.wilayaCode, input.commune, communeToSend);
    }
    return { trackingNumber: result.tracking, raw: result.raw };
  },

  async fetchStatus(trackingNumber) {
    const result = await fetchDhdOrderStatus(trackingNumber);
    return { rawStatus: result.status };
  },
};

const ADAPTERS: Record<string, CarrierAdapter> = { DHD: dhdCarrierAdapter };

/** الناقل الافتراضي — المزود الوحيد المُعدّ حاليًا. */
export const DEFAULT_CARRIER = "DHD";

export function getCarrierAdapter(provider: string): CarrierAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new CarrierPermanentError(`ناقل غير مدعوم: ${provider}`);
  return adapter;
}
