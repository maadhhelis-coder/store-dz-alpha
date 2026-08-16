// يحدّد IP الزبون الحقيقي من الطلب — x-real-ip أولاً (يضبطه Vercel نفسه على IP الاتصال
// الحقيقي، لا يقدر العميل يزوّره)، ثم آخر قيمة في x-forwarded-for كاحتياط (Vercel يُلحق IP
// الاتصال الحقيقي كآخر عنصر في السلسلة؛ أي قيم قبلها قد تكون مزوّرة من العميل نفسه).
// ملاحظة مهمة: أخذ أول قيمة من x-forwarded-for (كيفما كان يُفعل سابقًا) يسمح لأي طالب
// يرسل رأسًا مزوّرًا بتجاوز تحديد المعدل (rate limiting) بالكامل.
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return "unknown";
}
