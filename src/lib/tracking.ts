export type AdPlatformValue = "facebook" | "instagram" | "tiktok";
export type PageKindValue = "product" | "landing";
export type TrackingEventTypeValue = "page_view" | "cta_click" | "form_start" | "form_submit";

import {
  ATTRIBUTION_STORAGE_KEY,
  mergeAttribution,
  parseStoredSnapshot,
  parseTouchFromParams,
  type AttributionSnapshot,
} from "@/lib/attribution";

const VISITOR_ID_KEY = "sdz_visitor_id";
// المفتاح القديم (platform+creative، 30 يومًا) — يُقرأ مرة للترحيل ثم يُهمل
const LEGACY_ATTRIBUTION_KEY = "sdz_attribution";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

// تُستدعى مرة عند تحميل أي صفحة في المتجر — تلتقط لمسة العزو من معلمات الرابط وتدمجها
// في لقطة `sdz_attr` (localStorage، 90 يومًا): first-touch يُكتب مرة واحدة ولا يُدهس،
// last-touch يُحدَّث بكل زيارة معزوّة. لا cookies للعزو (localStorage فقط — نفس أصل المتجر).
export function captureAttributionFromUrl(searchParams: URLSearchParams): void {
  if (typeof window === "undefined") return;
  try {
    const now = new Date();
    const touch = parseTouchFromParams(searchParams, window.location.pathname, now);
    const merged = mergeAttribution(readSnapshot(now), touch, now);
    if (merged) localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage معطّل (وضع خاص) — لا عزو، لا تخمين
  }
}

function readSnapshot(now: Date): AttributionSnapshot | null {
  const current = parseStoredSnapshot(localStorage.getItem(ATTRIBUTION_STORAGE_KEY), now);
  if (current) return current;
  // ترحيل المفتاح القديم مرة واحدة: platform+creative تصبح لمسة أولى/أخيرة معًا
  try {
    const legacy = localStorage.getItem(LEGACY_ATTRIBUTION_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as { platform?: string; creativeName?: string | null; savedAt?: number };
    const params = new URLSearchParams();
    if (parsed.platform) params.set("utm_source", parsed.platform);
    if (parsed.creativeName) params.set("utm_content", parsed.creativeName);
    const touch = parseTouchFromParams(params, "", new Date(parsed.savedAt ?? now.getTime()));
    localStorage.removeItem(LEGACY_ATTRIBUTION_KEY);
    return mergeAttribution(null, touch, now);
  } catch {
    return null;
  }
}

/** اللقطة الكاملة (first/last) — تُرسل مع الطلب كما هي؛ null بلا عزو. */
export function getAttributionSnapshot(): AttributionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return readSnapshot(new Date());
  } catch {
    return null;
  }
}

/** last-touch المختصر لأحداث التتبّع (نفس ما كان يُرسل قبل P7). */
export function getAttribution(): { platform: AdPlatformValue | null; creativeName: string | null } {
  const snapshot = getAttributionSnapshot();
  return { platform: snapshot?.last.platform ?? null, creativeName: snapshot?.last.creativeName ?? null };
}

export function trackCreativeEvent(
  eventType: TrackingEventTypeValue,
  pageKind: PageKindValue,
  path: string,
  productSlug?: string,
): void {
  if (typeof window === "undefined") return;
  const visitorId = getOrCreateVisitorId();
  const { platform, creativeName } = getAttribution();

  try {
    void fetch("/api/track/creative-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, pageKind, path, productSlug, platform, creativeName, visitorId }),
      keepalive: true,
    });
  } catch {}
}
