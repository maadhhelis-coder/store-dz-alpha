import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import CreativeAnalyticsDashboard from "@/components/admin/CreativeAnalyticsDashboard";
import AnalyticsTabs from "@/components/admin/AnalyticsTabs";

export default function AdminAnalyticsPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-6">التحليلات</h1>
      <AnalyticsTabs overview={<AnalyticsDashboard />} creativeAnalytics={<CreativeAnalyticsDashboard />} />
    </div>
  );
}
