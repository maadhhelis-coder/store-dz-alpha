import dns from "node:dns/promises";
import { isIP } from "node:net";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import * as webhooksRepository from "@/server/repositories/webhooksRepository";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";
import type { WebhookEvent } from "@prisma/client";

export function listWebhooks() {
  return webhooksRepository.listWebhooks();
}

export function listWebhooksPage(params: webhooksRepository.ListWebhooksPageParams) {
  return webhooksRepository.listWebhooksPage(params);
}

export class PrivateWebhookHostError extends Error {
  constructor() {
    super("هذا الرابط يشير لعنوان داخلي/محلي، لا يمكن استعماله كـ webhook");
    this.name = "PrivateWebhookHostError";
  }
}

export class WebhookUrlTakenError extends Error {
  constructor() {
    super("هذا الرابط مسجَّل بالفعل كـ webhook");
    this.name = "WebhookUrlTakenError";
  }
}

// طبقة حماية SSRF ثانية أعمق من الفحص النصي فـwebhookSchema.ts — تلك تمنع فقط اسم مضيف
// حرفي داخلي (مثل "localhost")، لكن دومين عام يُحلَّل DNS لعنوان داخلي (DNS rebinding، أو
// دومين مُعاد توجيهه لشبكة داخلية) كان يمر منها. هنا نحل DNS فعليًا ونتحقق من كل عنوان مُرجَع.
// تُستدعى مرتين: عند التسجيل (createWebhook) وعند كل إرسال فعلي (dispatchWebhookEvent) —
// حل DNS وقت التسجيل لا يضمن شيئًا وقت الإرسال لاحقًا (قد يكون بعد أيام)، لأن الدومين قد
// يُعاد توجيهه لعنوان داخلي بعد اجتياز الفحص الأول (DNS rebinding).
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
  }
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

async function assertPublicWebhookHost(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PrivateWebhookHostError();
  }
  const hostname = parsed.hostname;
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new PrivateWebhookHostError();
    return;
  }
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map((a) => a.address);
  } catch {
    // فشل حل DNS يُترك لمحاولة الإرسال الفعلية لاحقًا (قد يكون دومين صحيح مؤقتًا غير متاح)،
    // لا نمنع التسجيل بسببه هنا. عند الإرسال الفعلي (dispatchWebhookEvent)، فشل الحل هنا
    // يعني تخطي هذا الإرسال بأمان بدل محاولة fetch على عنوان قد يكون غير محلول أصلًا.
    return;
  }
  if (addresses.some(isPrivateIp)) throw new PrivateWebhookHostError();
}

const WEBHOOK_SECRET_BYTES = 32;

// يُنشئ سر HMAC عشوائيًا (يُعرض للمالك مرة واحدة فقط عند الإنشاء، تمامًا كمفاتيح API)،
// ويخزّن نسخة مشفَّرة منه فقط (secretBox.ts) — لا نص صريح أبدًا في القاعدة.
export async function createWebhook(url: string, events: WebhookEvent[]) {
  await assertPublicWebhookHost(url);
  const rawSecret = randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");
  try {
    const webhook = await webhooksRepository.createWebhook(url, events, encryptSecret(rawSecret));
    return { webhook, rawSecret };
  } catch (error) {
    // قيد unique على url (schema.prisma) يمنع تسجيل نفس الرابط مرتين ذرّيًا حتى تحت
    // طلبَين متزامنين — بلا فحص مسبق منفصل قد يفوته سباق التوقيت (TOCTOU).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new WebhookUrlTakenError();
    }
    throw error;
  }
}

export function deleteWebhook(id: string) {
  return webhooksRepository.deleteWebhook(id);
}

// إطلاق فعلي للـ Webhooks (لا تحاكي فقط) — بمعزل تام عن أي عملية طلب/قاعدة بيانات جارية،
// حتى لا يفشل طلب حقيقي بسبب رابط ويب هوك معطوب. نستعمل after() (ماشي void بسيط) لأن
// Vercel serverless يقتل الـ function فور إرسال الرد — أي عمل غير منتظر (fire-and-forget
// عادي) قد لا يكتمل أبدًا؛ after() يضمن اكتمال الإرسال حتى بعد رجوع الرد للعميل.
export function fireWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>): void {
  after(() =>
    dispatchWebhookEvent(event, payload).catch((error) => {
      console.error("webhook dispatch error", error);
    }),
  );
}

function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

// يتحقق مستقبِل الـwebhook من التوقيع بنفس الطريقة — موثَّق فـMIGRATIONS.md/الواجهة الإدارية
// عند إنشاء الـwebhook. مُصدَّرة أيضًا لاستعمالها فالاختبارات.
export function verifyWebhookSignature(
  rawSecret: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
): boolean {
  const expected = signPayload(rawSecret, timestamp, rawBody);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const WEBHOOK_ATTEMPT_TIMEOUT_MS = 20_000;
const WEBHOOK_RETRY_DELAY_MS = 4_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// محاولة إرسال واحدة (بلا إعادة محاولة) — تُستدعى مرتين كحد أقصى من الحلقة أدناه.
async function attemptWebhookDelivery(
  webhook: { url: string; secret: string },
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<{ status: number; redirected: boolean }> {
  // إعادة تحقق SSRF كاملة هنا (وليس فقط وقت التسجيل) — الحماية الحقيقية ضد DNS rebinding:
  // الفحص وقت التسجيل لا يضمن شيئًا بعد ذلك بدقائق/أيام.
  await assertPublicWebhookHost(webhook.url);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });
  const rawSecret = decryptSecret(webhook.secret);
  const signature = signPayload(rawSecret, timestamp, body);

  const res = await fetch(webhook.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Signature": `sha256=${signature}`,
    },
    body,
    // اكتُشف فعليًا: مستقبِلات مستضافة على منصات Free Tier (مثل Render) تنام بعد فترة
    // خمول وتحتاج 30-60 ثانية Cold Start عند أول طلب — 8 ثوانٍ (القيمة السابقة) كانت
    // تفشل بشكل شبه مضمون فهذه الحالة (status=0 حقيقي فسجل الإرسال). 20 ثانية تكفي
    // لمعظم حالات Cold Start الفعلية بلا إبقاء الاتصال مفتوحًا بلا داعٍ.
    signal: AbortSignal.timeout(WEBHOOK_ATTEMPT_TIMEOUT_MS),
    // لا نتبع أي redirect تلقائيًا — رابط عام يُحوّل (302) لعنوان داخلي كان سيتجاوز
    // فحص SSRF أعلاه كليًا لو تُبع تلقائيًا. أي استجابة تحويل تُعامَل كفشل إرسال.
    redirect: "manual",
  });
  return { status: res.status, redirected: res.status >= 300 && res.status < 400 };
}

async function dispatchWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>) {
  if (isE2ETestRun()) {
    logE2ESkip(`webhook dispatch for event ${event}`);
    return;
  }
  const webhooks = await webhooksRepository.findActiveWebhooksForEvent(event);

  await Promise.all(
    webhooks.map(async (webhook) => {
      let status = 0;
      // محاولتان كحد أقصى (محاولة أولى + إعادة محاولة واحدة بعد تأخير قصير) — مصمَّمة
      // خصيصًا لتغطية Cold Start مستقبِل نائم مؤقتًا (راجع تعليق WEBHOOK_ATTEMPT_TIMEOUT_MS
      // أعلاه): لو فشلت المحاولة الأولى (Timeout أو خطأ اتصال أو 5xx)، المستقبِل غالبًا
      // استيقظ فعليًا الآن، فالمحاولة الثانية بعد التأخير أرجح بكثير للنجاح. المستقبِل
      // (store-dz-agent) مصمَّم ليكون آمنًا لإعادة الإرسال هذه: order_status_changed محمي
      // عبر wasNotificationAlreadySent، وorder_created محمي عبر فحص storeOrderNumber
      // الفريد فsendWebOrderConfirmationRequest — إعادة إرسال حقيقية لا تُرسِل رسالة واتساب
      // مكررة للزبون حتى لو نجحت المحاولتان معًا فعليًا.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const result = await attemptWebhookDelivery(webhook, event, payload);
          status = result.status;
          if (result.redirected) {
            console.error(`webhook delivery to ${webhook.url} returned a redirect (${status}) — refused to follow`);
          }
          if (status >= 200 && status < 300) break;
          if (attempt === 1) {
            console.error(`webhook delivery to ${webhook.url} failed (status ${status}), retrying once`);
            await sleep(WEBHOOK_RETRY_DELAY_MS);
          }
        } catch (error) {
          console.error(`webhook delivery attempt ${attempt} failed for ${webhook.url}`, error);
          status = 0;
          if (attempt === 1) await sleep(WEBHOOK_RETRY_DELAY_MS);
        }
      }
      await webhooksRepository.recordWebhookFireResult(webhook.id, status);
    }),
  );
}
