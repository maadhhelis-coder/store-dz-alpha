import Link from "next/link";
import Logo from "@/components/brand/Logo";
import FooterAccordionColumn from "@/components/layout/FooterAccordionColumn";
import { InstagramIcon, FacebookIcon, TiktokIcon, WhatsAppIcon } from "@/components/shared/SocialIcons";
import { FACEBOOK_URL, INSTAGRAM_URL, NAV_LINKS, SITE_TAGLINE } from "@/data/site";
import { buildGenericMessage, buildWhatsAppUrl } from "@/lib/whatsapp";

const ABOUT_STORE_LINKS = [
  { href: "/about", label: "عن المتجر" },
  { href: "/payment-methods", label: "طرق الدفع" },
  { href: "/shipping-delivery", label: "الشحن والتسليم" },
  { href: "/faq", label: "الأسئلة الشائعة" },
] as const;

const POLICY_LINKS = [
  { href: "/terms-of-service", label: "شروط الاستخدام" },
  { href: "/return-policy", label: "سياسة الاستبدال والاسترجاع" },
  { href: "/privacy-policy", label: "سياسة الخصوصية" },
] as const;

type FooterProps = {
  logoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};

export default function Footer({ logoUrl, instagramUrl, facebookUrl, tiktokUrl }: FooterProps = {}) {
  const igUrl = instagramUrl || INSTAGRAM_URL;
  const fbUrl = facebookUrl || FACEBOOK_URL;

  return (
    <footer className="border-t border-gold/15 bg-ink mt-16">
      <div className="container-page py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo logoUrl={logoUrl} />
          <p className="text-sm text-cream-dim mt-4 leading-relaxed">
            {SITE_TAGLINE}
          </p>
          <div className="flex items-center gap-4 mt-4">
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

        <FooterAccordionColumn title="عن المتجر" items={ABOUT_STORE_LINKS} />
        <FooterAccordionColumn title="الشروط والسياسات" items={POLICY_LINKS} />
      </div>
    </footer>
  );
}
