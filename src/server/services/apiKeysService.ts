import { randomBytes, createHash, timingSafeEqual } from "crypto";
import {
  findActiveKeyByHash,
  listApiKeys,
  createApiKeyRecord,
  revokeApiKey,
  touchApiKeyLastUsed,
} from "@/server/repositories/apiKeysRepository";

const KEY_PREFIX = "sdz_";

function hashKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

// يُنشئ مفتاحًا خامًا جديدًا (يُعرض مرة واحدة فقط) ويخزّن هاش SHA-256 منه فقط.
// scopes فارغة = وصول كامل (نفس سلوك المفاتيح القديمة). expiresAt = null يعني بلا انتهاء.
export async function generateApiKey(label: string, scopes: string[] = [], expiresAt: Date | null = null) {
  const rawKey = `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;
  const record = await createApiKeyRecord(hashKey(rawKey), label, scopes, expiresAt);
  return { rawKey, record };
}

export function getApiKeys() {
  return listApiKeys();
}

export function deactivateApiKey(id: string) {
  return revokeApiKey(id);
}

export type VerifiedApiKey = { id: string; scopes: string[] };

// يتحقق من مفتاح API الوارد في رأس x-api-key مقابل المفاتيح المفعّلة المخزّنة كـ hash،
// ويُعيد نطاقاته (scopes) ليتحقق المستدعي أن المفتاح مصرَّح له بالإجراء المطلوب تحديدًا.
export async function verifyApiKey(rawKey: string): Promise<VerifiedApiKey | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;

  const candidateHash = hashKey(rawKey);
  const record = await findActiveKeyByHash(candidateHash);
  if (!record) return null;

  const isMatch = timingSafeEqual(Buffer.from(record.keyHash), Buffer.from(candidateHash));
  if (!isMatch) return null;

  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;

  touchApiKeyLastUsed(record.id).catch(() => {});
  return { id: record.id, scopes: record.scopes };
}

// مصفوفة فارغة = وصول كامل (توافقًا مع المفاتيح القديمة).
export function apiKeyHasScope(key: VerifiedApiKey, scope: string): boolean {
  return key.scopes.length === 0 || key.scopes.includes(scope);
}
