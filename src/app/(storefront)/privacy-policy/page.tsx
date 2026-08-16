import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME, WHATSAPP_DISPLAY } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "سياسة الخصوصية",
  description: `سياسة الخصوصية الخاصة بـ ${SITE_NAME} — كيف نجمع بياناتك ونستخدمها ونحميها.`,
  path: "/privacy-policy",
});

export default function PrivacyPolicyPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "سياسة الخصوصية", path: "/privacy-policy" }]} />

      <SectionHeading as="h1" eyebrow="خصوصيتك تهمنا" title="سياسة الخصوصية" className="mt-6" />

      <div className="space-y-8 text-cream-dim leading-relaxed">
        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">البيانات التي نجمعها</h2>
          <p>
            عندما تطلب منتجًا من {SITE_NAME}، نجمع فقط البيانات اللازمة لإتمام طلبك وتوصيله: الاسم الكامل،
            رقم الهاتف، الولاية والبلدية، والعنوان التفصيلي. لا نطلب أي بيانات دفع إلكتروني لأننا نعتمد
            على الدفع عند الاستلام (COD).
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">كيف نستخدم بياناتك</h2>
          <ul className="list-disc pr-5 space-y-1.5">
            <li>تجهيز طلبك وتوصيله عبر شركة التوصيل المعتمدة.</li>
            <li>التواصل معك عبر واتساب أو الهاتف لتأكيد الطلب أو تحديد موعد التسليم.</li>
            <li>تحسين تجربتك في الموقع وقياس أداء صفحاتنا الإعلانية (باستخدام أدوات مثل Meta Pixel وTikTok Pixel).</li>
          </ul>
          <p className="mt-2">
            عند استخدام أدوات القياس الإعلاني، قد نُرسل نسخة مشفّرة (hashed) من رقم هاتفك أو اسمك إلى منصات
            الإعلانات (Meta وTikTok) لغرض واحد فقط: قياس فعالية الحملات الإعلانية ومطابقة عمليات الشراء
            الحقيقية بها. هذه البيانات لا يمكن قراءتها من طرف أي جهة كنص عادي، ولا نستخدمها لأي غرض آخر.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">مشاركة البيانات</h2>
          <p>
            لا نبيع بياناتك ولا نشاركها مع أي جهة خارجية لأغراض تسويقية. نشارك المعلومات الضرورية فقط مع
            شركة التوصيل المعتمدة لإيصال طلبك، ومع منصات القياس الإعلاني (بالصيغة المشفّرة الموضحة أعلاه).
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">حماية بياناتك</h2>
          <p>
            نخزّن بياناتك على خوادم آمنة، ولا يمكن الوصول إليها إلا من طرف فريقنا المخوّل لإتمام طلبات
            الزبائن. يمكنك في أي وقت طلب معرفة البيانات المسجّلة باسمك أو حذفها بالتواصل معنا.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">تواصل معنا</h2>
          <p>
            لأي استفسار يخص خصوصيتك أو بياناتك، تواصل معنا عبر واتساب على {WHATSAPP_DISPLAY}.
          </p>
        </section>
      </div>
    </div>
  );
}
