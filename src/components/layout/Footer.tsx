import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { InstagramIcon, FacebookIcon, TiktokIcon, WhatsAppIcon } from "@/components/shared/SocialIcons";
import {
  ABOUT_STORE_LINKS,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  NAV_LINKS,
  POLICY_LINKS,
  SITE_TAGLINE,
} from "@/data/site";
import { buildGenericMessage, buildWhatsAppUrl } from "@/lib/whatsapp";

type FooterProps = {
  logoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};

export default function Footer({ logoUrl, instagramUrl, facebookUrl, tiktokUrl }: FooterProps = {}) {
  const igUrl = instagramUrl || INSTAGRAM_URL;
  const fbUrl = facebookUrl || FACEBOOK_URL;

  // طلب صريح: تقليص الفراغ على الهاتف تحديدًا بين قسم "ما يميزنا" (آخر عنصر بالصفحة الرئيسية)
  // وخط الفوتر الذهبي العلوي (border-t border-gold/15) — "هبطها [الصورة] كي لا يكون بينها
  // وبين الخط الاصفر الا قليلا جدا" كان يقصد هذا الفراغ تحديدًا (mt-16 السابق)، وليس الفراغ
  // أعلى قسم "ما يميزنا" كما فُهم خطأً فمحاولة سابقة. mt-4 على الهاتف، mt-16 الأصلي كما هو
  // بالحاسوب (لم يُطلب تغييره هناك).
  return (
    <footer className="border-t border-gold/15 bg-ink mt-4 md:mt-16">
      <div className="container-page py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo logoUrl={logoUrl} />
          <p className="text-sm text-cream-dim mt-4 leading-relaxed">
            {SITE_TAGLINE}
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <a
              href={igUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="صفحة Store DZ على انستغرام"
              className="text-cream-dim hover:text-gold transition-colors p-1.5 -m-1.5"
            >
              <InstagramIcon className="w-5 h-5" />
            </a>
            <a
              href={fbUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="صفحة Store DZ على فيسبوك"
              className="text-cream-dim hover:text-gold transition-colors p-1.5 -m-1.5"
            >
              <FacebookIcon className="w-5 h-5" />
            </a>
            {tiktokUrl && (
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="صفحة Store DZ على تيك توك"
                className="text-cream-dim hover:text-gold transition-colors p-1.5 -m-1.5"
              >
                <TiktokIcon className="w-5 h-5" />
              </a>
            )}
            <a
              href={buildWhatsAppUrl(buildGenericMessage())}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="تواصل معنا عبر واتساب"
              className="text-[#25D366] hover:brightness-110 transition-all p-1.5 -m-1.5"
            >
              <WhatsAppIcon className="w-5 h-5" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="font-display font-semibold text-gold mb-4">
            روابط سريعة
          </h3>
          <ul className="space-y-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-cream-dim hover:text-gold transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* عرض ثابت بلا طيّ (طلب صريح: نفس نمط "روابط سريعة" بالضبط — كل العناصر ظاهرة
            دومًا بلا حاجة للنقر على أي سهم). كانت هذه أكورديون details/summary قابلة للطي
            سابقًا، بطلب صريح سابق أيضًا — تراجع صاحب المتجر عن ذلك بعد رؤيتها فعليًا. */}
        <div>
          <h3 className="font-display font-semibold text-gold mb-4">عن المتجر</h3>
          <ul className="space-y-2">
            {ABOUT_STORE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-cream-dim hover:text-gold transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display font-semibold text-gold mb-4">الشروط والسياسات</h3>
          <ul className="space-y-2">
            {POLICY_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-cream-dim hover:text-gold transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
