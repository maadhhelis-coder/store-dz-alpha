import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/auth/supabaseMiddlewareClient";

// CSP بمبدأ nonce عشوائي حقيقي لكل طلب + 'strict-dynamic' بدل 'unsafe-inline' فـscript-src.
//
// الآلية (موثَّقة رسميًا من Next.js): نضع نفس الـnonce فـ(أ) هيدر CSP على الاستجابة
// الفعلية للمتصفح، و(ب) هيدر CSP على هيدرز الطلب الداخلية (x-nonce أيضًا) التي تصل
// لطبقة الـrendering — Next.js نفسه يكتشف هذا التطابق تلقائيًا ويضع نفس الـnonce على
// سكربتاته الداخلية (RSC streaming/hydration) دون أي تدخل يدوي منا. أي <Script> نضيفه
// نحن يدويًا (pixel-loader.js مثلاً) يقرأ x-nonce عبر headers() ويمرّره صراحة.
//
// 'strict-dynamic': يسمح لأي سكربت حُمِّل من سكربت موثوق أصلًا (بـnonce صحيح، مثل
// pixel-loader.js) بإدراج سكربتات أخرى ديناميكيًا (سكربتات بيكسلات Meta/TikTok الحقيقية)
// دون الحاجة لإدراج كل نطاق طرف ثالث صراحة. المتصفحات الأقدم التي لا تدعم strict-dynamic
// تتجاهله وترجع تلقائيًا لقائمة النطاقات الصريحة المُبقاة كـfallback.
//
// لماذا نونس لكل طلب يفرض rendering ديناميكي: nonce يجب أن يكون غير قابل للتخمين ويتغيّر
// كل استجابة — أي تثبيته لفترة (مثلًا bucket زمني) يجعله متوقَّعًا لمهاجم يملك ثغرة XSS
// منفصلة (حتى لو "قصيرة العمر")، وهذا يُبطل الحماية بالكامل. لذلك الصفحات التي تعتمد
// هذا الـnonce (المتجر بالكامل عبر (storefront)/layout.tsx) تتحول لـrendering ديناميكي
// (SSR لكل طلب) بدل ISR الثابتة — قرار Next.js نفسه يفرضه، موثَّق فـhttps://nextjs.org/docs
// تحت Content-Security-Policy: "nonces need to be unique for every request... you need
// to opt into dynamic rendering". لا يوجد بديل آمن يحافظ على nonce حقيقي وISR ثابتة معًا.
function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://connect.facebook.net https://analytics.tiktok.com https://www.googletagmanager.com https://sc-static.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // script.google.com + script.googleusercontent.com: نداء fetch من المتصفح مباشرة نحو
    // Google Apps Script (راجع src/lib/orders.ts — submitOrderToSheet) لتسجيل الطلب
    // فGoogle Sheets. كان النطاقان مفقودَين هنا فيُحجب الطلب صامتًا (catch فارغ يبتلع
    // الخطأ) — اكتشفناه فعليًا عبر اختبار E2E حقيقي بمتصفح يفرض CSP، وليس عبر فحص كود
    // فقط: كل طلب حقيقي منذ تفعيل nonce-based CSP لم يكن يصل لـSheets إطلاقًا، رغم أن
    // الطلب نفسه كان يُحفظ بنجاح فقاعدة البيانات. النطاق الثاني (googleusercontent.com)
    // مطلوب لأن Apps Script Web Apps يُعيد توجيه (302) استجابة fetch الفعلية إليه.
    //
    // https://*.tiktokw.us: نفس الفئة من الأعطال بالضبط، اكتُشفت فعليًا الآن (متصفح حقيقي
    // فالإنتاج + فحص Console مباشرة، وليس تخمينًا): حزمة TikTok Pixel (events.js، محمَّلة من
    // analytics.tiktok.com المُدرَج أصلًا) تستدعي داخليًا نطاقًا مختلفًا تمامًا
    // (analytics-ipv6.tiktokw.us) لإثراء معلومات IP — كان محجوبًا صامتًا برسالة CSP حقيقية
    // فConsole ("violates... connect-src... blocked")، فتظهر صفحة "Test Events" فتيك توك
    // فارغة تمامًا رغم أن البكسل نفسه مُهيَّأ بمعرّفه الصحيح (window.ttq موجود فعليًا).
    "connect-src 'self' https://*.facebook.com https://www.google-analytics.com https://analytics.google.com https://analytics.tiktok.com https://*.tiktokw.us https://tr.snapchat.com https://sc-static.net https://*.supabase.co wss://*.supabase.co https://script.google.com https://script.googleusercontent.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCspHeader(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // صفحة الدخول لا تحتاج جلسة Supabase — لكنها كأي صفحة أخرى تحتاج nonce/CSP خاصة بها.
  if (pathname === "/admin/login" || pathname === "/admin/login/") {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (isAdminPage || isAdminApi) {
    const { response, user } = await updateSupabaseSession(request, requestHeaders);

    if (!user && isAdminPage) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.headers.set("Content-Security-Policy", csp);
      return redirectResponse;
    }

    // الطلبات الآلية (الوكيل الذكي الخارجي مثلاً) تُمرَّر بمفتاح x-api-key بدل جلسة —
    // التحقق الفعلي من صحة المفتاح يتم داخل requireAdminOrApiKey على مستوى الـ route.
    const hasApiKeyHeader = request.headers.has("x-api-key");
    if (!user && isAdminApi && !hasApiKeyHeader) {
      const jsonResponse = NextResponse.json({ error: "غير مصرح لك بالدخول" }, { status: 401 });
      jsonResponse.headers.set("Content-Security-Policy", csp);
      return jsonResponse;
    }

    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // كل المسارات ما عدا أصول Next.js الثابتة وملفات الصور/الخطوط — هذه لا تُقرأ كـHTML
  // فلا تحتاج CSP، وتفاديها يوفّر استدعاء middleware غير ضروري على كل chunk/صورة.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|ttf)$).*)",
  ],
};
