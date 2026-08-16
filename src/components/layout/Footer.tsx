import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { InstagramIcon, FacebookIcon, TiktokIcon, WhatsAppIcon } from "@/components/shared/SocialIcons";
import {
  FACEBOOK_URL,
  INSTAGRAM_URL,
  NAV_LINKS,
  SITE_TAGLINE,
  WHATSAPP_DISPLAY,
  WILAYA_COUNT,
} from "@/data/site";
import { getCategories } from "@/lib/storefrontData";
import { buildGenericMessage, buildWhatsAppUrl } from "@/lib/whatsapp";

type FooterProps = {
  logoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};

export default async function Footer({ logoUrl, instagramUrl, facebookUrl, tiktokUrl }: FooterProps = {}) {
  const categories = await getCategories();
  const year = new Date().getFullYear();
  const igUrl = instagramUrl || INSTAGRAM_URL;
  const fbUrl = facebookUrl || FACEBOOK_URL;

  return (
    <footer className="border-t border-gold/15 bg-ink mt-16">
      <div className="container-page py-12 grid gap-10 md:grid-cols-4">
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

        <div>
          <h3 className="font-display font-semibold text-gold mb-4">
            التصنيفات
          </h3>
          <ul className="space-y-2">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="text-sm text-cream-dim hover:text-gold transition-colors"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display font-semibold text-gold mb-4">
            معلومات التواصل
          </h3>
          <p className="text-sm text-cream-dim">واتساب: {WHATSAPP_DISPLAY}</p>
          <p className="text-sm text-cream-dim mt-2">
            توصيل سريع وآمن لـ {WILAYA_COUNT} ولاية عبر التراب الوطني.
          </p>
          <p className="text-sm text-cream-dim mt-2">
            الدفع عند الاستلام متاح في جميع الطلبات.
          </p>
        </div>
      </div>

      <div className="border-t border-gold/10">
        <div className="container-page py-5 text-xs text-cream-dim/80 text-center">
          © {year} Store DZ. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
}
