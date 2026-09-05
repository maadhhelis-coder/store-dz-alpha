import { prisma } from "@/server/db/prisma";
import { normalizeAlgerianPhone } from "@/lib/phone";
import type { CustomerMatchSource, Prisma } from "@prisma/client";

// هوية العملاء — المطابقة الحتمية بالهاتف فقط داخل معاملة إنشاء الطلب.
// القواعد المقفلة معماريًا:
// - لا backfill تاريخي إطلاقًا: العملاء يبدأون من الطلبات الإنتاجية الجديدة.
// - طلبات isTest لا تنشئ عملاء ولا تُربط بهم (قيد قاعدة بيانات أيضًا).
// - المطابقة عبر customer_phones (فريد عالميًا)؛ لا ترقية تلقائية لهاتف بديل.
// - سباق الإنشاء: unique phone + P2002 → إعادة قراءة وربط (لا عميل مكرر أبدًا).

export type CustomerMatchResult = {
  customerId: string;
  matchSource: CustomerMatchSource;
  matchedPhoneId: string | null;
};

export type CustomerLinkInput = {
  phone: string;
  firstName: string;
  lastName: string;
  wilayaCode?: number | null;
  commune?: string | null;
  address?: string | null;
};

export class PhoneIdentityError extends Error {
  constructor() {
    super("رقم هاتف غير صالح");
    this.name = "PhoneIdentityError";
  }
}

/** مطابقة/إنشاء العميل داخل معاملة إنشاء الطلب — تُرجع بيانات الربط الثابتة
 * (customerMatchSource + matchedPhoneId) التي تُخزَّن كأدلة إنشاء غير قابلة للتعديل.
 *
 * المنطق الحتمي:
 * 1. طبّع الهاتف (فشل → PhoneIdentityError — الطلب نفسه يفشل 400 كما اليوم).
 * 2. ابحث في customer_phones: وجد → اربط (primary أو alternative حسب النوع).
 * 3. لم تجد → أنشئ عميلًا + هاتفًا أساسيًا في نفس المعاملة.
 * 4. P2002 (سباق طلبين بنفس الهاتف) → أعد القراءة واربط — لا تكرار أبدًا.
 */
export async function matchOrCreateCustomerInTx(
  tx: Prisma.TransactionClient,
  input: CustomerLinkInput,
): Promise<CustomerMatchResult> {
  const normalized = normalizeAlgerianPhone(input.phone);
  if (!normalized) throw new PhoneIdentityError();

  // 1) المطابقة عبر جدول الهويات الرسمي
  const existingPhone = await tx.customerPhone.findUnique({
    where: { phoneNormalized: normalized },
    select: { id: true, customerId: true, phoneType: true },
  });

  if (existingPhone) {
    const matchSource: CustomerMatchSource =
      existingPhone.phoneType === "primary" ? "primary_phone" : "alternative_phone";
    // أدلة الإنشاء ثابتة: الهاتف البديل لا يُرقّى لأساسي تلقائيًا أبدًا
    // طابع آخر طلب يتحدث مع كل ربط (أول طلب لا يُمسّ — حقيقة تاريخية)
    await tx.customer.update({
      where: { id: existingPhone.customerId },
      data: { lastOrderAt: new Date() },
    });
    return { customerId: existingPhone.customerId, matchSource, matchedPhoneId: existingPhone.id };
  }

  // 2) عميل جديد — نفس المعاملة (لا يتيم ولا نصف-ربط تحت أي فشل)
  try {
    const now = new Date();
    const customer = await tx.customer.create({
      data: {
        fullName: buildFullName(input.firstName, input.lastName),
        primaryPhone: normalized,
        firstOrderAt: now,
        lastOrderAt: now,
        wilayaCode: input.wilayaCode ?? undefined,
        commune: input.commune ?? undefined,
        address: input.address ?? undefined,
        phones: {
          create: { phoneNormalized: normalized, phoneType: "primary", source: "order" },
        },
      },
      select: { id: true },
    });
    return { customerId: customer.id, matchSource: "new_customer", matchedPhoneId: null };
  } catch (error) {
    // سباق متوقع ومحدد: طلبان متزامنان لنفس الهاتف الجديد — الـunique على
    // phone_normalized يفوز أحدهما؛ الخاسر يعيد القراءة ويرتبط بالفائز.
    if (isUniqueViolation(error)) {
      const winner = await tx.customerPhone.findUnique({
        where: { phoneNormalized: normalized },
        select: { id: true, customerId: true, phoneType: true },
      });
      if (winner) {
        return {
          customerId: winner.customerId,
          matchSource: winner.phoneType === "primary" ? "primary_phone" : "alternative_phone",
          matchedPhoneId: winner.id,
        };
      }
    }
    throw error;
  }
}

function buildFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/** تحديث خفيف لطابع آخر طلب — يُستدعى بعد التزام الطلب (خارج المعاملة الحرجة). */
export async function touchCustomerOrderTimestamps(customerId: string): Promise<void> {
  await prisma.customer
    .update({ where: { id: customerId }, data: { lastOrderAt: new Date() } })
    .catch(() => {});
}
