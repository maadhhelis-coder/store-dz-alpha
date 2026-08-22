import { findCourierIntegrationByProvider } from "@/server/repositories/courierIntegrationsRepository";
import { getCommuneLatinName, getCommuneArabicName } from "@/data/communes";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";
import { prisma } from "@/server/db/prisma";

const DHD_BASE_URL = "https://platform.dhd-dz.com/api/v1";

export class DhdNotConfiguredError extends Error {
  constructor() {
    super("لم يتم ربط حساب DHD بعد — أدخل الرمز في إعدادات شركات التوصيل");
    this.name = "DhdNotConfiguredError";
  }
}

export type DhdOrderStatus = {
  tracking: string;
  status: string;
};

// يجلب حالة الشحن الحقيقية من DHD (عبر منصة EcoTrack) لرقم تتبع واحد. يُعيد الحالة
// الخام كما ترجعها DHD (بدون ترجمة) لتجنّب عرض ترجمة خاطئة لحالة غير موثّقة بالكامل.
export async function fetchDhdOrderStatus(trackingId: string): Promise<DhdOrderStatus> {
  if (isE2ETestRun()) {
    logE2ESkip(`dhd fetchDhdOrderStatus for ${trackingId}`);
    return { tracking: trackingId, status: "e2e-mock-status" };
  }
  const integration = await findCourierIntegrationByProvider("DHD");
  if (!integration?.isEnabled || !integration.apiToken) {
    throw new DhdNotConfiguredError();
  }
  const token = decryptSecret(integration.apiToken);

  // اكتُشف فعليًا (اختبار مباشر بمفتاح حقيقي ورقم تتبّع حقيقي فالإنتاج): صيغة المصفوفة
  // "trackings[]" التي كانت مُستعمَلة هنا تُسقِط خادم DHD دائمًا بخطأ 500 عام، بغض النظر
  // عن صحة رقم التتبّع. الصيغة الصحيحة الوحيدة التي أعادت 200 فعليًا هي معامل نصّي بسيط
  // "trackings" (بلا أقواس)، وليس مصفوفة — راجع أيضًا محاولات أخرى فُحصت وفشلت: status[]،
  // POST (405 — GET فقط مدعوم)، tracking= المفرد (422 "Aucun tracking soumis").
  const params = new URLSearchParams({ status: "all", trackings: trackingId });

  const res = await fetch(`${DHD_BASE_URL}/get/orders/status?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`تعذر جلب حالة الشحن من DHD (رمز الخطأ ${res.status})`);
  }

  const data = await res.json();
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.data ?? [data]);

  // مصفوفة فارغة (`{"data":[]}`) رد حقيقي وشائع من DHD نفسها — يعني ببساطة أنها لم
  // تُسجّل بعد أي بيانات حالة لرقم التتبع هذا (شحنة جديدة لم يلتقطها المندوب بعد
  // عادةً)، وليس عطلًا فطلبنا. رسالة واضحة للمسؤول (تُعرَض مباشرة فواجهة الإدارة)
  // بدل تفريغ رد JSON خام غير مفهوم.
  if (rows.length === 0) {
    return { tracking: trackingId, status: "لم تُسجَّل حالة الشحنة بعد عند DHD" };
  }

  const row =
    rows.find((r) => r.tracking === trackingId || r.order_tracking === trackingId || r.code === trackingId) ??
    rows[0];

  // شكل استجابة النجاح غير مؤكد 100% (لم نختبره بعد برقم تتبع حقيقي) — نحاول عدة
  // أسماء حقول محتملة، وإن فشلت كلها نُعيد الرد الخام بدل رمي خطأ مضلّل.
  const status =
    (row?.status as string | undefined) ??
    (row?.order_status as string | undefined) ??
    (row?.etat as string | undefined);

  if (!status) {
    return { tracking: trackingId, status: `شكل رد غير متوقّع من DHD: ${JSON.stringify(data).slice(0, 200)}` };
  }

  return { tracking: trackingId, status };
}

// حالة "لم تُسجَّل بعد" مؤقتة بطبيعتها (تعكس أن DHD لم تُحدِّث الشحنة بعد، وليس أن
// حالتنا المخزَّنة خاطئة) — إن كانت لدينا بالفعل حالة حقيقية سابقة مختلفة، لا نستبدلها
// بهذه الرسالة المؤقتة عند مزامنة لاحقة تُرجع نفس الرد الفارغ مجددًا (يمنع تراجع
// المعلومة المعروضة للمسؤول من حالة حقيقية إلى "غير معروفة" بسبب رد عابر فارغ).
const PENDING_DHD_STATUS = "لم تُسجَّل حالة الشحنة بعد عند DHD";

// منطق مشترك بين المزامنة الدورية (cron) واستقبال الـwebhook — يحدّث courierStatus
// فقط إن تغيّرت القيمة فعليًا وبدون التراجع لحالة "لم تُسجَّل بعد" المؤقتة إن كانت لدينا
// أصلًا حالة حقيقية سابقة (نفس حماية syncAllDhdOrderStatuses أدناه).
async function applyDhdCourierStatusUpdate(
  order: { id: string; courierStatus: string | null },
  newStatus: string,
): Promise<boolean> {
  const isRegressionToPending =
    newStatus === PENDING_DHD_STATUS && !!order.courierStatus && order.courierStatus !== PENDING_DHD_STATUS;
  if (newStatus === order.courierStatus || isRegressionToPending) return false;
  await prisma.order.update({ where: { id: order.id }, data: { courierStatus: newStatus } });
  return true;
}

export type DhdStatusSyncResult = {
  checked: number;
  updated: number;
  errors: { orderNumber: string; error: string }[];
};

// يمرّ على كل الطلبات النشطة (لم تصل لحالة نهائية بعد) التي أُرسلت فعليًا لـDHD ولديها رقم
// تتبّع، ويحدّث حقل courierStatus (الحقل المعلوماتي الخام فقط) تلقائيًا لكل واحدة. **لا
// يُغيّر حالة الطلب نفسها (status) تلقائيًا عمدًا** — نفس مبدأ fetchDhdOrderStatus أعلاه
// (لا نترجم/نخمّن حالة DHD الخام لحالة نهائية فمتجرنا بلا مفردات DHD الحقيقية مؤكَّدة أولًا)؛
// هذا يُبقي courierStatus محدَّثًا للمسؤول ليقرر بنفسه، بدل تغيير تلقائي قد يكون خاطئًا على
// طلب حقيقي. يُشغَّل عبر cron (راجع vercel.json) وأيضًا يدويًا إن لزم.
export async function syncAllDhdOrderStatuses(): Promise<DhdStatusSyncResult> {
  const orders = await prisma.order.findMany({
    where: {
      courierProvider: "DHD",
      courierTrackingId: { not: null },
      status: { notIn: ["delivered", "returned", "cancelled"] },
    },
    select: { id: true, orderNumber: true, courierTrackingId: true, courierStatus: true },
  });

  const errors: { orderNumber: string; error: string }[] = [];
  let updated = 0;

  for (const order of orders) {
    try {
      const result = await fetchDhdOrderStatus(order.courierTrackingId!);
      if (await applyDhdCourierStatusUpdate(order, result.status)) {
        updated += 1;
      }
    } catch (error) {
      errors.push({ orderNumber: order.orderNumber, error: error instanceof Error ? error.message : "خطأ غير معروف" });
    }
  }

  return { checked: orders.length, updated, errors };
}

export type DhdWebhookResult =
  | { outcome: "invalid_payload" }
  | { outcome: "order_not_found"; tracking: string; reference: string | null }
  | { outcome: "updated" | "unchanged"; tracking: string; orderNumber: string; status: string };

// شكل الحمولة والتوقيع موثَّقان رسميًا الآن (صفحة "Lire la documentation" فلوحة DHD،
// منصة EcoTrack) — event بصيغة "order.{action}"، وdata.state.{id,code,title,title_en}،
// وdata.tracking/data.reference. نستعمل title (الاسم الفرنسي المقروء) كحقل courierStatus
// المعلوماتي، نفس ما كان يُعرَض سابقًا كنص خام للمسؤول.
//
// المطابقة: أولًا بـcourierTrackingId (data.tracking، مصدرها نفس رقم التتبّع الذي أعادته
// DHD عند إنشاء الشحنة). احتياطيًا بـorderNumber (data.reference) — نُرسله نحن كـ"reference"
// عند إنشاء كل شحنة (راجع createDhdShipment)، فيُفترض تطابقه دائمًا مع courierTrackingId
// المحفوظ أصلًا؛ يبقى احتياطًا فقط لحالة نادرة (مثلاً حُفظ tracking خاطئ يدويًا).
//
// لا حاجة لقفل idempotency منفصل رغم توصية التوثيق (retries قد تُعيد نفس الحدث): التحديث
// نفسه idempotent فعليًا — نفس القيمة الواردة مرتين تُعطي "unchanged" فكلتا المرتين
// (applyDhdCourierStatusUpdate)، بلا أي أثر جانبي إضافي لتكرار نفس الحدث.
export async function processDhdWebhookPayload(payload: unknown): Promise<DhdWebhookResult> {
  const body = payload as {
    data?: {
      tracking?: string;
      reference?: string;
      state?: { title?: string };
    };
  } | null;

  const tracking = body?.data?.tracking;
  const status = body?.data?.state?.title;
  if (!tracking || !status) {
    console.error("dhd webhook: unexpected payload shape", JSON.stringify(payload).slice(0, 500));
    return { outcome: "invalid_payload" };
  }
  const reference = body?.data?.reference ?? null;

  const order =
    (await prisma.order.findFirst({
      where: { courierProvider: "DHD", courierTrackingId: tracking },
      select: { id: true, orderNumber: true, courierStatus: true },
    })) ??
    (reference
      ? await prisma.order.findFirst({
          where: { courierProvider: "DHD", orderNumber: reference },
          select: { id: true, orderNumber: true, courierStatus: true },
        })
      : null);

  if (!order) {
    console.error("dhd webhook: no matching order for tracking/reference", tracking, reference);
    return { outcome: "order_not_found", tracking, reference };
  }

  const updated = await applyDhdCourierStatusUpdate(order, status);
  return { outcome: updated ? "updated" : "unchanged", tracking, orderNumber: order.orderNumber, status };
}

export class DhdValidationError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DhdValidationError";
  }
}

export type DhdCommune = {
  name: string;
  hasStopDesk: boolean;
};

// يجلب قائمة البلديات الحقيقية المقبولة عند DHD لولاية معيّنة — أسماؤها بالحروف
// اللاتينية (مثال: "El Kseur")، وليست مطابقة بالضرورة للاسم العربي المخزّن في طلباتنا.
export async function getDhdCommunes(wilayaCode: number): Promise<DhdCommune[]> {
  if (isE2ETestRun()) {
    logE2ESkip(`dhd getDhdCommunes for wilaya ${wilayaCode}`);
    return [{ name: "E2E Mock Commune", hasStopDesk: true }];
  }
  const integration = await findCourierIntegrationByProvider("DHD");
  if (!integration?.isEnabled || !integration.apiToken) {
    throw new DhdNotConfiguredError();
  }
  const token = decryptSecret(integration.apiToken);

  const res = await fetch(`${DHD_BASE_URL}/get/communes?wilaya_id=${wilayaCode}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`تعذر جلب قائمة البلديات من DHD (رمز الخطأ ${res.status})`);
  }

  const data: { nom?: string; has_stop_desk?: number }[] = await res.json();
  return data
    .filter((c) => c.nom)
    .map((c) => ({ name: c.nom!, hasStopDesk: c.has_stop_desk === 1 }));
}

function normalizeCommuneName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// يطابق بلديتنا العربية مع أقرب بلدية عند DHD اعتمادًا على الاسم اللاتيني المرادف المخزّن
// في بيانات بلديات الجزائر لدينا (src/data/communes.ts) — نفس المصدر أعطى مطابقة حرفية
// كاملة عند اختبارها فعليًا ("القصر" -> "El Kseur").
function findBestDhdCommuneMatch(wilayaCode: number, arabicCommune: string, options: DhdCommune[]): DhdCommune | null {
  const ourLatin = getCommuneLatinName(wilayaCode, arabicCommune);
  if (!ourLatin || options.length === 0) return null;

  const target = normalizeCommuneName(ourLatin);
  let best: { commune: DhdCommune; dist: number } | null = null;
  for (const opt of options) {
    const candidate = normalizeCommuneName(opt.name);
    if (candidate === target) return opt;
    const dist = levenshtein(target, candidate);
    if (!best || dist < best.dist) best = { commune: opt, dist };
  }

  const threshold = Math.max(2, Math.ceil(target.length * 0.3));
  return best && best.dist <= threshold ? best.commune : null;
}

// يقترح اسم البلدية الأرجح عند DHD — الاقتراح يبقى قابلًا للتعديل من طرف المسؤول قبل
// الحفظ، فلا يُعتمد عليه وحده دون مراجعة بشرية.
export function suggestDhdCommune(wilayaCode: number, arabicCommune: string, options: DhdCommune[]): string | null {
  return findBestDhdCommuneMatch(wilayaCode, arabicCommune, options)?.name ?? null;
}

export type StopDeskCheckResult = {
  available: boolean;
  matchedCommune: string | null;
  alternateOfficeCommune: string | null;
};

// يتحقق هل يوجد مكتب استلام (stop desk) حقيقي عند DHD لبلدية معيّنة — مصدر المعلومة هو
// نفس بيانات DHD الحية (حقل has_stop_desk لكل بلدية)، وليس تخمينًا. عند عدم التأكد من
// المطابقة، نُعيد "غير متوفر" احترازيًا بدل الوعد بمكتب قد لا يكون موجودًا فعلًا. إذا لم
// يتوفر مكتب في بلدية الزبون، نبحث عن أقرب بلدية في نفس الولاية فيها مكتب فعلي لنقترحها
// عليه بالاسم العربي المألوف بدل اسم لاتيني غريب.
export async function checkStopDeskAvailability(wilayaCode: number, arabicCommune: string): Promise<StopDeskCheckResult> {
  const dhdCommunes = await getDhdCommunes(wilayaCode);
  const match = findBestDhdCommuneMatch(wilayaCode, arabicCommune, dhdCommunes);
  const available = match?.hasStopDesk ?? false;

  let alternateOfficeCommune: string | null = null;
  if (!available) {
    const anyOfficeCommune = dhdCommunes.find((c) => c.hasStopDesk);
    if (anyOfficeCommune) {
      alternateOfficeCommune = getCommuneArabicName(wilayaCode, anyOfficeCommune.name) ?? anyOfficeCommune.name;
    }
  }

  return { available, matchedCommune: match?.name ?? null, alternateOfficeCommune };
}

export type CreateDhdShipmentInput = {
  fullName: string;
  phone: string;
  address: string;
  wilayaCode: number;
  commune: string;
  amountDzd: number;
  productLabel: string;
  deliveryOption: "office" | "home";
  reference: string;
  note?: string;
};

export type CreateDhdShipmentResult = {
  tracking: string;
  raw: unknown;
};

// ينشئ شحنة حقيقية عند DHD (Bearer token المحفوظ) — الحقول المطلوبة (nom_client, telephone,
// adresse, code_wilaya, commune, montant, type) مؤكّدة مباشرة من رسائل التحقق الحية لـ DHD.
// باقي الحقول (produit, remarque, stop_desk, reference) مبنية على توثيق طرف ثالث لنفس منصة
// EcoTrack، غير مؤكدة 100% — أول استخدام حقيقي يحتاج للمراجعة.
export async function createDhdShipment(input: CreateDhdShipmentInput): Promise<CreateDhdShipmentResult> {
  if (isE2ETestRun()) {
    logE2ESkip(`dhd createDhdShipment for reference ${input.reference}`);
    return { tracking: `E2E-MOCK-${input.reference}`, raw: { mocked: true } };
  }
  const integration = await findCourierIntegrationByProvider("DHD");
  if (!integration?.isEnabled || !integration.apiToken) {
    throw new DhdNotConfiguredError();
  }
  const token = decryptSecret(integration.apiToken);

  const payload = {
    nom_client: input.fullName,
    telephone: input.phone,
    adresse: input.address,
    code_wilaya: input.wilayaCode,
    commune: input.commune,
    montant: input.amountDzd,
    type: 1, // 1 = livraison (توصيل عادي)، 2 = échange (استبدال) — غير مستخدم حاليًا
    produit: input.productLabel.slice(0, 255),
    stop_desk: input.deliveryOption === "office" ? 1 : 0,
    reference: input.reference,
    ...(input.note ? { remarque: input.note } : {}),
  };

  const res = await fetch(`${DHD_BASE_URL}/create/order`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  // DHD يُرجع أخطاء التحقق بأكثر من شكل: 422 بخريطة {errors:{حقل:[رسائل]}}، أو 200/400
  // بـ {success:false, message:"..."} أو {results:{success:false, error:"..."}} — نتحقق
  // من الاحتمالات كلها قبل افتراض النجاح.
  if (res.status === 422 && data?.errors) {
    throw new DhdValidationError(Object.values(data.errors).flat().join(" — "), data.errors);
  }
  const businessError = data?.message ?? data?.results?.error ?? data?.error;
  if (data?.success === false || data?.results?.success === false || (businessError && !res.ok)) {
    throw new DhdValidationError(String(businessError ?? "بيانات الشحنة غير مقبولة عند DHD"));
  }
  if (!res.ok) {
    throw new Error(`تعذر إنشاء الشحنة عند DHD (رمز الخطأ ${res.status})`);
  }

  const tracking =
    data?.tracking ?? data?.results?.tracking ?? data?.data?.tracking ?? data?.code ?? data?.order_tracking;

  if (!tracking) {
    throw new Error(`تم إرسال الطلب لكن تعذّر التعرف على رقم التتبع في رد DHD: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return { tracking: String(tracking), raw: data };
}
