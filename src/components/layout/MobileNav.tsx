"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import { InstagramIcon, FacebookIcon, TiktokIcon } from "@/components/shared/SocialIcons";
import { buildGenericMessage } from "@/lib/whatsapp";

type NavLink = { href: string; label: string };

type MobileNavProps = {
  navLinks: readonly NavLink[];
  igUrl: string;
  fbUrl: string;
  tiktokUrl?: string | null;
};

// جزيرة تفاعلية معزولة — زر القائمة والدرج المنسدل فقط على الموبايل، بلا تأثير على
// حجم جافاسكريبت الهيدر الثابت على الشاشات الكبيرة (Header.tsx نفسه Server Component الآن).
export default function MobileNav({ navLinks, igUrl, fbUrl, tiktokUrl }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        className="md:hidden text-cream p-2"
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="md:hidden border-t border-gold/15 bg-black absolute top-full inset-x-0"
        >
          <nav className="container-page flex flex-col gap-4 py-4">
            <form action="/search" method="GET" className="flex items-center gap-2">
              <input
                type="search"
                name="q"
                placeholder="ابحث عن منتج..."
                className="flex-1 rounded-full bg-black/60 border border-gold/25 px-3 py-2 text-sm text-cream placeholder:text-cream-dim/80 focus:outline-none focus:border-gold"
              />
              <button type="submit" aria-label="بحث" className="text-gold p-2">
                <Search className="w-5 h-5" />
              </button>
            </form>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-cream-dim hover:text-gold transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center gap-4 pt-2">
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
            </div>
            <WhatsAppButton variant="inline" message={buildGenericMessage()} label="تواصل معنا عبر واتساب" />
          </nav>
        </div>
      )}
    </>
  );
}
