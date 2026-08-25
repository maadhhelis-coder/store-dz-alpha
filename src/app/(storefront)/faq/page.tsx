import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME, WHATSAPP_DISPLAY, WILAYA_COUNT } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "الأسئلة الشائعة",
  description: `إجابات على أكثر الأسئلة شيوعًا حول الطلب والدفع والتوصيل في ${SITE_NAME}.`,
  path: "/faq",
});

const FAQ_ITEMS = [
  {
    question: "كيف أطلب منتجًا؟",
    answer:
      "تختار المنتج الذي يعجبك من الموقع، ثم تضغط على زر «اطلب الآن» الذي يفتح لك استمارة طلب سريعة (الاسم، الهاتف، الولاية، البلدية)، وبعد إرسالها يتواصل معك فريقنا لتأكيد الطلب.",
  },
  {
    question: "هل أحتاج للدفع قبل استلام طلبي؟",
    answer:
      "لا. نعتمد الدفع عند الاستلام (COD) — تدفع فقط عند وصول الطلب إليك، ولا حاجة لأي بطاقة أو بيانات دفع إلكتروني مسبقًا.",
  },
  {
    question: "كم يستغرق وصول الطلب؟",
    answer: `عادة بين يوم إلى يومين حسب الولاية، ونوصل إلى ${WILAYA_COUNT} ولاية عبر كامل التراب الوطني.`,
  },
  {
    question: "هل يمكنني تعديل أو إلغاء طلبي؟",
    answer:
      "نعم، يمكنك ذلك قبل شحن الطلب — فقط تواصل معنا عبر واتساب في أقرب وقت.",
  },
  {
    question: "ماذا لو استلمت منتجًا به عيب أو غير مطابق؟",
    answer:
      "تواصل معنا خلال 48 ساعة من الاستلام وسنقوم بالاستبدال أو استرداد كامل المبلغ دون أي تعقيد.",
  },
  {
    question: "كيف أتواصل معكم إذا كان عندي سؤال آخر؟",
    answer: `فريقنا متاح للرد على أي استفسار عبر واتساب على ${WHATSAPP_DISPLAY}.`,
  },
] as const;

export default function FaqPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "الأسئلة الشائعة", path: "/faq" }]} />

      <SectionHeading as="h1" eyebrow="عندك سؤال؟" title="الأسئلة الشائعة" className="mt-6" />

      <div className="space-y-6">
        {FAQ_ITEMS.map((item) => (
          <div key={item.question} className="rounded-xl gold-border bg-ink p-5">
            <h2 className="text-cream font-display font-semibold text-base mb-2">
              {item.question}
            </h2>
            <p className="text-cream-dim text-sm leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
