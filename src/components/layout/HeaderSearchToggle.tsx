"use client";

import { useState } from "react";
import { Search } from "lucide-react";

// معزول كجزيرة تفاعلية صغيرة بدل جعل Header.tsx بأكمله "use client" — أغلب محتوى
// الهيدر (الشعار، الروابط، الأيقونات) ثابت بصريًا ولا يحتاج جافاسكريبت على المتصفح.
export default function HeaderSearchToggle() {
  const [searchOpen, setSearchOpen] = useState(false);

  if (searchOpen) {
    return (
      <form action="/search" method="GET" className="flex items-center">
        <input
          type="search"
          name="q"
          autoFocus
          placeholder="ابحث عن منتج..."
          onBlur={() => setSearchOpen(false)}
          className="w-40 lg:w-56 rounded-full bg-black/60 border border-gold/25 px-3 py-1.5 text-sm text-cream placeholder:text-cream-dim/80 focus:outline-none focus:border-gold transition-all"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      aria-label="بحث"
      className="text-cream-dim hover:text-gold transition-colors"
    >
      <Search className="w-5 h-5" />
    </button>
  );
}
