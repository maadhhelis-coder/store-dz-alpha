import { SITE_NAME, SITE_TAGLINE, SITE_URL, WHATSAPP_DISPLAY, WILAYA_COUNT } from "@/data/site";
import { buildAiSummary } from "@/lib/aiDiscovery";
import { getPublishedProducts } from "@/lib/storefrontData";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await getPublishedProducts();
  const summary = buildAiSummary(
    { name: SITE_NAME, url: SITE_URL, tagline: SITE_TAGLINE, whatsapp: WHATSAPP_DISPLAY, wilayaCount: WILAYA_COUNT },
    products.length,
  );
  return Response.json(summary, { headers: { "Cache-Control": "public, max-age=3600" } });
}
