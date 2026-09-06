"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// إغلاق مهمة — الخدمة تُغلق بـCAS فالمكتملة مسبقًا تُرفض بـ404، ونعرض رسالة
// الخادم كما هي بدل تخمين محلي.

export default function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "تعذّر الإغلاق");
        return;
      }
      router.refresh();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={complete}
        disabled={saving}
        data-testid={`complete-task-${taskId}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
        إغلاق
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
