import type { Metadata } from "next";
import { Phone } from "lucide-react";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import { InstagramIcon, FacebookIcon } from "@/components/shared/SocialIcons";
import {
  FACEBOOK_URL,
  INSTAGRAM_URL,
  WHATSAPP_NUMBER,
  WHATSAPP_DISPLAY,
  WILAYA_COUNT,
} from "@/data/site";
import { buildMetadata } from "@/lib/seo";
import { buildGenericMessage } from "@/lib/whatsapp";

export const metadata: Metadata = buildMetadata({
  title: "تواصل معنا",
  description:
    "تواصل مع فريق Store DZ عبر واتساب أو انستغرام أو فيسبوك لأي استفسار حول منتجاتنا أو طلباتك.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className="container-page py-10 md:py-14">
      <Breadcrumbs items={[{ name: "تواصل معنا", path: "/contact" }]} />
      <SectionHeading
        as="h1"
        eyebrow="نحن على بعد رسالة واحدة"
        title="تواصل معنا"
        description="فريقنا متاح للرد على استفساراتك، مساعدتك في اختيار المنتج المناسب، أو متابعة طلبك."
        align="center"
        className="mt-6"
      />

      <div className="max-w-xl mx-auto rounded-2xl gold-border bg-ink p-8 text-center space-y-6">
        <div>
          <p className="text-cream-dim text-sm">الطريقة الأسرع للتواصل معنا</p>
          <p className="text-gold font-bold text-lg mt-1">{WHATSAPP_DISPLAY}</p>
        </div>

        <WhatsAppButton
          variant="primary-large"
          message={buildGenericMessage()}
          label="راسلنا عبر واتساب"
        />

        <a
          href={`tel:+${WHATSAPP_NUMBER}`}
          className="inline-flex items-center justify-center gap-2 text-cream-dim hover:text-gold transition-colors text-sm"
        >
          <Phone className="w-4 h-4" />
          اتصل بنا: <span dir="ltr">{WHATSAPP_DISPLAY}</span>
        </a>

        <div className="flex items-center justify-center gap-6 pt-4 border-t border-gold/10">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="صفحة Store DZ على انستغرام"
            className="text-cream-dim hover:text-gold transition-colors flex items-center gap-2 text-sm"
          >
            <InstagramIcon className="w-5 h-5" />
            انستغرام
          </a>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="صفحة Store DZ على فيسبوك"
            className="text-cream-dim hover:text-gold transition-colors flex items-center gap-2 text-sm"
          >
            <FacebookIcon className="w-5 h-5" />
            فيسبوك
          </a>
        </div>

        <p className="text-xs text-cream-dim/80">
          نوصل طلباتك إلى {WILAYA_COUNT} ولاية عبر التراب الوطني، مع الدفع عند
          الاستلام.
        </p>
      </div>
    </div>
  );
}
