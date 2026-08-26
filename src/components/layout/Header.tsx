import Link from "next/link";
import Logo from "@/components/brand/Logo";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import { InstagramIcon, FacebookIcon, TiktokIcon } from "@/components/shared/SocialIcons";
import HeaderSearchToggle from "@/components/layout/HeaderSearchToggle";
import MobileNav from "@/components/layout/MobileNav";
import { FACEBOOK_URL, INSTAGRAM_URL, NAV_LINKS } from "@/data/site";
import { buildGenericMessage } from "@/lib/whatsapp";

type HeaderProps = {
  logoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};

// Server Component بالكامل الآن — التفاعلية الفعلية (فتح/إغلاق القائمة على الموبايل،
// توسيع حقل البحث) معزولة بجزيرتين صغيرتين (HeaderSearchToggle وMobileNav) بدل جعل
// كل الهيدر "use client" لمجرد عنصرين تفاعليين وسط محتوى ثابت بصريًا بالكامل.
export default function Header({ logoUrl, instagramUrl, facebookUrl, tiktokUrl }: HeaderProps = {}) {
  const igUrl = instagramUrl || INSTAGRAM_URL;
  const fbUrl = facebookUrl || FACEBOOK_URL;

  return (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur border-b border-gold/15">
      {/* طلب صريح لاحق: جعل اللوغو "تقريبًا لاصق" بالحافة اليمنى وأيقونات التواصل "لاصقة"
          بالحافة اليسرى بالحاسوب — container-page (بحدّ أقصى 1200px) كان يترك فراغًا حقيقيًا
          خارجه على الشاشات الواسعة. عرض كامل هنا مع padding أفقي خاص بالهيدر بدل container-page. */}
      <div className="w-full flex items-center justify-between h-18 py-3 md:h-20 px-4 sm:px-6 lg:px-10 xl:px-14">
        {/* طلب صريح: تكبير لوغو واسم store dz بالحاسوب أكثر — الجانب الأيمن بصريًا هنا (RTL،
            أول عنصر بترتيب DOM) كما هو مطلوب، بلا تغيير أي شيء بالموبايل. */}
        <Logo
          logoUrl={logoUrl}
          imgClassName="md:w-14 md:h-14"
          textClassName="md:text-2xl"
        />

        {/* طلب صريح: تكبير كلمات الرئيسية/المنتجات/تواصل معنا. */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base lg:text-lg text-cream-dim hover:text-gold transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* طلب صريح: تكبير أيقونات مواقع التواصل الاجتماعي بالحاسوب — الجانب الأيسر بصريًا
            هنا (RTL، آخر عنصر بترتيب DOM) كما هو مطلوب، مع تباعد أوسع قليلاً بينها. */}
        <div className="hidden md:flex items-center gap-4">
          <HeaderSearchToggle />
          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="صفحة Store DZ على انستغرام"
            className="text-cream-dim hover:text-gold transition-colors p-1.5 -m-1.5"
          >
            <InstagramIcon className="w-6 h-6" />
          </a>
          <a
            href={fbUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="صفحة Store DZ على فيسبوك"
            className="text-cream-dim hover:text-gold transition-colors p-1.5 -m-1.5"
          >
            <FacebookIcon className="w-6 h-6" />
          </a>
          {tiktokUrl && (
            <a
              href={tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="صفحة Store DZ على تيك توك"
              className="text-cream-dim hover:text-gold transition-colors p-1.5 -m-1.5"
            >
              <TiktokIcon className="w-6 h-6" />
            </a>
          )}
          <WhatsAppButton
            variant="pill"
            message={buildGenericMessage()}
            label="راسلنا واتساب"
            className="md:px-5 md:py-2.5 md:text-base"
          />
        </div>

        <MobileNav navLinks={NAV_LINKS} igUrl={igUrl} fbUrl={fbUrl} tiktokUrl={tiktokUrl} />
      </div>
    </header>
  );
}
