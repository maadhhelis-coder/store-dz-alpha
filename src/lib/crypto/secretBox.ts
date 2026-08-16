import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// تشفير الأسرار (توكنات Meta/TikTok، Gmail OAuth، مفاتيح شركات التوصيل) قبل حفظها
// بقاعدة البيانات — كانت تُخزَّن نصًا صريحًا، فأي اختراق لقاعدة البيانات أو نسخة احتياطية
// مسرّبة يكشف كل التوكنات مباشرة. AES-256-GCM مع IV عشوائي لكل قيمة.
const PREFIX = "enc:v1:";

let cachedKey: Buffer | null | undefined;

// في الإنتاج، SECRETS_ENCRYPTION_KEY إلزامي — فشل مغلق (رمي خطأ) بدل تمرير الأسرار نصًا
// صريحًا بصمت. في التطوير المحلي فقط نسمح بالعمل بلا المفتاح (تنبيه مرة واحدة) حتى لا
// يُعطَّل استنساخ المشروع لأول مرة بلا هذا المتغيّر.
let warnedMissingKey = false;
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const secret = process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SECRETS_ENCRYPTION_KEY غير مضبوط — لا يمكن تخزين أو قراءة الأسرار (توكنات API) في بيئة الإنتاج بلا هذا المتغيّر",
      );
    }
    if (!warnedMissingKey) {
      console.warn("SECRETS_ENCRYPTION_KEY غير مضبوط — الأسرار (توكنات API) تُحفظ حاليًا بلا تشفير (بيئة تطوير فقط)");
      warnedMissingKey = true;
    }
    cachedKey = null;
    return null;
  }
  cachedKey = scryptSync(secret, "store-dz-secrets", 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

// يمرّر القيم القديمة غير المشفّرة (المخزَّنة قبل هذا التحديث) كما هي بدل تعطيلها.
export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) return value;

  const key = getKey();
  if (!key) return value;

  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptSecretIfPresent<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === "") return value;
  return encryptSecret(value) as T;
}

export function decryptSecretIfPresent<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === "") return value;
  return decryptSecret(value) as T;
}
