import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import GuaranteeCard from "@/components/trust/GuaranteeCard";
import TrustBadgeStrip from "@/components/trust/TrustBadgeStrip";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import { SITE_NAME, WILAYA_COUNT } from "@/data/site";
import { buildMetadata } from "@/lib/seo";
import { buildGenericMessage } from "@/lib/whatsapp";

export const metadata: Metadata = buildMetadata({
  title: "من نحن",
  description:
    "تعرف على Store DZ، متجرك الإلكتروني الجزائري لمنتجات إلكترونية، أزياء، وأدوات منزلية أصلية بضمان حقيقي وتوصيل لكل الولايات.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="container-page py-10 md:py-14">
      <Breadcrumbs items={[{ name: "من نحن", path: "/about" }]} />

      <SectionHeading
        as="h1"
        eyebrow="قصتنا"
        title={`من نحن في ${SITE_NAME}؟`}
        className="mt-6"
      />

      <div className="grid md:grid-cols-2 gap-10 items-start">
        <div className="space-y-4 text-cream-dim leading-relaxed">
          <p>
            انطلق {SITE_NAME} من فكرة بسيطة: تسهيل التسوق الإلكتروني على
            الزبون الجزائري، وتقديم منتجات مختارة بعناية بجودة حقيقية وأسعار
            منطقية، بدون تعقيدات الدفع الإلكتروني وبدون مخاطرة الشراء أونلاين.
          </p>
          <p>
            نؤمن أن الثقة تُبنى بالتفاصيل: منتج أصلي، توصيل يصل إليك أينما
            كنت عبر {WILAYA_COUNT} ولاية، دفع عند الاستلام يريحك من أي قلق،
            وفريق خدمة زبائن متاح على واتساب للإجابة على كل استفساراتك قبل
            وبعد الشراء.
          </p>
          <p>
            كل منتج في متجرنا يمر باختيار دقيق قبل أن يصل إليك، لأن هدفنا ليس
            فقط البيع، بل بناء علاقة طويلة الأمد مع كل زبون يثق بنا.
          </p>
          <div className="pt-2">
            <WhatsAppButton
              variant="pill"
              message={buildGenericMessage()}
              label="تواصل معنا عبر واتساب"
            />
          </div>
        </div>

        <GuaranteeCard />
      </div>

      <div className="mt-14">
        <TrustBadgeStrip />
      </div>
    </div>
  );
}
