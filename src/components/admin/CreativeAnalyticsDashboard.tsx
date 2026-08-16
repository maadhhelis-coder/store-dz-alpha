"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import AdsAccountsSyncPanel from "./AdsAccountsSyncPanel";

type Platform = "facebook" | "instagram" | "tiktok";

const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

// نظام ألوان لطيف ومتناسق لكل منصة — يميّز الأقسام بصريًا بلا ما يطغى على هوية المتجر الذهبية.
const PLATFORM_STYLES: Record<Platform, { border: string; badge: string; dot: string }> = {
  facebook: { border: "border-t-[#4C8DFF]/70", badge: "bg-[#4C8DFF]/15 text-[#8AB4FF]", dot: "bg-[#4C8DFF]" },
  instagram: { border: "border-t-[#E1306C]/70", badge: "bg-[#E1306C]/15 text-[#F398B9]", dot: "bg-[#E1306C]" },
  tiktok: { border: "border-t-[#2DE0D9]/70", badge: "bg-[#2DE0D9]/15 text-[#8FF2ED]", dot: "bg-[#2DE0D9]" },
};

const PLATFORMS: Platform[] = ["facebook", "instagram", "tiktok"];

type CreativePerformance = {
  id: string;
  creativeName: string;
  ordersCount: number;
  confirmedCount: number;
  deliveredCount: number;
  conversionRate: number | null;
  confirmedRate: number;
  deliveredRate: number;
  clicks: number;
  spendDzd: number;
  costPerDelivered: number | null;
  revenueDzd: number;
  aovDzd: number | null;
};

type PlatformCreativeAnalytics = {
  platform: Platform;
  creatives: CreativePerformance[];
  overallConfirmedRate: number;
  overallDeliveredRate: number;
};

type ProductPageRow = {
  productSlug: string;
  productName: string;
  visits: number;
  bounceRate: number;
  ctaClicks: number;
  ctr: number;
  ordersCount: number;
  finalConversionRate: number;
  revenueDzd: number;
  aovDzd: number | null;
};

type PlatformProductAnalytics = { platform: Platform; rows: ProductPageRow[] };

type LandingPageRow = {
  funnelSlug: string;
  funnelTitle: string;
  visits: number;
  formSubmits: number;
  completionRate: number;
  abandonmentCount: number;
  abandonmentRate: number;
  formSubmissionRate: number;
  confirmedOrders: number;
  finalConversionRate: number;
  revenueDzd: number;
  aovDzd: number | null;
};

type PlatformLandingAnalytics = { platform: Platform; rows: LandingPageRow[] };

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

function fmtDzd(v: number | null): string {
  return v === null ? "—" : `${v.toLocaleString("ar-DZ-u-nu-latn")} دج`;
}

type StoreWideRates = {
  totalOrders: number;
  confirmedOrders: number;
  deliveredOrders: number;
  confirmationRate: number;
  deliveryRate: number;
};

export default function CreativeAnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [creativeAnalytics, setCreativeAnalytics] = useState<PlatformCreativeAnalytics[]>([]);
  const [productAnalytics, setProductAnalytics] = useState<PlatformProductAnalytics[]>([]);
  const [landingAnalytics, setLandingAnalytics] = useState<PlatformLandingAnalytics[]>([]);
  const [storeWide, setStoreWide] = useState<StoreWideRates | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [creativeRes, productRes, landingRes] = await Promise.all([
        fetch("/api/admin/creative-analytics").then((r) => r.json()),
        fetch("/api/admin/page-analytics?kind=product").then((r) => r.json()),
        fetch("/api/admin/page-analytics?kind=landing").then((r) => r.json()),
      ]);
      setCreativeAnalytics(creativeRes.platforms ?? []);
      setProductAnalytics(productRes.platforms ?? []);
      setLandingAnalytics(landingRes.platforms ?? []);
      setStoreWide(creativeRes.storeWide ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // جلب البيانات عند التحميل — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="p-12 text-center text-cream-dim">
        <Loader2 className="w-6 h-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <AdsAccountsSyncPanel />

      {storeWide && (
        <section>
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold text-gold">نظرة شاملة — كل المنصات وكل المنتجات معًا</h2>
            <p className="text-xs text-cream-dim/80 mt-1.5">
              مبنية على {storeWide.totalOrders} طلب إجمالي في المتجر، بلا أي تصفية حسب المنصة أو المنتج.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <OverallRateCard
              label="معدل تأكيد الطلبيات"
              rate={storeWide.confirmationRate}
              count={storeWide.confirmedOrders}
              total={storeWide.totalOrders}
              accent="text-[#8AB4FF]"
            />
            <OverallRateCard
              label="معدل توصيل الطلبيات"
              rate={storeWide.deliveryRate}
              count={storeWide.deliveredOrders}
              total={storeWide.totalOrders}
              accent="text-[#2DE0D9]"
            />
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          number="١"
          title="أداء الإعلانات حسب المنصة"
          description="لكل إعلان (Creative): عدد الطلبيات ونسبة التحويل، عدد المؤكدة ونسبتها، عدد المسلَّمة ونسبتها، المصروف، وتكلفة التسليم الحقيقية."
        />
        <div className="grid lg:grid-cols-3 gap-5">
          {PLATFORMS.map((platform) => (
            <AdPerformanceCard
              key={platform}
              platform={platform}
              data={creativeAnalytics.find((p) => p.platform === platform) ?? { platform, creatives: [], overallConfirmedRate: 0, overallDeliveredRate: 0 }}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          number="٢"
          title="تحليل صفحة المنتج"
          description="زيارات كل صفحة منتج، معدل الارتداد، نسبة النقر على «اطلب الآن»، ومعدل التحويل النهائي — لكل منصة."
        />
        <div className="grid lg:grid-cols-3 gap-5">
          {PLATFORMS.map((platform) => (
            <ProductPageCard
              key={platform}
              platform={platform}
              rows={productAnalytics.find((p) => p.platform === platform)?.rows ?? []}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          number="٣"
          title="تحليل صفحة الهبوط"
          description="زيارات كل صفحة هبوط، معدل إكمال الطلب، معدل التخلي، معدل إرسال النموذج، ومعدل التحويل النهائي — لكل منصة."
        />
        <div className="grid lg:grid-cols-3 gap-5">
          {PLATFORMS.map((platform) => (
            <LandingPageCard
              key={platform}
              platform={platform}
              rows={landingAnalytics.find((p) => p.platform === platform)?.rows ?? []}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-lg font-bold text-gold flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full gold-gradient text-ink text-sm font-bold">
          {number}
        </span>
        {title}
      </h2>
      <p className="text-xs text-cream-dim/80 mt-1.5 leading-relaxed">{description}</p>
    </div>
  );
}

function OverallRateCard({
  label,
  rate,
  count,
  total,
  accent,
}: {
  label: string;
  rate: number;
  count: number;
  total: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl gold-border bg-ink p-6 text-center space-y-1">
      <div className={cn("text-4xl font-bold", accent)}>{rate}%</div>
      <div className="text-sm text-cream font-semibold">{label}</div>
      <div className="text-xs text-cream-dim/80">
        {count} من {total} طلب
      </div>
    </div>
  );
}

function PlatformCardShell({ platform, children }: { platform: Platform; children: React.ReactNode }) {
  const style = PLATFORM_STYLES[platform];
  return (
    <div className={cn("rounded-xl gold-border bg-ink border-t-4 p-4 space-y-4", style.border)}>
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", style.dot)} />
        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", style.badge)}>
          {PLATFORM_LABELS[platform]}
        </span>
      </div>
      {children}
    </div>
  );
}

function AdPerformanceCard({
  platform,
  data,
}: {
  platform: Platform;
  data: PlatformCreativeAnalytics;
}) {
  return (
    <PlatformCardShell platform={platform}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] min-w-[560px]">
          <thead>
            <tr className="text-cream-dim border-b border-gold/10">
              <th scope="col" className="text-start p-1.5">الإعلان</th>
              <th scope="col" className="text-start p-1.5">شحال جاب</th>
              <th scope="col" className="text-start p-1.5">شحال تاكدت</th>
              <th scope="col" className="text-start p-1.5">شحال تسلمت</th>
              <th scope="col" className="text-start p-1.5">صرفنا</th>
              <th scope="col" className="text-start p-1.5">كوست تسليم</th>
              <th scope="col" className="text-start p-1.5">الإيراد</th>
              <th scope="col" className="text-start p-1.5">متوسط الطلب</th>
            </tr>
          </thead>
          <tbody>
            {data.creatives.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-cream-dim/80">
                  لا توجد بيانات بعد
                </td>
              </tr>
            ) : (
              data.creatives.map((c) => (
                <tr key={c.id} className="border-b border-gold/5 last:border-0">
                  <td className="p-1.5 text-cream font-semibold whitespace-nowrap">{c.creativeName}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {c.ordersCount} <span className="text-cream-dim/50">({fmtPct(c.conversionRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {c.confirmedCount} <span className="text-cream-dim/50">({fmtPct(c.confirmedRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {c.deliveredCount} <span className="text-cream-dim/50">({fmtPct(c.deliveredRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(c.spendDzd)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(c.costPerDelivered)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(c.revenueDzd)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(c.aovDzd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PlatformCardShell>
  );
}

function ProductPageCard({ platform, rows }: { platform: Platform; rows: ProductPageRow[] }) {
  return (
    <PlatformCardShell platform={platform}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] min-w-[520px]">
          <thead>
            <tr className="text-cream-dim border-b border-gold/10">
              <th scope="col" className="text-start p-1.5">المنتج</th>
              <th scope="col" className="text-start p-1.5">الزيارات</th>
              <th scope="col" className="text-start p-1.5">الارتداد</th>
              <th scope="col" className="text-start p-1.5">CTR</th>
              <th scope="col" className="text-start p-1.5">تحويل نهائي</th>
              <th scope="col" className="text-start p-1.5">الإيراد</th>
              <th scope="col" className="text-start p-1.5">متوسط الطلب</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-cream-dim/80">
                  لا توجد زيارات مسجّلة بعد
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.productSlug} className="border-b border-gold/5 last:border-0">
                  <td className="p-1.5 text-cream font-semibold whitespace-nowrap">{r.productName}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{r.visits}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtPct(r.bounceRate)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {r.ctaClicks} <span className="text-cream-dim/50">({fmtPct(r.ctr)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {r.ordersCount} <span className="text-cream-dim/50">({fmtPct(r.finalConversionRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(r.revenueDzd)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(r.aovDzd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PlatformCardShell>
  );
}

function LandingPageCard({ platform, rows }: { platform: Platform; rows: LandingPageRow[] }) {
  return (
    <PlatformCardShell platform={platform}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] min-w-[620px]">
          <thead>
            <tr className="text-cream-dim border-b border-gold/10">
              <th scope="col" className="text-start p-1.5">الصفحة</th>
              <th scope="col" className="text-start p-1.5">الزيارات</th>
              <th scope="col" className="text-start p-1.5">إكمال</th>
              <th scope="col" className="text-start p-1.5">تخلٍّ</th>
              <th scope="col" className="text-start p-1.5">إرسال نموذج</th>
              <th scope="col" className="text-start p-1.5">تحويل نهائي</th>
              <th scope="col" className="text-start p-1.5">الإيراد</th>
              <th scope="col" className="text-start p-1.5">متوسط الطلب</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-cream-dim/80">
                  لا توجد زيارات مسجّلة بعد
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.funnelSlug} className="border-b border-gold/5 last:border-0">
                  <td className="p-1.5 text-cream font-semibold whitespace-nowrap">{r.funnelTitle}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{r.visits}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {r.formSubmits} <span className="text-cream-dim/50">({fmtPct(r.completionRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {r.abandonmentCount} <span className="text-cream-dim/50">({fmtPct(r.abandonmentRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtPct(r.formSubmissionRate)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">
                    {r.confirmedOrders} <span className="text-cream-dim/50">({fmtPct(r.finalConversionRate)})</span>
                  </td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(r.revenueDzd)}</td>
                  <td className="p-1.5 text-cream-dim whitespace-nowrap">{fmtDzd(r.aovDzd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PlatformCardShell>
  );
}
