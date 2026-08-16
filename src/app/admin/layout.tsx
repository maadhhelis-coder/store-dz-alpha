import type { Metadata } from "next";

// يمنع فهرسة كل ما تحت /admin (تسجيل الدخول + لوحة التحكم) في محركات البحث — يكمّل
// حظر robots.txt، ويغطي حالات محركات البحث التي تتجاهل robots.txt أحيانًا.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
