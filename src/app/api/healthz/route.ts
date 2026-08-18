export { GET } from "@/app/api/health/route";

// السبب الجذري الحقيقي لفشل /api/health على Vercel (مؤكَّد من لوحة تحكم Vercel نفسها، وليس
// تخمينًا): Git Commit Author Verification — كل Commit فهذه البيئة كان يُنشأ بهوية Git محلية
// خاطئة (e2e-verification@local) غير مصرَّح لها فمشروع Vercel، فكان Vercel يحجب أي Deployment
// جديد بصمت (Blocked، بلا حتى محاولة Build) ويستمر بخدمة آخر نسخة ناجحة قديمة تحت production
// alias — وهي نسخة أقدم من إضافة هذا المسار أصلًا. لهذا فشل /api/health رغم عمله محليًا وداخل
// Docker بشكل صحيح تمامًا طوال الوقت. أُصلح بتصحيح هوية Git (راجع سجل الـcommits).
// هذا المسار البديل يبقى موجودًا كنقطة مراقبة ثانوية إضافية، لا لأنه ضروري لحل المشكلة.
