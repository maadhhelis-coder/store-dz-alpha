import { SITE_NAME, SITE_TAGLINE, SITE_URL, WHATSAPP_DISPLAY, WILAYA_COUNT } from "@/data/site";
import { buildLlmsTxt } from "@/lib/aiDiscovery";
import { getPublishedProducts } from "@/lib/storefrontData";

// /llms.txt لمحركات الذكاء الاصطناعي. force-dynamic مثل sitemap.ts: لا قاعدة بيانات وقت البناء.
export const dynamic = "force-dynamic";

export async function GET() {
  const products = await getPublishedProducts();
  const body = buildLlmsTxt(
    { name: SITE_NAME, url: SITE_URL, tagline: SITE_TAGLINE, whatsapp: WHATSAPP_DISPLAY, wilayaCount: WILAYA_COUNT },
    products,
  );
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
