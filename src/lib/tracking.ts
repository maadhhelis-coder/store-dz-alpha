export type AdPlatformValue = "facebook" | "instagram" | "tiktok";
export type PageKindValue = "product" | "landing";
export type TrackingEventTypeValue = "page_view" | "cta_click" | "form_submit";

const VISITOR_ID_KEY = "sdz_visitor_id";
const ATTRIBUTION_KEY = "sdz_attribution";
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // نافذة إسناد 30 يوم

function normalizePlatform(raw: string | null): AdPlatformValue | null {
  const value = (raw ?? "").toLowerCase();
  if (["facebook", "fb"].includes(value)) return "facebook";
  if (["instagram", "ig"].includes(value)) return "instagram";
  if (["tiktok", "tt"].includes(value)) return "tiktok";
  return null;
}

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

// تُستدعى مرة عند تحميل أي صفحة في المتجر — تقرأ utm_source/utm_content (أو platform/creative)
// من رابط الصفحة وتحفظها محليًا، حتى تبقى ملتصقة بالزائر عبر بقية رحلته في القمع
// (صفحة المنتج ← صفحة الهبوط ← تأكيد الطلب) حتى لو ما تكررتش في كل رابط داخلي.
export function captureAttributionFromUrl(searchParams: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const platform = normalizePlatform(searchParams.get("utm_source") ?? searchParams.get("platform"));
  if (!platform) return;

  const creativeName = searchParams.get("utm_content") ?? searchParams.get("creative") ?? null;
  localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ platform, creativeName, savedAt: Date.now() }));
}

export function getAttribution(): { platform: AdPlatformValue | null; creativeName: string | null } {
  if (typeof window === "undefined") return { platform: null, creativeName: null };
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return { platform: null, creativeName: null };
    const parsed = JSON.parse(raw) as { platform: AdPlatformValue; creativeName: string | null; savedAt: number };
    if (Date.now() - parsed.savedAt > ATTRIBUTION_TTL_MS) return { platform: null, creativeName: null };
    return { platform: parsed.platform, creativeName: parsed.creativeName };
  } catch {
    return { platform: null, creativeName: null };
  }
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
