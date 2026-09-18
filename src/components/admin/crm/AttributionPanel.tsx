// لوحة العزو في صفحة الطلب — لقطة وقت الإنشاء كما هي (لا إعادة حساب).
// first-touch وlast-touch؛ الحقول الفارغة تُعرض «—» (غياب العزو حالة صريحة لا تخمين).

type Props = {
  order: {
    platform: string | null;
    creativeName: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    landingPath: string | null;
    campaignId: string | null;
    adSetId: string | null;
    adId: string | null;
    firstTouchPlatform: string | null;
    firstTouchUtmSource: string | null;
    firstTouchUtmCampaign: string | null;
  };
};

const v = (x: string | null) => x ?? "—";

export default function AttributionPanel({ order }: Props) {
  const hasAny = Boolean(order.platform || order.utmSource || order.firstTouchUtmSource || order.landingPath);
  const last: [string, string | null][] = [
    ["المنصة", order.platform],
    ["utm_source", order.utmSource],
    ["utm_medium", order.utmMedium],
    ["utm_campaign", order.utmCampaign],
    ["الإبداع (utm_content)", order.creativeName ?? order.utmContent],
    ["utm_term", order.utmTerm],
    ["campaign_id / adset_id / ad_id", [order.campaignId, order.adSetId, order.adId].map(v).join(" / ")],
    ["صفحة الهبوط", order.landingPath],
  ];
  const first: [string, string | null][] = [
    ["المنصة", order.firstTouchPlatform],
    ["utm_source", order.firstTouchUtmSource],
    ["utm_campaign", order.firstTouchUtmCampaign],
  ];
  return (
    <div className="gold-border bg-ink rounded-xl p-5 mt-6" data-testid="attribution-panel">
      <h2 className="font-display text-base font-bold text-cream mb-3">العزو التسويقي</h2>
      {!hasAny ? (
        <p className="text-sm text-cream-dim">بلا عزو — الزبون وصل بلا معلمات إعلانية (لا تخمين).</p>
      ) : (
        <div className="grid gap-4 text-xs sm:grid-cols-2">
          <dl className="space-y-1">
            <dt className="text-cream font-semibold mb-1">آخر لمسة (last-touch)</dt>
            {last.map(([k, val]) => (
              <div key={k} className="flex justify-between gap-3 text-cream-dim">
                <span>{k}</span>
                <span dir="ltr" className="text-cream" data-testid={"attr-" + k}>{v(val)}</span>
              </div>
            ))}
          </dl>
          <dl className="space-y-1">
            <dt className="text-cream font-semibold mb-1">أول لمسة (first-touch) — ثابتة</dt>
            {first.map(([k, val]) => (
              <div key={k} className="flex justify-between gap-3 text-cream-dim">
                <span>{k}</span>
                <span dir="ltr" className="text-cream" data-testid={"first-" + k}>{v(val)}</span>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
